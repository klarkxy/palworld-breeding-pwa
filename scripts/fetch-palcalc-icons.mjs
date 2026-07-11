import { execFile } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const paldexPath = resolve(root, "public/data/paldex.json");
const iconsDir = resolve(root, "public/icons");
const repo = "tylercamp/palcalc";
const release = "v1.17.2";
const ref = "b5e13e90fedc2e95d54fa223da77be464c313001";
const pngSignature = "89504e470d0a1a0a";

async function gh(endpoint) {
  const { stdout } = await execFileAsync("gh", ["api", endpoint], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

function validatePng(bytes, label) {
  if (bytes.subarray(0, 8).toString("hex") !== pngSignature) {
    throw new Error(`${label}: invalid PNG signature`);
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== 100 || height !== 100) {
    throw new Error(`${label}: expected 100x100, got ${width}x${height}`);
  }
}

async function mapLimit(items, limit, task) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await task(item);
    }
  });
  await Promise.all(workers);
}

const paldex = JSON.parse(await readFile(paldexPath, "utf8"));
if (!Array.isArray(paldex.pals)) throw new Error("paldex.json has no pals array");

const tree = await gh(`repos/${repo}/git/trees/${ref}?recursive=1`);
if (tree.truncated) throw new Error("Git tree response was truncated");

const resources = tree.tree.filter(
  (entry) => entry.type === "blob"
    && entry.path.startsWith("PalCalc.UI/Resources/Pals/")
    && entry.path.endsWith(".png"),
);
const byEnglishName = new Map(
  resources.map((entry) => [basename(entry.path, ".png"), entry]),
);

const mappings = [];
const missing = [];
for (const pal of paldex.pals) {
  const entry = byEnglishName.get(pal.names?.en);
  if (entry) mappings.push({ id: pal.id, englishName: pal.names.en, sha: entry.sha });
  else missing.push({ id: pal.id, englishName: pal.names?.en ?? "" });
}

const blobs = new Map();
for (const mapping of mappings) {
  const ids = blobs.get(mapping.sha) ?? [];
  ids.push(mapping);
  blobs.set(mapping.sha, ids);
}

await mkdir(iconsDir, { recursive: true });
let totalBytes = 0;
await mapLimit([...blobs.entries()], 12, async ([sha, targets]) => {
  const blob = await gh(`repos/${repo}/git/blobs/${sha}`);
  if (blob.encoding !== "base64") throw new Error(`${sha}: unsupported ${blob.encoding} blob`);
  const bytes = Buffer.from(blob.content.replace(/\s/g, ""), "base64");
  validatePng(bytes, targets[0].englishName);
  totalBytes += bytes.length;

  await Promise.all(targets.map(async ({ id }) => {
    const output = resolve(iconsDir, `${id}.png`);
    const temporary = `${output}.tmp`;
    await writeFile(temporary, bytes);
    await rm(output, { force: true });
    await rename(temporary, output);
  }));
});

console.log(`PalCalc ${release} (${ref}): ${resources.length} source icons, ${blobs.size} unique blobs`);
console.log(`Wrote ${mappings.length}/${paldex.pals.length} ID-named PNGs (${totalBytes} source bytes)`);
if (missing.length) {
  console.log(`Missing ${missing.length} exact English-name mappings:`);
  for (const item of missing) console.log(`- ${item.id}: ${item.englishName}`);
}
