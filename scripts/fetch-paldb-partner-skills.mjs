import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const source = "https://paldb.cc/cn/Partner_Skill";
const activeSource = "https://paldb.cc/cn/Active_Skills";
const output = resolve("scripts/vendor/paldb/partner-skills.zh-Hans.json");
const activeOutput = resolve("scripts/vendor/paldb/active-skill-overrides.zh-Hans.json");

function text(value) {
  return value
    .replace(/\{ReferenceMsgId_[^}]+\}/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&#(x?[0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code.replace(/^x/i, ""), /^x/i.test(code) ? 16 : 10)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const response = await fetch(source);
if (!response.ok) throw new Error(`PalDB request failed: ${response.status}`);
const html = await response.text();
const cards = html.split('<div class="col"><div class="card itemPopup">').slice(1);
const entries = [];

for (const card of cards) {
  const id = card.match(/PalIcon\/Normal\/T_(.+?)_icon_normal\.webp/)?.[1];
  const palName = card.match(/class="itemname"[^>]*>(.*?)<\/a>/s)?.[1];
  const dexNo = card.match(/class="text-white-50"[^>]*>#([^<]+)<\/span>/)?.[1];
  const name = card.match(/border-left: solid white[^>]*><span[^>]*>(.*?)<\/span>\s*Lv\.1/s)?.[1];
  const description = [...card.matchAll(/<div class="flex-grow-1 ms-2">\s*([\s\S]*?)\s*<\/div>/g)].at(-1)?.[1];
  if (!id || !palName || !dexNo || !name || !description) continue;
  entries.push({
    palId: id,
    dexNo: text(dexNo),
    palName: text(palName),
    name: text(name),
    description: text(description),
  });
}

if (entries.length !== 288) {
  throw new Error(`Expected 288 player-facing partner-skill cards, parsed ${entries.length}`);
}
if (new Set(entries.map((entry) => entry.palId)).size !== entries.length) {
  throw new Error("Duplicate Pal internal IDs in PalDB partner-skill snapshot");
}

const snapshot = {
  source,
  fetchedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  sourceSha256: createHash("sha256").update(html).digest("hex"),
  entries,
};

const activeResponse = await fetch(activeSource);
if (!activeResponse.ok) throw new Error(`PalDB active-skill request failed: ${activeResponse.status}`);
const activeHtml = await activeResponse.text();
const activeIds = new Map([
  ["巨石压顶", "Unique_CubeTurtle_CubePress"],
  ["圣石压顶", "Unique_CubeTurtle_Neutral_HolyPress"],
]);
const activeEntries = [...activeIds].map(([name, id]) => {
  const start = activeHtml.indexOf(`>${name}</a>`);
  const card = activeHtml.slice(start, activeHtml.indexOf('</div></div><div class="col">', start));
  const description = card.match(/<div class="card-body">([\s\S]*?)<\/div>/)?.[1];
  if (start < 0 || !description) throw new Error(`Missing PalDB active-skill text: ${name}`);
  return { id, name, description: text(description) };
});
const activeSnapshot = {
  source: activeSource,
  fetchedAt: snapshot.fetchedAt,
  sourceSha256: createHash("sha256").update(activeHtml).digest("hex"),
  entries: activeEntries,
};
await mkdir(resolve("scripts/vendor/paldb"), { recursive: true });
await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`);
await writeFile(activeOutput, `${JSON.stringify(activeSnapshot, null, 2)}\n`);
console.log(`Saved ${entries.length} partner-skill texts and ${activeEntries.length} active-skill overrides`);
