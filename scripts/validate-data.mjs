import { createHash } from "node:crypto";
import { access, readdir, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { validateChestDropSnapshot } from "./import-chest-drops.mjs";
import { validateItemDropSnapshot } from "./import-item-drops.mjs";
import { validatePublicItemData } from "./import-item-snapshot.mjs";

const root = resolve(import.meta.dirname, "..");
const dataDir = resolve(root, "public/data");
const readJson = async (name) => JSON.parse(await readFile(resolve(dataDir, name), "utf8"));
const normalizeText = (contents) => contents.toString("utf8").replace(/\r\n/g, "\n");
const digestText = (contents) => createHash("sha256")
  .update(normalizeText(contents))
  .digest("hex");
const digest = async (name) => digestText(await readFile(resolve(dataDir, name)));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

function validateMergedChestDrops(document, snapshot, itemIds) {
  const poolsById = new Map(snapshot.pools.map((pool) => [pool.id, pool]));
  const entriesById = new Map(snapshot.entries.map((entry) => [entry.id, entry]));
  const summariesByKey = new Map(snapshot.summary.map((summary) => [
    `${summary.poolId}\0${summary.itemId}`, summary,
  ]));
  const physicalSourcesByField = new Map();
  for (const source of snapshot.sources) {
    const records = physicalSourcesByField.get(source.fieldName) ?? [];
    records.push(source);
    physicalSourcesByField.set(source.fieldName, records);
  }
  assert(Array.isArray(document.chestDrops) && document.chestDrops.length === 3_504,
    "Expected 3504 merged chest-drop edges");
  assert(Array.isArray(document.chestSources) && document.chestSources.length === 109,
    "Expected 109 field-level chest sources");
  assert(JSON.stringify(document.chestSource) === JSON.stringify(snapshot.source),
    "Public chest source metadata differs from normalized snapshot");

  const publicSourcesByField = new Map();
  for (const source of document.chestSources) {
    assert(!publicSourcesByField.has(source.fieldName), `Duplicate public chest field: ${source.fieldName}`);
    publicSourcesByField.set(source.fieldName, source);
    const pools = snapshot.pools.filter((pool) => pool.fieldName === source.fieldName);
    const physicalSources = physicalSourcesByField.get(source.fieldName) ?? [];
    assert(pools.length > 0 && physicalSources.length > 0, `Unknown public chest field: ${source.fieldName}`);
    assert(source.id === `field:${source.fieldName}`, `Invalid public chest source ID: ${source.id}`);
    assert(source.probabilityBasis === "conditionalOnGrade" && source.gradeDistributionKnown === false,
      `Chest source must remain grade-conditional: ${source.id}`);
    assert(source.sourceKind === pools[0].sourceKind && source.labelZh === pools[0].labelZh
      && source.sourceLabel === pools[0].labelZh, `Chest source presentation mismatch: ${source.id}`);
    assert(JSON.stringify(source.poolIds) === JSON.stringify(pools.map((pool) => pool.id).sort()),
      `Chest source pool references mismatch: ${source.id}`);
    assert(JSON.stringify(source.sourceRefs)
      === JSON.stringify(physicalSources.map((entry) => entry.id).sort()),
    `Chest source physical references mismatch: ${source.id}`);
  }

  const seen = new Set();
  for (const drop of document.chestDrops) {
    const key = `${drop.poolId}\0${drop.itemId}`;
    assert(!seen.has(key), `Duplicate public chest drop: ${key}`);
    seen.add(key);
    const summary = summariesByKey.get(key);
    const pool = poolsById.get(drop.poolId);
    const source = publicSourcesByField.get(drop.fieldName);
    assert(summary && pool && source, `Unknown public chest drop: ${key}`);
    assert(itemIds.has(drop.itemId), `Unknown chest-drop item: ${drop.itemId}`);
    assert(drop.sourceId === source.id && drop.fieldName === pool.fieldName
      && drop.sourceKind === pool.sourceKind && drop.sourceLabel === pool.labelZh
      && drop.labelZh === pool.labelZh, `Chest drop source mismatch: ${key}`);
    assert(JSON.stringify(drop.sourceIds) === JSON.stringify(source.sourceRefs),
      `Chest drop physical source references mismatch: ${key}`);
    assert(drop.slot === 0 && drop.probabilityBasis === "conditionalOnGrade",
      `Chest drop probability basis mismatch: ${key}`);
    assert(drop.conditionalOnGradeChancePercent === summary.conditionalOnGradeChancePercent
      && drop.expectedQuantityPerOpen === summary.expectedQuantityPerOpen,
    `Chest drop probability mismatch: ${key}`);
    assert(drop.treasureBoxGrade === pool.treasureBoxGrade
      && drop.treasureGrade === pool.treasureBoxGrade, `Chest drop grade mismatch: ${key}`);
    assert(JSON.stringify(drop.variantIds) === JSON.stringify(summary.variantIds)
      && JSON.stringify(drop.slotContributions) === JSON.stringify(summary.slotContributions),
    `Chest drop variant trace mismatch: ${key}`);
    const variants = summary.variantIds.map((id) => entriesById.get(id));
    assert(variants.every((entry) => entry && entry.poolId === drop.poolId && entry.itemId === drop.itemId),
      `Chest drop has invalid variants: ${key}`);
    const maximumBySlot = new Map();
    for (const entry of variants)
      maximumBySlot.set(entry.slot, Math.max(maximumBySlot.get(entry.slot) ?? 0, entry.maxQuantity));
    assert(drop.minQuantity === Math.min(...variants.map((entry) => entry.minQuantity))
      && drop.maxQuantity === [...maximumBySlot.values()].reduce((sum, value) => sum + value, 0),
    `Chest drop quantity range mismatch: ${key}`);
  }
  assert(seen.size === summariesByKey.size, "Public chest drops do not cover every pool/item summary");
  return {
    fields: publicSourcesByField.size,
    pools: poolsById.size,
    entries: entriesById.size,
    edges: seen.size,
    items: new Set(document.chestDrops.map((drop) => drop.itemId)).size,
    sources: snapshot.sources.length,
  };
}

const [manifest, breeding, paldex, skills, itemDocument, recipeDocument, itemDropDocument] = await Promise.all([
  readJson("manifest.json"), readJson("breeding.json"), readJson("paldex.json"), readJson("skills.json"),
  readJson("items.json"), readJson("recipes.json"), readJson("item-drops.json"),
]);
const pals = paldex.pals;
const rules = breeding.rules;
const activeSkills = skills.activeSkills;
const partnerSkills = skills.partnerSkills;
const passiveSkills = skills.passiveSkills;
assert(pals.length === 306, `Expected 306 Pals, got ${pals.length}`);
assert(rules.length === 46_972, `Expected 46972 rules, got ${rules.length}`);
assert(activeSkills.length === 320, `Expected 320 active skills, got ${activeSkills.length}`);
assert(partnerSkills.length === 288, `Expected 288 partner skills, got ${partnerSkills.length}`);
assert(passiveSkills.length === 115, `Expected 115 passive skills, got ${passiveSkills.length}`);
assert(JSON.stringify(breeding.pals) === JSON.stringify(pals), "Paldex and breeding Pal records differ");

const palIds = new Set(pals.map((pal) => pal.id));
const ruleIds = new Set(rules.map((rule) => rule.id));
const selectableIds = new Set(pals.filter((pal) => pal.selectable).map((pal) => pal.id));
const activeById = new Map(activeSkills.map((skill) => [skill.id, skill]));
const partnerById = new Map(partnerSkills.map((skill) => [skill.id, skill]));
const passiveById = new Map(passiveSkills.map((skill) => [skill.id, skill]));
const movementFields = [
  "slowWalkSpeed", "walkSpeed", "runSpeed", "rideSprintSpeed",
  "transportSpeed", "swimSpeed", "swimDashSpeed",
];
const movementTypes = new Set(["ground", "fly", "flyAndLanding", "swim"]);
assert(palIds.size === pals.length, "Duplicate Pal ID");
assert(ruleIds.size === rules.length, "Duplicate rule ID");
assert(activeById.size === activeSkills.length, "Duplicate active-skill ID");
assert(partnerById.size === partnerSkills.length, "Duplicate partner-skill ID");
assert(passiveById.size === passiveSkills.length, "Duplicate passive-skill ID");
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
const passiveRankCounts = new Map([[-3, 3], [-2, 2], [-1, 10], [1, 36], [2, 2], [3, 31], [4, 24], [5, 7]]);
for (const skill of passiveSkills) {
  assert(skill.names?.zh && skill.names?.en, `Missing passive-skill name: ${skill.id}`);
  assert(skill.description?.zh && skill.description?.en, `Missing passive-skill description: ${skill.id}`);
  assert(Number.isInteger(skill.rank) && passiveRankCounts.has(skill.rank), `Invalid passive-skill rank: ${skill.id}`);
  assert(typeof skill.randomlyAvailable === "boolean", `Invalid passive-skill random flag: ${skill.id}`);
  assert(Number.isInteger(skill.randomWeight) && [5, 100].includes(skill.randomWeight),
    `Invalid passive-skill random weight: ${skill.id}`);
  assert(Number.isInteger(skill.surgeryCost) && skill.surgeryCost >= 0,
    `Invalid passive-skill surgery cost: ${skill.id}`);
  assert(skill.surgeryItem === undefined || (typeof skill.surgeryItem === "string" && skill.surgeryItem.length > 0),
    `Invalid passive-skill surgery item: ${skill.id}`);
  assert(Array.isArray(skill.guaranteedBy), `Missing guaranteed Pal list: ${skill.id}`);
  assert(new Set(skill.guaranteedBy).size === skill.guaranteedBy.length,
    `Duplicate guaranteed Pal: ${skill.id}`);
  assert(skill.guaranteedBy.every((palId) => selectableIds.has(palId)),
    `Hidden or missing guaranteed Pal: ${skill.id}`);
}
for (const [rank, count] of passiveRankCounts)
  assert(passiveSkills.filter((skill) => skill.rank === rank).length === count,
    `Unexpected passive-skill rank ${rank} count`);
assert(passiveSkills.filter((skill) => skill.randomlyAvailable).length === 85,
  "Unexpected randomly available passive-skill count");
assert(passiveSkills.filter((skill) => skill.surgeryCost > 0).length === 33,
  "Unexpected surgery-supported passive-skill count");
assert(passiveSkills.filter((skill) => skill.surgeryItem).length === 35,
  "Unexpected passive-skill surgery-item count");
assert(passiveSkills.filter((skill) => skill.guaranteedBy.length > 0).length === 23,
  "Unexpected guaranteed passive-skill count");
assert(passiveSkills.reduce((total, skill) => total + skill.guaranteedBy.length, 0) === 53,
  "Unexpected guaranteed passive assignment count");
const ruleSignatures = new Set();
const placeholderIds = new Set();
const iconHash = createHash("sha256");
const palsById = [...pals].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
for (const pal of palsById) {
  assert(Number.isFinite(pal.dexNo), `Invalid dex number: ${pal.id}`);
  assert(Number.isFinite(pal.maleProbability), `Invalid gender probability: ${pal.id}`);
  assert(pal.movement && movementFields.every((field) => Number.isFinite(pal.movement[field])),
    `Invalid movement data: ${pal.id}`);
  assert(!pal.selectable || movementTypes.has(pal.movement.type), `Missing movement type: ${pal.id}`);
  assert((pal.movement.flySpeedOverride !== undefined) === (pal.movement.flySprintSpeedOverride !== undefined),
    `Unpaired fly-speed override: ${pal.id}`);
  if (pal.movement.flySpeedOverride !== undefined) {
    assert(Number.isFinite(pal.movement.flySpeedOverride) && Number.isFinite(pal.movement.flySprintSpeedOverride),
      `Invalid fly-speed override: ${pal.id}`);
  }
  assert(pal.icon === `/icons/${pal.id}.png` || (!pal.selectable && pal.icon === `/icons/${pal.id}.svg`),
    `Unexpected icon path: ${pal.id}`);
  const iconPath = resolve(root, "public", pal.icon.slice(1));
  await access(iconPath);
  iconHash.update(basename(iconPath));
  iconHash.update("\0");
  const iconBytes = await readFile(iconPath);
  iconHash.update(pal.icon.endsWith(".svg") ? normalizeText(iconBytes) : iconBytes);
  if (pal.icon.endsWith(".png")) {
    const icon = iconBytes;
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
  if (pal.selectable) {
    const refinement = pal.refinement;
    assert(refinement, `Missing refinement data: ${pal.id}`);
    assert(["table", "constant", "blueprint"].includes(refinement.sourceKind), `Invalid refinement source: ${pal.id}`);
    assert(refinement.zeroStar.stars === 0 && refinement.zeroStar.partnerSkillLevel === 1
      && refinement.zeroStar.consumedCopies === 0 && refinement.zeroStar.statMultiplier === 1,
    `Invalid zero-star refinement: ${pal.id}`);
    assert(refinement.fourStar.stars === 4 && refinement.fourStar.partnerSkillLevel === 5
      && refinement.fourStar.consumedCopies === 48 && refinement.fourStar.statMultiplier === 1.2,
    `Invalid four-star refinement: ${pal.id}`);
    assert(refinement.fourStar.metrics.length > 0, `Missing four-star partner effect: ${pal.id}`);
    assert(JSON.stringify(Object.keys(refinement.zeroStar.workSuitability))
      === JSON.stringify(Object.keys(refinement.fourStar.workSuitability)), `Work-suitability keys changed: ${pal.id}`);
    assert(Object.values(refinement.fourStar.workSuitability).every((level) => Number.isInteger(level)
      && level > 0 && level <= 10), `Invalid four-star work suitability: ${pal.id}`);
  } else {
    assert(pal.refinement === undefined, `Hidden Pal unexpectedly has refinement data: ${pal.id}`);
  }
}
assert(pals.every((pal) => typeof pal.partnerSkill === "string" && pal.partnerSkill.length > 0),
  "Expected partner-skill title coverage for every Pal");
const zeroStarWithoutExtraMetric = pals.filter((pal) => pal.selectable
  && pal.refinement.zeroStar.metrics.length === 0).map((pal) => pal.id).sort();
assert(JSON.stringify(zeroStarWithoutExtraMetric) === JSON.stringify([
  "BlackCentaur", "FengyunDeeper", "Garm", "HawkBird", "SaintCentaur", "Serpent",
]), `Unexpected zero-star metric gaps: ${zeroStarWithoutExtraMetric.join(", ")}`);
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
assert(manifest.counts.passiveSkillSourceRows === 1_905, "Manifest passive source-row count mismatch");
assert(manifest.counts.passiveSkills === passiveSkills.length, "Manifest passive-skill count mismatch");
assert(manifest.counts.randomlyAvailablePassiveSkills === 85,
  "Manifest randomly available passive-skill count mismatch");
assert(manifest.counts.guaranteedPassiveSkills === 23, "Manifest guaranteed passive-skill count mismatch");
assert(manifest.counts.guaranteedPassiveAssignments === 53,
  "Manifest guaranteed passive assignment count mismatch");
assert(manifest.counts.movementRecords === pals.length, "Manifest movement-record count mismatch");
assert(manifest.counts.selectableMovementTypes === selectableIds.size, "Manifest movement-type count mismatch");
assert(JSON.stringify(manifest.counts.movementTypes) === JSON.stringify({ ground: 252, fly: 21, flyAndLanding: 7, swim: 8 }),
  `Unexpected movement-type counts: ${JSON.stringify(manifest.counts.movementTypes)}`);
assert(manifest.counts.effectiveFlyOverrides === 6, "Unexpected fly-override count");
assert(manifest.counts.refinementRecords === 288, "Unexpected refinement-record count");
assert(manifest.counts.rankedPartnerSkillRecords === 270, "Unexpected ranked partner-skill count");
assert(manifest.counts.changedPartnerSkillRecords === 258, "Unexpected changed partner-skill count");
assert(manifest.counts.specialRefinementRecords === 18, "Unexpected special refinement count");
const itemValidation = validatePublicItemData(itemDocument, recipeDocument);
const items = itemDocument.items;
const itemRecipes = recipeDocument.recipes;
const itemById = new Map(items.map((item) => [item.id, item]));
const itemDropValidation = validateItemDropSnapshot(itemDropDocument, {
  itemIds: new Set(itemById.keys()), itemById, palIds: selectableIds,
});
assert(itemValidation.items === 2_466 && itemValidation.recipes === 1_414,
  "Unexpected public item-data counts");
assert(itemDropValidation.includedSourceRows === 790 && itemDropValidation.palDropEdges === 2_645,
  "Unexpected public item-drop counts");
assert(JSON.stringify(itemDropValidation.sourceRowsByType)
  === JSON.stringify({ normal: 417, alpha: 330, predator: 43 }),
"Unexpected item-drop source-type counts");
assert(itemDropValidation.rawMonsterParameterRows === 753
  && itemDropValidation.distinctDropPals === 288
  && itemDropValidation.distinctDropItems === 148
  && itemDropValidation.captureIneligibleEdges === 32
  && itemDropValidation.canonicalizedItemReferences === 2
  && itemDropValidation.unresolvedItemRefs === 0
  && itemDropValidation.chestDropEdges === 3_504
  && itemDropValidation.chestDropItems === 647
  && itemDropValidation.chestDropFields === 109
  && itemDropValidation.chestDropPools === 250
  && itemDropValidation.chestDropPositiveEntries === 3_523
  && itemDropValidation.chestAuditedSources === 170
  && itemDropValidation.chestOrphanPools === 0, "Unexpected item-drop coverage counts");
const legalItems = items.filter((item) => item.flags?.legalInGame === true);
assert(legalItems.length === 1_891, `Expected 1891 legal items, got ${legalItems.length}`);
assert(legalItems.every((item) => item.names?.zh && item.names?.en), "Legal item name coverage changed");
assert(legalItems.every((item) => item.icon), "Legal item icon coverage changed");
assert(items.every((item) => item.priceRaw < 0
  || item.baseSellPrice === Math.floor(item.priceRaw / 10)), "Base item sale-price derivation changed");
assert(itemDocument.counts.localizedNames.zh === 2_438
  && itemDocument.counts.localizedNames.en === 2_438, "Item localization coverage changed");
assert(itemDocument.counts.icons === 2_456, "Item icon-record coverage changed");
assert(itemDocument.counts.shopOffers === 587, "Item shop-offer count changed");
assert(recipeDocument.counts.products === 1_399, "Item recipe-product count changed");
assert(recipeDocument.counts.alternateRecipeProducts === 4, "Alternate item-recipe count changed");
assert(recipeDocument.counts.technologyUnlocks === 383, "Technology item-unlock count changed");
assert(recipeDocument.counts.cycles === 2 && recipeDocument.cycles.length === 2,
  "Item recipe-cycle count changed");
assert(recipeDocument.counts.unresolvedItemRefs === 0
  && recipeDocument.counts.unresolvedTechnologyRecipeRefs === 0
  && itemDocument.counts.unresolvedShopItemRefs === 0, "Unresolved item-data references remain");

const itemSnapshotPath = resolve(root, "scripts/vendor/palworld/items-v1.json");
const itemSnapshotBytes = await readFile(itemSnapshotPath);
const itemSnapshot = JSON.parse(itemSnapshotBytes.toString("utf8"));
assert(JSON.stringify(itemDocument.source) === JSON.stringify(itemSnapshot.source),
  "Public item source metadata differs from normalized snapshot");
assert(JSON.stringify(recipeDocument.source) === JSON.stringify(itemSnapshot.source),
  "Public recipe source metadata differs from normalized snapshot");
assert(JSON.stringify(items) === JSON.stringify(itemSnapshot.items), "Public items differ from normalized snapshot");
assert(JSON.stringify(itemRecipes) === JSON.stringify(itemSnapshot.recipes),
  "Public recipes differ from normalized snapshot");
assert(JSON.stringify(recipeDocument.recipesByProduct) === JSON.stringify(itemSnapshot.recipesByProduct),
  "Public recipe index differs from normalized snapshot");
assert(JSON.stringify(recipeDocument.cycles) === JSON.stringify(itemSnapshot.cycles),
  "Public recipe cycles differ from normalized snapshot");
assert(itemSnapshot.counts.canonicalizedReferences === 10
  && itemSnapshot.diagnostics.referenceCorrections.length === 10,
"Item FName reference-correction count changed");
assert(itemSnapshot.counts.unresolvedItemRefs === 0
  && itemSnapshot.counts.unresolvedTechnologyRecipeRefs === 0
  && itemSnapshot.counts.unresolvedShopItemRefs === 0, "Normalized item snapshot has unresolved references");
const { snapshotSha256: manifestItemSnapshotHash, ...manifestItemSource } = manifest.sources.localGameItems;
assert(JSON.stringify(manifestItemSource) === JSON.stringify(itemSnapshot.source),
  "Manifest item source metadata differs from snapshot");
assert(manifestItemSnapshotHash === digestText(itemSnapshotBytes), "Item snapshot hash mismatch");

const itemDropSnapshotPath = resolve(root, "scripts/vendor/palworld/item-drops-v1.json");
const itemDropSnapshotBytes = await readFile(itemDropSnapshotPath);
const itemDropSnapshot = JSON.parse(itemDropSnapshotBytes.toString("utf8"));
validateItemDropSnapshot(itemDropSnapshot, {
  itemIds: new Set(itemById.keys()), itemById, palIds: selectableIds,
});
assert(JSON.stringify(itemDropDocument.source) === JSON.stringify(itemDropSnapshot.source),
  "Public item-drop source metadata differs from normalized snapshot");
assert(JSON.stringify(itemDropDocument.palDrops) === JSON.stringify(itemDropSnapshot.palDrops),
  "Public Pal drops differ from normalized snapshot");
for (const key of [
  "rawSourceRows", "rawMonsterParameterRows", "includedSourceRows", "excludedSourceRows",
  "distinctDropPals", "palDropEdges", "distinctDropItems", "captureIneligibleEdges",
  "canonicalizedItemReferences", "unresolvedItemRefs",
]) assert(itemDropDocument.counts[key] === itemDropSnapshot.counts[key],
  `Public Pal-drop count differs from normalized snapshot: ${key}`);
assert(JSON.stringify(itemDropDocument.counts.sourceRowsByType)
  === JSON.stringify(itemDropSnapshot.counts.sourceRowsByType),
"Public Pal-drop source-type counts differ from normalized snapshot");
assert(itemDropSnapshot.source.itemSnapshotSha256 === digestText(itemSnapshotBytes),
  "Item-drop source item-snapshot hash mismatch");
const palCatalogBytes = await readFile(resolve(root, "scripts/vendor/palcalc/db.json"));
assert(itemDropSnapshot.source.palCatalogSha256 === digestText(palCatalogBytes),
  "Item-drop source Pal-catalog hash mismatch");
assert(itemDropSnapshot.source.rawTable.sha256
  === "a99ec796fa4aad683f12af836c41c43c211883d3766ad0be10ec8226f4da9e5c",
"Raw Pal-drop table hash mismatch");
assert(itemDropSnapshot.source.monsterParameterTable.sha256
  === "f4e1ab7ac8c8b064d07d2967af16dbfca8f02181df273a5e872c79f957883644",
"Raw Pal monster-parameter table hash mismatch");
const { snapshotSha256: manifestItemDropSnapshotHash, ...manifestItemDropSource }
  = manifest.sources.localGameItemDrops;
assert(JSON.stringify(manifestItemDropSource) === JSON.stringify(itemDropSnapshot.source),
  "Manifest item-drop source metadata differs from snapshot");
assert(manifestItemDropSnapshotHash === digestText(itemDropSnapshotBytes),
  "Item-drop snapshot hash mismatch");

const chestDropSnapshotPath = resolve(root, "scripts/vendor/palworld/chest-drops-v1.json");
const chestDropSnapshotBytes = await readFile(chestDropSnapshotPath);
const chestDropSnapshot = JSON.parse(chestDropSnapshotBytes.toString("utf8"));
const chestVendorCounts = validateChestDropSnapshot(chestDropSnapshot, {
  itemIds: new Set(itemById.keys()),
  expectedCounts: {
    rawLotteryRows: 8_777,
    rawFieldNames: 500,
    classifiedFieldNames: 109,
    classifiedRawRows: 3_527,
    positiveWeightEntries: 3_523,
    excludedNonPositiveWeightRows: 4,
    fieldGradePools: 250,
    poolItemSummaries: 3_504,
    classifiedDistinctItems: 648,
    distinctItems: 647,
    sources: 170,
    orphanPools: 0,
  },
});
const mergedChestCounts = validateMergedChestDrops(
  itemDropDocument, chestDropSnapshot, new Set(itemById.keys()),
);
assert(chestVendorCounts.poolItemSummaries === mergedChestCounts.edges
  && mergedChestCounts.fields === 109
  && mergedChestCounts.pools === 250
  && mergedChestCounts.entries === 3_523
  && mergedChestCounts.items === 647
  && mergedChestCounts.sources === 170, "Merged chest-drop coverage changed");
const { snapshotSha256: manifestChestDropSnapshotHash, ...manifestChestDropSource }
  = manifest.sources.localGameChestDrops;
assert(JSON.stringify(manifestChestDropSource) === JSON.stringify(chestDropSnapshot.source),
  "Manifest chest-drop source metadata differs from snapshot");
assert(manifestChestDropSnapshotHash === digestText(chestDropSnapshotBytes),
  "Chest-drop snapshot hash mismatch");

const itemIconNames = [...new Set(items.filter((item) => item.icon).map((item) => basename(item.icon)))].sort();
const actualItemIconNames = (await readdir(resolve(root, "public/item-icons"), { withFileTypes: true }))
  .filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
assert(itemIconNames.length === 929, `Expected 929 item icon files, got ${itemIconNames.length}`);
assert(JSON.stringify(actualItemIconNames) === JSON.stringify(itemIconNames),
  "Item icon directory contains missing or stale files");
const itemIconHash = createHash("sha256");
for (const name of itemIconNames) {
  itemIconHash.update(name);
  itemIconHash.update("\0");
  itemIconHash.update(await readFile(resolve(root, "public/item-icons", name)));
}
assert(manifest.counts.items === items.length && manifest.counts.legalItems === legalItems.length,
  "Manifest item count mismatch");
assert(manifest.counts.itemRecipes === itemRecipes.length
  && manifest.counts.itemRecipeProducts === 1_399
  && manifest.counts.alternateItemRecipeProducts === 4, "Manifest item recipe counts mismatch");
assert(manifest.counts.itemTechnologyUnlocks === 383 && manifest.counts.itemShopOffers === 587,
  "Manifest item source counts mismatch");
assert(JSON.stringify(manifest.counts.itemLocalizedNames) === JSON.stringify({ zh: 2_438, en: 2_438, ja: 0 }),
  "Manifest item localization counts mismatch");
assert(manifest.counts.itemIconRecords === 2_456 && manifest.counts.itemIconFiles === 929,
  "Manifest item icon counts mismatch");
assert(manifest.counts.itemCycles === 2 && manifest.counts.itemCanonicalizedReferences === 10,
  "Manifest item graph counts mismatch");
assert(manifest.counts.unresolvedItemRefs === 0
  && manifest.counts.unresolvedTechnologyRecipeRefs === 0
  && manifest.counts.unresolvedShopItemRefs === 0, "Manifest unresolved item counts changed");
assert(manifest.counts.itemDropSourceRows === 790
  && manifest.counts.itemDropEdges === 2_645
  && manifest.counts.itemDropItems === 148
  && manifest.counts.itemDropCaptureIneligibleEdges === 32
  && manifest.counts.itemDropCanonicalizedReferences === 2
  && manifest.counts.itemDropUnresolvedItemRefs === 0
  && manifest.counts.chestDropEdges === 3_504
  && manifest.counts.chestDropItems === 647
  && manifest.counts.chestDropFields === 109
  && manifest.counts.chestDropPools === 250
  && manifest.counts.chestDropPositiveEntries === 3_523
  && manifest.counts.chestAuditedSources === 170
  && manifest.counts.chestOrphanPools === 0, "Manifest item-drop counts changed");
assert(manifest.checksums.breeding === await digest("breeding.json"), "Breeding checksum mismatch");
assert(manifest.checksums.paldex === await digest("paldex.json"), "Paldex checksum mismatch");
assert(manifest.checksums.skills === await digest("skills.json"), "Skills checksum mismatch");
assert(manifest.checksums.items === await digest("items.json"), "Items checksum mismatch");
assert(manifest.checksums.recipes === await digest("recipes.json"), "Recipes checksum mismatch");
assert(manifest.checksums.itemDrops === await digest("item-drops.json"), "Item drops checksum mismatch");
assert(manifest.checksums.icons === iconHash.digest("hex"), "Icon bundle checksum mismatch");
assert(manifest.checksums.itemIcons === itemIconHash.digest("hex"), "Item icon bundle checksum mismatch");
assert(manifest.dataVersion.endsWith("-skills2-movement1-refinement1-items1-drops2"),
  `Unexpected data version: ${manifest.dataVersion}`);
for (const [name, file] of [["activeSkillOverrides", "active-skill-overrides.zh-Hans.json"], ["partnerSkills", "partner-skills.zh-Hans.json"]]) {
  const path = resolve(root, "scripts/vendor/paldb", file);
  const snapshot = JSON.parse(await readFile(path, "utf8"));
  const snapshotHash = digestText(await readFile(path));
  assert(manifest.sources.paldb[name].sourceSha256 === snapshot.sourceSha256, `PalDB ${name} source hash mismatch`);
  assert(manifest.sources.paldb[name].snapshotSha256 === snapshotHash, `PalDB ${name} snapshot hash mismatch`);
}
const movementPath = resolve(root, "scripts/vendor/palworld/movement-v1.json");
const movementSnapshotBytes = await readFile(movementPath);
const movementSnapshot = JSON.parse(movementSnapshotBytes.toString("utf8"));
const movementById = new Map(movementSnapshot.records.map((record) => [record.id, record]));
assert(movementById.size === pals.length, "Movement snapshot ID count mismatch");
for (const pal of pals) {
  const source = movementById.get(pal.id);
  assert(source, `Missing movement snapshot row: ${pal.id}`);
  for (const field of movementFields)
    assert(pal.movement[field] === source[field], `Movement output mismatch: ${pal.id}.${field}`);
  assert(pal.movement.type === source.movementType, `Movement type mismatch: ${pal.id}`);
  assert(pal.movement.flySpeedOverride === source.flySpeedOverride, `Fly override mismatch: ${pal.id}`);
  assert(pal.movement.flySprintSpeedOverride === source.flySprintSpeedOverride, `Fly sprint override mismatch: ${pal.id}`);
}
const missingMovementTypes = pals.filter((pal) => !pal.movement.type).map((pal) => pal.id).sort();
assert(JSON.stringify(missingMovementTypes) === JSON.stringify([
  "AmaterasuWolf_Dark_Quest_Friend", "POLICE_HawkBird", "POLICE_ThunderDog",
  "PREDATOR_FlowerRabbit_Quest", "YakushimaMonster001_Blue", "YakushimaMonster001_Pink",
  "YakushimaMonster001_Purple", "YakushimaMonster001_Rainbow", "YakushimaMonster001_Red",
]), `Unexpected movement-type gaps: ${missingMovementTypes.join(", ")}`);
const flyOverrideIds = pals.filter((pal) => pal.movement.flySpeedOverride !== undefined).map((pal) => pal.id).sort();
assert(JSON.stringify(flyOverrideIds) === JSON.stringify([
  "BlackGriffon", "DarkMechaDragon", "FairyDragon", "FairyDragon_Water", "SkyDragon", "SkyDragon_Grass",
]), `Unexpected fly-speed overrides: ${flyOverrideIds.join(", ")}`);
assert(pals.filter((pal) => pal.movement.rideSprintSpeed < 0).length === 3, "Ride-sprint sentinel count changed");
assert(pals.filter((pal) => pal.movement.transportSpeed < 0).length === 21, "Transport sentinel count changed");
assert(palsById.find((pal) => pal.id === "MimicDog").movement.swimDashSpeed === 0, "MimicDog swim sentinel changed");
assert(manifest.sources.localGameMovement.snapshotSha256
  === digestText(movementSnapshotBytes), "Movement snapshot hash mismatch");
assert(manifest.sources.localGameMovement.rawArtifactSha256
  === "528b804632f0030186804cd9b1b3a3a89b75f046baa0c77e713d2e3e76009d16", "Raw unpack hash mismatch");
const refinementPath = resolve(root, "scripts/vendor/palworld/refinement-v1.json");
const refinementSnapshotBytes = await readFile(refinementPath);
const refinementSnapshot = JSON.parse(refinementSnapshotBytes.toString("utf8"));
const refinementById = new Map(refinementSnapshot.entries.map((entry) => [entry.id, entry]));
assert(refinementById.size === selectableIds.size, "Refinement snapshot ID count mismatch");
assert(refinementSnapshot.counts.tableRanked === 270 && refinementSnapshot.counts.tableChanged === 258
  && refinementSnapshot.counts.specialCovered === 18, "Refinement snapshot counts changed");
for (const pal of pals.filter((entry) => entry.selectable)) {
  const source = refinementById.get(pal.id);
  assert(source, `Missing refinement snapshot row: ${pal.id}`);
  const output = { ...source };
  delete output.id;
  assert(JSON.stringify(pal.refinement) === JSON.stringify(output), `Refinement output mismatch: ${pal.id}`);
}
assert(pals.find((pal) => pal.id === "PinkCat").refinement.zeroStar.metrics[0].value === 100
  && pals.find((pal) => pal.id === "PinkCat").refinement.fourStar.metrics[0].value === 200,
"PinkCat refinement changed");
assert(pals.find((pal) => pal.id === "OniGhostGirl").refinement.zeroStar.metrics[0].value === 40
  && pals.find((pal) => pal.id === "OniGhostGirl").refinement.fourStar.metrics[0].value === 80,
"OniGhostGirl refinement changed");
assert(pals.find((pal) => pal.id === "Anubis").refinement.zeroStar.workSuitability.handiwork === 6
  && pals.find((pal) => pal.id === "Anubis").refinement.fourStar.workSuitability.handiwork === 8,
"Anubis work refinement changed");
assert(pals.find((pal) => pal.id === "Umihebi_Fire").refinement.fourStar.workSuitability.kindling === 10,
  "Single-work refinement cap changed");
assert(pals.find((pal) => pal.id === "Eagle").refinement.zeroStar.metrics
  .find((metric) => metric.key === "gliderMaxSpeed").value === 1000
  && pals.find((pal) => pal.id === "Eagle").refinement.fourStar.metrics
    .find((metric) => metric.key === "gliderMaxSpeed").value === 1700,
"Eagle glider refinement changed");
assert(manifest.sources.localGameRefinement.snapshotSha256
  === digestText(refinementSnapshotBytes), "Refinement snapshot hash mismatch");
assert(manifest.sources.localGameRefinement.rawArtifactSha256.special
  === "ca856bba482d8c2988d17dccde30880f49d0e4336e0260f68cd3e908febd3ae5",
"Special refinement source hash mismatch");
console.log(`Validated ${pals.length} Pals, ${rules.length} rules, ${activeSkills.length} active skills, ${partnerSkills.length} partner skills, ${passiveSkills.length} passive skills, ${items.length} items, ${itemRecipes.length} item recipes, ${itemDropDocument.palDrops.length} Pal drops, ${itemDropDocument.chestDrops.length} grade-conditional chest drops, ${manifest.counts.icons} Pal icons, and ${itemIconNames.length} item icon files.`);
