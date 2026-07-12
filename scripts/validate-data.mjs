import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dataDir = resolve(root, "public/data");
const readJson = async (name) => JSON.parse(await readFile(resolve(dataDir, name), "utf8"));
const digest = async (name) => createHash("sha256").update(await readFile(resolve(dataDir, name))).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const [manifest, breeding, paldex, skills] = await Promise.all([
  readJson("manifest.json"), readJson("breeding.json"), readJson("paldex.json"), readJson("skills.json"),
]);
const pals = paldex.pals;
const rules = breeding.rules;
const activeSkills = skills.activeSkills;
const partnerSkills = skills.partnerSkills;
assert(pals.length === 306, `Expected 306 Pals, got ${pals.length}`);
assert(rules.length === 46_972, `Expected 46972 rules, got ${rules.length}`);
assert(activeSkills.length === 320, `Expected 320 active skills, got ${activeSkills.length}`);
assert(partnerSkills.length === 288, `Expected 288 partner skills, got ${partnerSkills.length}`);
assert(JSON.stringify(breeding.pals) === JSON.stringify(pals), "Paldex and breeding Pal records differ");

const palIds = new Set(pals.map((pal) => pal.id));
const ruleIds = new Set(rules.map((rule) => rule.id));
const selectableIds = new Set(pals.filter((pal) => pal.selectable).map((pal) => pal.id));
const activeById = new Map(activeSkills.map((skill) => [skill.id, skill]));
const partnerById = new Map(partnerSkills.map((skill) => [skill.id, skill]));
assert(palIds.size === pals.length, "Duplicate Pal ID");
assert(ruleIds.size === rules.length, "Duplicate rule ID");
assert(activeById.size === activeSkills.length, "Duplicate active-skill ID");
assert(partnerById.size === partnerSkills.length, "Duplicate partner-skill ID");
assert(selectableIds.size === 288, `Expected 288 selectable Pals, got ${selectableIds.size}`);
for (const skill of activeSkills) {
  assert(skill.names?.zh && skill.names?.en, `Missing active-skill name: ${skill.id}`);
  assert(typeof skill.element === "string", `Invalid active-skill element: ${skill.id}`);
  assert(Number.isFinite(skill.power), `Invalid active-skill power: ${skill.id}`);
  assert(Number.isFinite(skill.cooldownSeconds), `Invalid active-skill cooldown: ${skill.id}`);
  assert(typeof skill.canInherit === "boolean" && typeof skill.hasSkillFruit === "boolean",
    `Invalid active-skill flags: ${skill.id}`);
}
const missingActiveDescriptions = activeSkills.filter((skill) => !skill.description?.zh).map((skill) => skill.id).sort();
assert(JSON.stringify(missingActiveDescriptions) === JSON.stringify(["PredatorBeam", "PredatorLockon", "PredatorWave"]),
  `Unexpected active-skill description gaps: ${missingActiveDescriptions.join(", ")}`);
for (const skill of partnerSkills)
  assert(skill.name && skill.description, `Incomplete partner skill: ${skill.id}`);
const ruleSignatures = new Set();
const placeholderIds = new Set();
const iconHash = createHash("sha256");
const palsById = [...pals].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
for (const pal of palsById) {
  assert(Number.isFinite(pal.dexNo), `Invalid dex number: ${pal.id}`);
  assert(Number.isFinite(pal.maleProbability), `Invalid gender probability: ${pal.id}`);
  assert(pal.icon === `/icons/${pal.id}.png` || (!pal.selectable && pal.icon === `/icons/${pal.id}.svg`),
    `Unexpected icon path: ${pal.id}`);
  const iconPath = resolve(root, "public", pal.icon.slice(1));
  await access(iconPath);
  iconHash.update(basename(iconPath));
  iconHash.update("\0");
  iconHash.update(await readFile(iconPath));
  if (pal.icon.endsWith(".png")) {
    const icon = await readFile(iconPath);
    assert(icon.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `Invalid PNG: ${pal.id}`);
    assert(icon.readUInt32BE(16) === 100 && icon.readUInt32BE(20) === 100, `Expected 100x100 icon: ${pal.id}`);
  } else {
    placeholderIds.add(pal.id);
  }
  assert(Array.isArray(pal.activeSkillRefs), `Missing active-skill references: ${pal.id}`);
  assert(new Set(pal.activeSkillRefs.map((ref) => ref.id)).size === pal.activeSkillRefs.length,
    `Duplicate active-skill reference: ${pal.id}`);
  assert(pal.activeSkillRefs.every((ref, index, refs) => Number.isInteger(ref.level)
    && ref.level >= 1 && ref.level <= 70 && (index === 0
      || refs[index - 1].level < ref.level
      || (refs[index - 1].level === ref.level && refs[index - 1].id <= ref.id))),
  `Invalid or unordered active-skill levels: ${pal.id}`);
  assert(pal.activeSkills.length === pal.activeSkillRefs.length, `Active-skill compatibility list mismatch: ${pal.id}`);
  for (const [index, ref] of pal.activeSkillRefs.entries()) {
    const skill = activeById.get(ref.id);
    assert(skill, `Pal ${pal.id} references missing active skill: ${ref.id}`);
    assert(pal.activeSkills[index] === skill.names.zh, `Active-skill name mismatch: ${pal.id}/${ref.id}`);
    if (pal.selectable)
      assert(skill.description?.zh, `Visible Pal ${pal.id} has undocumented active skill: ${ref.id}`);
  }
  if (pal.selectable)
    assert(partnerById.has(pal.partnerSkillId), `Pal ${pal.id} references missing partner skill: ${pal.partnerSkillId}`);
}
assert(pals.every((pal) => typeof pal.partnerSkill === "string" && pal.partnerSkill.length > 0),
  "Expected partner-skill title coverage for every Pal");
const emptyVisibleSkillSets = pals.filter((pal) => pal.selectable && pal.activeSkills.length === 0)
  .map((pal) => pal.id).sort();
assert(JSON.stringify(emptyVisibleSkillSets) === JSON.stringify([
  "GhostAnglerfish", "GhostAnglerfish_Fire", "LazyCatfish", "LazyCatfish_Gold",
]), `Unexpected empty active-skill sets: ${emptyVisibleSkillSets.join(", ")}`);
assert(JSON.stringify([...placeholderIds].sort()) === JSON.stringify(["BlackFurDragon", "POLICE_HawkBird", "POLICE_ThunderDog"]),
  `Unexpected placeholder icons: ${[...placeholderIds].join(", ")}`);
for (const rule of rules) {
  for (const key of ["parentA", "parentB", "child"])
    assert(palIds.has(rule[key]), `Rule ${rule.id} references missing ${key}: ${rule[key]}`);
  assert(rule.allowedSexPairs.length > 0, `Rule ${rule.id} has no sex pair`);
  for (const pair of rule.allowedSexPairs)
    assert(["M", "F"].includes(pair.a) && ["M", "F"].includes(pair.b) && pair.a !== pair.b,
      `Rule ${rule.id} has invalid sex pair`);
  const signature = JSON.stringify([rule.parentA, rule.parentB, rule.child, rule.allowedSexPairs]);
  assert(!ruleSignatures.has(signature), `Duplicate logical rule: ${rule.id}`);
  ruleSignatures.add(signature);
}
const usableRules = rules.filter((rule) =>
  selectableIds.has(rule.parentA) && selectableIds.has(rule.parentB) && selectableIds.has(rule.child));
assert(usableRules.length === 41_550, `Expected 41550 usable rules, got ${usableRules.length}`);
assert(manifest.counts.pals === pals.length, "Manifest Pal count mismatch");
assert(manifest.counts.rules === rules.length, "Manifest rule count mismatch");
assert(manifest.counts.selectablePals === selectableIds.size, "Manifest selectable Pal count mismatch");
assert(manifest.counts.usableRules === usableRules.length, "Manifest usable rule count mismatch");
assert(manifest.counts.icons === pals.length, "Manifest icon count mismatch");
assert(manifest.counts.gameIcons === 303 && manifest.counts.placeholderIcons === 3, "Manifest icon source counts mismatch");
assert(manifest.counts.activeSkills === activeSkills.length, "Manifest active-skill count mismatch");
assert(manifest.counts.partnerSkills === partnerSkills.length, "Manifest partner-skill count mismatch");
assert(manifest.checksums.breeding === await digest("breeding.json"), "Breeding checksum mismatch");
assert(manifest.checksums.paldex === await digest("paldex.json"), "Paldex checksum mismatch");
assert(manifest.checksums.skills === await digest("skills.json"), "Skills checksum mismatch");
assert(manifest.checksums.icons === iconHash.digest("hex"), "Icon bundle checksum mismatch");
assert(manifest.dataVersion.endsWith("-skills1"), `Unexpected data version: ${manifest.dataVersion}`);
for (const [name, file] of [["activeSkillOverrides", "active-skill-overrides.zh-Hans.json"], ["partnerSkills", "partner-skills.zh-Hans.json"]]) {
  const path = resolve(root, "scripts/vendor/paldb", file);
  const snapshot = JSON.parse(await readFile(path, "utf8"));
  const snapshotHash = createHash("sha256").update(await readFile(path)).digest("hex");
  assert(manifest.sources.paldb[name].sourceSha256 === snapshot.sourceSha256, `PalDB ${name} source hash mismatch`);
  assert(manifest.sources.paldb[name].snapshotSha256 === snapshotHash, `PalDB ${name} snapshot hash mismatch`);
}
console.log(`Validated ${pals.length} Pals, ${rules.length} rules, ${activeSkills.length} active skills, ${partnerSkills.length} partner skills, and ${manifest.counts.icons} icons.`);
