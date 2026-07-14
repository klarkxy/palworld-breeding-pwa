import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { rowsOf } from "./import-item-snapshot.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PINNED_GAME_VERSION = "1.0";
const PINNED_BUILD_ID = "24088745";
const PINNED_MAPPING_SHA256 = "741798898aabf3da8803e26ff005a35052b33bd0c90d771aabbb5f2c367f7df7";
const EXPECTED = {
  rawLotteryRows: 8777,
  rawFieldNames: 500,
  classifiedFieldNames: 109,
  fieldGradePools: 250,
  classifiedRawRows: 3527,
  positiveWeightEntries: 3523,
  excludedNonPositiveWeightRows: 4,
  classifiedDistinctItems: 648,
  distinctItems: 647,
  poolItemSummaries: 3504,
  sources: 170,
  orphanPools: 0,
};

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const precise = (value) => Number(value.toFixed(12));

export const CHEST_DROP_SCHEMA_VERSION = 1;

const REGION_FIELDS = new Set([
  "Grass01", "Grass02", "Forest01", "Forest02", "Desert01", "Desert02",
  "Volcano01", "Volcano02", "Snow01", "Snow02", "Sakurajima_Treasure",
  "SkyIsland_Treasure", "DarkIsland_Treasure", "WorldTree_Treasure", "Yakushima_Treasure",
]);
const VISIBLE_FIELDS = new Set([
  "DarkIsland_Drop_1", "Dessert_Drop", "Grass01_Drop", "Grass02_Drop", "KingWhale_Drop",
  "Sakurajima_Drop_1", "SkyIsland_Drop_1", "Snow_Drop", "Volcano_Drop", "WorldTree_Drop_1",
]);
const OILRIG_PATTERN = /^Oilrig_(?:01|02|Large_01|Large_02|Mini_01|Mini_02)$/;
const TREASURE_MAP_PATTERN = /^TreasureMap0[1-5]$/;
const DUNGEON_PATTERN = /_Dungeon_(?:Elixir|TechnologyBook)$/;
const ELEMENTAL_PATTERN = /^(?:Desert|Forest|Sakurajima|SkyIsland|WorldTree)_(?:Electric|Fire|Water)Treasure$/;
const SOURCE_KINDS = new Set([
  "field", "enemyCamp", "oilrig", "treasureMap", "dungeon", "visible", "elemental",
]);

function sourceKindOf(fieldName) {
  if (REGION_FIELDS.has(fieldName)) return "field";
  if (fieldName.startsWith("EnemyCamp_")) return "enemyCamp";
  if (OILRIG_PATTERN.test(fieldName)) return "oilrig";
  if (TREASURE_MAP_PATTERN.test(fieldName)) return "treasureMap";
  if (DUNGEON_PATTERN.test(fieldName)) return "dungeon";
  if (VISIBLE_FIELDS.has(fieldName)) return "visible";
  if (ELEMENTAL_PATTERN.test(fieldName)) return "elemental";
  return undefined;
}

const REGION_LABELS = {
  Grass01: "草原宝箱（Grass01）",
  Grass02: "草原宝箱（Grass02）",
  Forest01: "森林宝箱（Forest01）",
  Forest02: "森林宝箱（Forest02）",
  Desert01: "沙漠宝箱（Desert01）",
  Desert02: "沙漠宝箱（Desert02）",
  Volcano01: "火山宝箱（Volcano01）",
  Volcano02: "火山宝箱（Volcano02）",
  Snow01: "雪原宝箱（Snow01）",
  Snow02: "雪原宝箱（Snow02）",
  Sakurajima_Treasure: "樱花岛宝箱",
  SkyIsland_Treasure: "天坠之地宝箱",
  DarkIsland_Treasure: "幽暗岛宝箱",
  WorldTree_Treasure: "世界树宝箱",
  Yakushima_Treasure: "亚库岛宝箱",
};

function labelZhOf(fieldName, sourceKind = sourceKindOf(fieldName)) {
  if (REGION_LABELS[fieldName]) return REGION_LABELS[fieldName];
  if (sourceKind === "enemyCamp") return `敌人营地宝箱（${fieldName}）`;
  if (sourceKind === "oilrig") return `油田宝箱（${fieldName}）`;
  if (sourceKind === "treasureMap") return `藏宝图宝箱（${fieldName}）`;
  if (sourceKind === "dungeon") {
    const reward = fieldName.endsWith("_TechnologyBook") ? "技术书" : "秘药";
    return `地下城${reward}宝箱（${fieldName.replace(/_Dungeon_(?:Elixir|TechnologyBook)$/, "")}）`;
  }
  if (sourceKind === "visible") return `场景掉落宝箱（${fieldName}）`;
  if (sourceKind === "elemental") return `元素宝箱（${fieldName}）`;
  return `宝箱（${fieldName}）`;
}

function numberField(row, key, label) {
  const raw = row[key];
  const value = typeof raw === "number" ? raw
    : typeof raw === "string" && raw.trim() ? Number(raw) : Number.NaN;
  assert(Number.isFinite(value), `Invalid ${label}: ${JSON.stringify(raw)}`);
  return value;
}

function nameValue(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return value.Key ?? value.Name ?? value.Value;
  return undefined;
}

function shortGrade(rawGrade, rowId) {
  assert(typeof rawGrade === "string", `Missing TreasureBoxGrade in ${rowId}`);
  const match = rawGrade.match(/::(Grade[1-6])$/);
  assert(match, `Unknown TreasureBoxGrade in ${rowId}: ${rawGrade}`);
  return match[1];
}

function poolIdOf(fieldName, grade) {
  return `${fieldName}::${grade}`;
}

function itemIndexOf(itemSnapshot) {
  assert(Array.isArray(itemSnapshot?.items), "Item snapshot must contain items");
  const byFoldedId = new Map();
  for (const item of itemSnapshot.items) {
    assert(typeof item.id === "string" && item.id, "Item snapshot contains an invalid ID");
    const folded = item.id.toLocaleLowerCase("en-US");
    assert(!byFoldedId.has(folded), `Case-insensitive duplicate item ID: ${item.id}`);
    byFoldedId.set(folded, item);
  }
  return byFoldedId;
}

function normalizeBlueprintDefinitions(blueprints) {
  const definitions = [];
  for (const blueprint of blueprints) {
    assert(Array.isArray(blueprint.document), `Blueprint export must be an array: ${blueprint.file}`);
    const classExport = blueprint.document.find((entry) => entry?.Type === "BlueprintGeneratedClass");
    const defaultExport = blueprint.document.find((entry) => String(entry?.Name ?? "").startsWith("Default__"));
    if (!classExport || !defaultExport) continue;
    const parentObjectName = classExport.SuperStruct?.ObjectName;
    const parentClassName = typeof parentObjectName === "string"
      ? parentObjectName.match(/'([^']+)'/)?.[1] : undefined;
    definitions.push({
      assetName: basename(blueprint.file, ".json"),
      className: classExport.Name,
      parentClassName,
      package: classExport.Package,
      properties: defaultExport.Properties ?? {},
      file: blueprint.file,
      sha256: blueprint.sha256,
    });
  }
  return definitions;
}

function explicitBlueprintBranches(blueprints, allowedFields) {
  const definitions = normalizeBlueprintDefinitions(blueprints);
  const byClass = new Map(definitions.map((definition) => [definition.className, definition]));
  const inheritedMapObjectId = (definition, seen = new Set()) => {
    if (!definition || seen.has(definition.className)) return undefined;
    seen.add(definition.className);
    const direct = nameValue(definition.properties.SpawnMapObjectId);
    if (direct && direct !== "None") return direct;
    return inheritedMapObjectId(byClass.get(definition.parentClassName), seen);
  };
  const branches = [];
  for (const definition of definitions.sort((left, right) => left.assetName.localeCompare(right.assetName))) {
    if (!/^BP_(?:PalMapObjectSpawner_Treasure_|PalMapObjectSpawnerTreasureBox_VisibleContent|OilrigTreasureBoxSpawner)/.test(definition.assetName)) continue;
    const properties = definition.properties;
    const multi = properties.bLotteryByMultiTreasureBoxLotteryParameters === true
      && Array.isArray(properties.MultiTreasureBoxLotteryParameters)
      ? properties.MultiTreasureBoxLotteryParameters : undefined;
    if (multi) {
      const weighted = multi.map((branch, index) => ({
        index,
        fieldName: nameValue(branch.FieldLotteryName),
        mapObjectId: nameValue(branch.SpawnMapObjectId),
        weight: numberField(branch, "Weight", `${definition.assetName}.branch${index}.Weight`),
      }));
      const totalWeight = weighted.filter((branch) => branch.weight > 0)
        .reduce((sum, branch) => sum + branch.weight, 0);
      assert(totalWeight > 0, `Blueprint has no positive branch weight: ${definition.assetName}`);
      for (const branch of weighted) {
        if (branch.weight <= 0 || !allowedFields.has(branch.fieldName)) continue;
        branches.push({
          assetName: definition.assetName,
          sourceAsset: definition.package,
          sourceFile: definition.file,
          branchIndex: branch.index,
          fieldName: branch.fieldName,
          mapObjectId: branch.mapObjectId && branch.mapObjectId !== "None" ? branch.mapObjectId : undefined,
          branchWeight: branch.weight,
          branchTotalWeight: totalWeight,
          branchChancePercent: precise(branch.weight / totalWeight * 100),
        });
      }
      continue;
    }
    // The field must be explicitly overridden by this Blueprint. Inherited fields
    // on abstract/generic parents are not evidence of an actual chest source.
    const fieldName = nameValue(properties.FieldLotteryName);
    if (!fieldName || fieldName === "None" || !allowedFields.has(fieldName)) continue;
    branches.push({
      assetName: definition.assetName,
      sourceAsset: definition.package,
      sourceFile: definition.file,
      branchIndex: 0,
      fieldName,
      mapObjectId: inheritedMapObjectId(definition),
      branchWeight: 1,
      branchTotalWeight: 1,
      branchChancePercent: 100,
    });
  }
  return branches;
}

function poolsByField(pools) {
  const result = new Map();
  for (const pool of pools) {
    const list = result.get(pool.fieldName) ?? [];
    list.push(pool.id);
    result.set(pool.fieldName, list);
  }
  for (const list of result.values()) list.sort();
  return result;
}

function baseSource(source, poolIds) {
  return {
    ...source,
    sourceKind: source.sourceKind ?? sourceKindOf(source.fieldName),
    labelZh: source.labelZh ?? labelZhOf(source.fieldName, source.sourceKind),
    probabilityBasis: "conditionalOnGrade",
    poolIdsConditionalOnGrade: poolIds.get(source.fieldName) ?? [],
  };
}

function buildSources({ pools, blueprintBranches, dungeonItemRows, dungeonRewardRows }) {
  const fieldPools = poolsByField(pools);
  const sources = [];
  for (const branch of blueprintBranches) {
    sources.push(baseSource({
      id: `blueprint:${branch.assetName}:${branch.branchIndex}`,
      originType: "blueprintFieldBranch",
      fieldName: branch.fieldName,
      sourceAsset: branch.sourceAsset,
      sourceFile: branch.sourceFile,
      sourceRowId: undefined,
      mapObjectId: branch.mapObjectId ?? null,
      outerBranchWeight: branch.branchWeight,
      outerBranchTotalWeight: branch.branchTotalWeight,
      outerBranchChancePercent: branch.branchChancePercent,
      outerBranchChanceKnown: true,
    }, fieldPools));
  }

  const branchByAsset = new Map();
  for (const branch of blueprintBranches) {
    const keys = [branch.assetName, `${branch.assetName}_C`];
    for (const key of keys) {
      const list = branchByAsset.get(key.toLocaleLowerCase("en-US")) ?? [];
      list.push(branch);
      branchByAsset.set(key.toLocaleLowerCase("en-US"), list);
    }
  }
  const rewardGroups = new Map();
  for (const [rowId, row] of Object.entries(dungeonRewardRows)) {
    const key = `${row.SpawnAreaId}\0${row.RewardSpawnerType}`;
    const list = rewardGroups.get(key) ?? [];
    list.push([rowId, row]);
    rewardGroups.set(key, list);
  }
  for (const [rowId, row] of Object.entries(dungeonRewardRows).sort(([a], [b]) => a.localeCompare(b))) {
    if (!String(row.SpawnerContentType ?? "").endsWith("::MapObjectSpawner")) continue;
    const blueprintName = String(row.LotteryValueBlueprintClassName ?? row.LotteryValue ?? "");
    const branches = branchByAsset.get(blueprintName.toLocaleLowerCase("en-US")) ?? [];
    if (!branches.length) continue;
    const weight = numberField(row, "Weight", `${rowId}.Weight`);
    if (weight <= 0) continue;
    const groupKey = `${row.SpawnAreaId}\0${row.RewardSpawnerType}`;
    const totalWeight = (rewardGroups.get(groupKey) ?? []).reduce((sum, [, candidate]) => {
      const candidateWeight = Number(candidate.Weight);
      return sum + (Number.isFinite(candidateWeight) && candidateWeight > 0 ? candidateWeight : 0);
    }, 0);
    assert(totalWeight > 0, `Dungeon reward group has no positive weight: ${groupKey}`);
    for (const branch of branches) {
      const selectionChance = weight / totalWeight * 100;
      const combinedChance = selectionChance * branch.branchChancePercent / 100;
      sources.push(baseSource({
        id: `dungeonReward:${rowId}:${branch.branchIndex}`,
        originType: "dungeonRewardSpawnerBranch",
        fieldName: branch.fieldName,
        sourceAsset: "Pal/Content/Pal/DataTable/Dungeon/DT_DungeonRewardSpawnerLotteryDataTable",
        sourceFile: "DT_DungeonRewardSpawnerLotteryDataTable.json",
        sourceRowId: rowId,
        mapObjectId: branch.mapObjectId ?? null,
        dungeonAreaId: row.SpawnAreaId,
        dungeonRewardSpawnerType: row.RewardSpawnerType,
        sourceKind: "dungeon",
        labelZh: `地下城奖励宝箱（${row.SpawnAreaId} · ${String(row.RewardSpawnerType).split("::").pop()}）`,
        spawnerBlueprint: blueprintName,
        dungeonSelectionWeight: weight,
        dungeonSelectionTotalWeight: totalWeight,
        dungeonSelectionChancePercent: precise(selectionChance),
        spawnerBranchWeight: branch.branchWeight,
        spawnerBranchTotalWeight: branch.branchTotalWeight,
        spawnerBranchChancePercent: branch.branchChancePercent,
        outerBranchWeight: weight,
        outerBranchTotalWeight: totalWeight,
        outerBranchChancePercent: precise(combinedChance),
        outerBranchChanceKnown: true,
      }, fieldPools));
    }
  }

  for (const [rowId, row] of Object.entries(dungeonItemRows).sort(([a], [b]) => a.localeCompare(b))) {
    const fieldName = String(row.ItemFieldLotteryName ?? "");
    if (!fieldPools.has(fieldName) || sourceKindOf(fieldName) !== "dungeon") continue;
    sources.push(baseSource({
      id: `dungeonItem:${rowId}`,
      originType: "dungeonItemFieldBranch",
      fieldName,
      sourceAsset: "Pal/Content/Pal/DataTable/Dungeon/DT_DungeonItemLotteryDataTable",
      sourceFile: "DT_DungeonItemLotteryDataTable.json",
      sourceRowId: rowId,
      mapObjectId: null,
      dungeonAreaId: row.SpawnAreaId,
      dungeonItemSpawnerType: row.Type,
      sourceKind: "dungeon",
      labelZh: labelZhOf(fieldName, "dungeon"),
      outerBranchWeight: 1,
      outerBranchTotalWeight: 1,
      outerBranchChancePercent: 100,
      outerBranchChanceKnown: true,
    }, fieldPools));
  }

  const coveredFields = new Set(sources.map((source) => source.fieldName));
  for (const fieldName of [...fieldPools.keys()].sort()) {
    if (coveredFields.has(fieldName)) continue;
    // These fields are kept only because their names belong to an audited,
    // chest-only consumer domain. No grade or outer-selection probability is
    // fabricated when the concrete consumer asset is absent from the export.
    sources.push(baseSource({
      id: `consumerDomain:${fieldName}`,
      originType: "auditedChestConsumerDomain",
      fieldName,
      sourceAsset: "Pal/Content/Pal/DataTable/Item/DT_ItemLotteryDataTable",
      sourceFile: "DT_ItemLotteryDataTable.json",
      sourceRowId: null,
      mapObjectId: null,
      outerBranchWeight: null,
      outerBranchTotalWeight: null,
      outerBranchChancePercent: null,
      outerBranchChanceKnown: false,
    }, fieldPools));
  }
  return sources.sort((left, right) => left.id.localeCompare(right.id));
}

function buildSummary(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = `${entry.poolId}\0${entry.itemId}`;
    const group = groups.get(key) ?? { poolId: entry.poolId, itemId: entry.itemId, entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    const bySlot = new Map();
    for (const entry of group.entries) {
      const slotEntries = bySlot.get(entry.slot) ?? [];
      slotEntries.push(entry);
      bySlot.set(entry.slot, slotEntries);
    }
    const slotContributions = [...bySlot.entries()].sort(([a], [b]) => a - b).map(([slot, variants]) => {
      const combinedWeight = variants.reduce((sum, entry) => sum + entry.weight, 0);
      const first = variants[0];
      const chance = first.slotTriggerChancePercent / 100 * combinedWeight / first.slotWeightTotal;
      return {
        slot,
        slotTriggerChancePercent: first.slotTriggerChancePercent,
        combinedItemWeight: combinedWeight,
        slotWeightTotal: first.slotWeightTotal,
        conditionalOnGradeChancePercent: precise(chance * 100),
        expectedQuantityPerOpen: precise(variants.reduce(
          (sum, entry) => sum + entry.expectedQuantityPerOpen, 0)),
        variantIds: variants.map((entry) => entry.id),
      };
    });
    const probability = 1 - slotContributions.reduce(
      (product, contribution) => product * (1 - contribution.conditionalOnGradeChancePercent / 100), 1);
    return {
      poolId: group.poolId,
      itemId: group.itemId,
      probabilityBasis: "conditionalOnGrade",
      conditionalOnGradeChancePercent: precise(probability * 100),
      expectedQuantityPerOpen: precise(slotContributions.reduce(
        (sum, contribution) => sum + contribution.expectedQuantityPerOpen, 0)),
      slotContributions,
      variantIds: group.entries.map((entry) => entry.id),
    };
  }).sort((left, right) => left.poolId.localeCompare(right.poolId)
    || left.itemId.localeCompare(right.itemId));
}

export function normalizeChestDrops(input, options = {}) {
  const itemRows = rowsOf(input.itemLotteryDocument, "Item lottery table");
  const fieldRows = rowsOf(input.fieldLotteryDocument, "Field lottery table");
  const dungeonItemRows = rowsOf(input.dungeonItemDocument, "Dungeon item lottery table");
  const dungeonRewardRows = rowsOf(input.dungeonRewardDocument, "Dungeon reward table");
  const itemByFoldedId = itemIndexOf(input.itemSnapshot);
  const selectedRows = Object.entries(itemRows).filter(([, row]) => sourceKindOf(String(row.FieldName ?? "")));
  const allowedFields = new Set(selectedRows.map(([, row]) => String(row.FieldName)));
  const canonicalizedItemReferences = [];
  const unresolvedItemReferences = [];
  const excludedNonPositiveWeightRows = [];
  const normalized = [];

  for (const [rowId, row] of selectedRows.sort(([a], [b]) => a.localeCompare(b))) {
    const fieldName = String(row.FieldName);
    const gradeRaw = String(row.TreasureBoxGrade ?? "");
    const treasureBoxGrade = shortGrade(gradeRaw, rowId);
    const slot = numberField(row, "SlotNo", `${rowId}.SlotNo`);
    const weight = numberField(row, "WeightInSlot", `${rowId}.WeightInSlot`);
    assert(Number.isInteger(slot) && slot >= 1 && slot <= 15, `Invalid slot in ${rowId}: ${slot}`);
    if (weight <= 0) {
      excludedNonPositiveWeightRows.push({ rowId, fieldName, treasureBoxGrade, slot, weight });
      continue;
    }
    const rawItemId = String(nameValue(row.StaticItemId) ?? "");
    const item = itemByFoldedId.get(rawItemId.toLocaleLowerCase("en-US"));
    if (!item) {
      unresolvedItemReferences.push({ rowId, itemId: rawItemId });
      continue;
    }
    if (item.id !== rawItemId) canonicalizedItemReferences.push({ rowId, source: rawItemId, canonical: item.id });
    const minRoll = numberField(row, "MinNum", `${rowId}.MinNum`);
    const maxRoll = numberField(row, "MaxNum", `${rowId}.MaxNum`);
    const numUnit = numberField(row, "NumUnit", `${rowId}.NumUnit`);
    assert(Number.isInteger(minRoll) && minRoll >= 0, `Invalid MinNum in ${rowId}: ${minRoll}`);
    assert(Number.isInteger(maxRoll) && maxRoll >= minRoll, `Invalid MaxNum in ${rowId}: ${maxRoll}`);
    assert(Number.isInteger(numUnit) && numUnit > 0, `Invalid NumUnit in ${rowId}: ${numUnit}`);
    normalized.push({
      rowId,
      fieldName,
      treasureBoxGrade,
      treasureBoxGradeRaw: gradeRaw,
      poolId: poolIdOf(fieldName, treasureBoxGrade),
      slot,
      itemId: item.id,
      weight,
      minRoll,
      maxRoll,
      numUnit,
      minQuantity: minRoll * numUnit,
      maxQuantity: maxRoll * numUnit,
      bonusExpRate: Number.isFinite(Number(row.BonusExpRate)) ? Number(row.BonusExpRate) : undefined,
    });
  }
  assert(unresolvedItemReferences.length === 0,
    `Chest snapshot has ${unresolvedItemReferences.length} unresolved item references`);

  const poolGroups = new Map();
  for (const row of normalized) {
    const list = poolGroups.get(row.poolId) ?? [];
    list.push(row);
    poolGroups.set(row.poolId, list);
  }
  const pools = [];
  const entries = [];
  for (const [poolId, rows] of [...poolGroups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const { fieldName, treasureBoxGrade } = rows[0];
    const field = fieldRows[fieldName];
    assert(field, `Missing field-lottery probabilities for ${fieldName}`);
    const slotGroups = new Map();
    for (const row of rows) {
      const list = slotGroups.get(row.slot) ?? [];
      list.push(row);
      slotGroups.set(row.slot, list);
    }
    const slots = [];
    for (const [slot, variants] of [...slotGroups.entries()].sort(([a], [b]) => a - b)) {
      const probabilityKey = `ItemSlot${slot}_ProbabilityPercent`;
      const slotTriggerChancePercent = numberField(field, probabilityKey, `${fieldName}.${probabilityKey}`);
      assert(slotTriggerChancePercent >= 0 && slotTriggerChancePercent <= 100,
        `Invalid slot trigger chance for ${fieldName} slot ${slot}: ${slotTriggerChancePercent}`);
      const slotWeightTotal = variants.reduce((sum, variant) => sum + variant.weight, 0);
      assert(slotWeightTotal > 0, `Non-positive slot weight total: ${poolId} slot ${slot}`);
      slots.push({
        slot,
        triggerChancePercent: slotTriggerChancePercent,
        positiveWeightTotal: slotWeightTotal,
        variantCount: variants.length,
        distinctItems: new Set(variants.map((variant) => variant.itemId)).size,
      });
      for (const variant of variants) {
        const chance = slotTriggerChancePercent / 100 * variant.weight / slotWeightTotal;
        const averageQuantity = (variant.minQuantity + variant.maxQuantity) / 2;
        entries.push({
          id: `lottery:${variant.rowId}`,
          ...variant,
          probabilityBasis: "conditionalOnGrade",
          slotTriggerChancePercent,
          slotWeightTotal,
          conditionalOnGradeChancePercent: precise(chance * 100),
          expectedQuantityPerOpen: precise(chance * averageQuantity),
        });
      }
    }
    pools.push({
      id: poolId,
      fieldName,
      sourceKind: sourceKindOf(fieldName),
      labelZh: labelZhOf(fieldName),
      treasureBoxGrade,
      probabilityBasis: "conditionalOnGrade",
      gradeDistributionKnown: false,
      slots,
      variantCount: rows.length,
      distinctItems: new Set(rows.map((row) => row.itemId)).size,
    });
  }
  entries.sort((left, right) => left.poolId.localeCompare(right.poolId)
    || left.slot - right.slot || left.rowId.localeCompare(right.rowId));
  const summary = buildSummary(entries);
  const blueprintBranches = explicitBlueprintBranches(input.blueprints ?? [], allowedFields);
  const sources = buildSources({ pools, blueprintBranches, dungeonItemRows, dungeonRewardRows });
  const referencedPools = new Set(sources.flatMap((source) => source.poolIdsConditionalOnGrade));
  const orphanPoolIds = pools.map((pool) => pool.id).filter((poolId) => !referencedPools.has(poolId));
  const rawFields = new Set(Object.values(itemRows).map((row) => String(row.FieldName ?? "")));
  const counts = {
    rawLotteryRows: Object.keys(itemRows).length,
    rawFieldNames: rawFields.size,
    classifiedFieldNames: allowedFields.size,
    classifiedRawRows: selectedRows.length,
    positiveWeightEntries: entries.length,
    excludedNonPositiveWeightRows: excludedNonPositiveWeightRows.length,
    fieldGradePools: pools.length,
    poolItemSummaries: summary.length,
    classifiedDistinctItems: new Set(selectedRows.map(([, row]) =>
      String(nameValue(row.StaticItemId) ?? "").toLocaleLowerCase("en-US"))).size,
    distinctItems: new Set(entries.map((entry) => entry.itemId)).size,
    sources: sources.length,
    sourcesByKind: Object.fromEntries([...new Set(sources.map((source) => source.sourceKind))]
      .sort().map((kind) => [kind, sources.filter((source) => source.sourceKind === kind).length])),
    sourcesByOriginType: Object.fromEntries([...new Set(sources.map((source) => source.originType))]
      .sort().map((kind) => [kind, sources.filter((source) => source.originType === kind).length])),
    orphanPools: orphanPoolIds.length,
  };
  const snapshot = {
    schemaVersion: CHEST_DROP_SCHEMA_VERSION,
    source: {
      gameVersion: options.gameVersion ?? PINNED_GAME_VERSION,
      gameBuildId: options.gameBuildId ?? PINNED_BUILD_ID,
      extractionTool: "CUE4Parse",
      mappingSha256: options.mappingSha256 ?? PINNED_MAPPING_SHA256,
      inputs: options.inputs ?? {},
    },
    semantics: {
      poolIdentity: "FieldName + TreasureBoxGrade",
      probability: "Slot trigger chance multiplied by positive variant weight divided by the positive weight total in the same field, grade, and slot.",
      sameItemSameSlot: "Mutually exclusive variant weights are summed before computing item chance.",
      sameItemAcrossSlots: "Independent slot chances are combined as 1 - product(1 - p).",
      quantity: "MinNum..MaxNum is multiplied by NumUnit; expected quantity uses the midpoint of the inclusive integer range.",
      grade: "All item chances and expected quantities are conditionalOnGrade. No source grade distribution is inferred.",
    },
    counts,
    diagnostics: {
      excludedUnclassifiedRows: Object.keys(itemRows).length - selectedRows.length,
      excludedNonPositiveWeightRows,
      canonicalizedItemReferences,
      unresolvedItemReferences,
      blueprintFieldBranches: blueprintBranches.length,
      fallbackConsumerDomainFields: sources.filter((source) => source.originType === "auditedChestConsumerDomain")
        .map((source) => source.fieldName),
      orphanPoolIds,
    },
    sources,
    pools,
    entries,
    summary,
  };
  validateChestDropSnapshot(snapshot, {
    itemIds: new Set(input.itemSnapshot.items.map((item) => item.id)),
    expectedCounts: options.strictCoverage ? EXPECTED : undefined,
  });
  return snapshot;
}

export function validateChestDropSnapshot(snapshot, references = {}) {
  assert(snapshot?.schemaVersion === CHEST_DROP_SCHEMA_VERSION, "Unexpected chest-drop schema version");
  assert(snapshot.source?.gameVersion === PINNED_GAME_VERSION, "Unexpected chest-drop game version");
  assert(snapshot.source?.gameBuildId === PINNED_BUILD_ID, "Unexpected chest-drop game build ID");
  for (const key of ["sources", "pools", "entries", "summary"]) {
    assert(Array.isArray(snapshot[key]), `Chest snapshot must contain ${key}`);
  }
  assert(snapshot.counts.positiveWeightEntries === snapshot.entries.length, "Entry count mismatch");
  assert(snapshot.counts.fieldGradePools === snapshot.pools.length, "Pool count mismatch");
  assert(snapshot.counts.poolItemSummaries === snapshot.summary.length, "Summary count mismatch");
  assert(snapshot.counts.sources === snapshot.sources.length, "Source count mismatch");
  assert(snapshot.counts.classifiedRawRows === snapshot.entries.length
    + snapshot.counts.excludedNonPositiveWeightRows, "Classified row accounting mismatch");
  const poolById = new Map(snapshot.pools.map((pool) => [pool.id, pool]));
  assert(poolById.size === snapshot.pools.length, "Duplicate chest pool ID");
  const entryIds = new Set();
  for (const entry of snapshot.entries) {
    assert(!entryIds.has(entry.id), `Duplicate chest entry ID: ${entry.id}`);
    entryIds.add(entry.id);
    assert(poolById.has(entry.poolId), `Unknown pool on chest entry: ${entry.poolId}`);
    assert(entry.weight > 0 && entry.slotWeightTotal > 0, `Invalid chest weight: ${entry.id}`);
    assert(entry.slotTriggerChancePercent >= 0 && entry.slotTriggerChancePercent <= 100,
      `Invalid slot trigger chance: ${entry.id}`);
    assert(entry.conditionalOnGradeChancePercent >= 0 && entry.conditionalOnGradeChancePercent <= 100,
      `Invalid conditional chance: ${entry.id}`);
    assert(entry.minQuantity >= 0 && entry.maxQuantity >= entry.minQuantity,
      `Invalid quantity range: ${entry.id}`);
    assert(entry.expectedQuantityPerOpen >= 0, `Invalid expected quantity: ${entry.id}`);
    if (references.itemIds) assert(references.itemIds.has(entry.itemId), `Unknown item: ${entry.itemId}`);
  }
  for (const pool of snapshot.pools) {
    assert(pool.probabilityBasis === "conditionalOnGrade" && pool.gradeDistributionKnown === false,
      `Pool must remain conditional on grade: ${pool.id}`);
  }
  for (const source of snapshot.sources) {
    assert(SOURCE_KINDS.has(source.sourceKind), `Invalid source kind: ${source.id}`);
    assert(source.probabilityBasis === "conditionalOnGrade", `Invalid source probability basis: ${source.id}`);
    assert(source.poolIdsConditionalOnGrade.length > 0, `Source has no pools: ${source.id}`);
    for (const poolId of source.poolIdsConditionalOnGrade) {
      const pool = poolById.get(poolId);
      assert(pool && pool.fieldName === source.fieldName, `Invalid source pool reference: ${source.id}`);
    }
  }
  assert(snapshot.diagnostics.unresolvedItemReferences.length === 0, "Unresolved chest item references");
  assert(snapshot.counts.orphanPools === snapshot.diagnostics.orphanPoolIds.length, "Orphan count mismatch");
  if (references.expectedCounts) {
    for (const [key, expected] of Object.entries(references.expectedCounts)) {
      assert(snapshot.counts[key] === expected,
        `Unexpected ${key}: expected ${expected}, got ${snapshot.counts[key]}`);
    }
  }
  return snapshot.counts;
}

async function readJsonWithHash(path) {
  const bytes = await readFile(path);
  return { bytes, document: JSON.parse(bytes.toString("utf8")), sha256: sha256(bytes) };
}

async function readBlueprints(directory) {
  const names = (await readdir(directory)).filter((name) => name.toLowerCase().endsWith(".json")).sort();
  return Promise.all(names.map(async (name) => {
    const path = resolve(directory, name);
    const loaded = await readJsonWithHash(path);
    return { file: name, document: loaded.document, sha256: loaded.sha256 };
  }));
}

function usage() {
  return `Usage: node scripts/import-chest-drops.mjs <raw-drops-directory> <raw-chest-blueprints-directory> [options]

Options:
  --items-snapshot <path>  Default scripts/vendor/palworld/items-v1.json
  --output <path>          Default scripts/vendor/palworld/chest-drops-v1.json
  --game-version <value>   Default 1.0
  --game-build-id <value>  Default 24088745
  --mapping-sha256 <hash>  Default pinned Palworld 1.0 mapping hash
  --dry-run                Validate and print coverage without writing`;
}

export async function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      "items-snapshot": { type: "string" },
      output: { type: "string" },
      "game-version": { type: "string" },
      "game-build-id": { type: "string" },
      "mapping-sha256": { type: "string" },
      "dry-run": { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(usage());
    return;
  }
  assert(positionals.length === 2, usage());
  const rawDirectory = resolve(positionals[0]);
  const blueprintDirectory = resolve(positionals[1]);
  const itemPath = resolve(values["items-snapshot"]
    ?? resolve(root, "scripts/vendor/palworld/items-v1.json"));
  const tableNames = [
    "DT_ItemLotteryDataTable.json",
    "DT_FieldLotteryNameDataTable.json",
    "DT_DungeonItemLotteryDataTable.json",
    "DT_DungeonRewardSpawnerLotteryDataTable.json",
  ];
  const [itemLottery, fieldLottery, dungeonItem, dungeonReward, itemSnapshot, blueprints] = await Promise.all([
    readJsonWithHash(resolve(rawDirectory, tableNames[0])),
    readJsonWithHash(resolve(rawDirectory, tableNames[1])),
    readJsonWithHash(resolve(rawDirectory, tableNames[2])),
    readJsonWithHash(resolve(rawDirectory, tableNames[3])),
    readJsonWithHash(itemPath),
    readBlueprints(blueprintDirectory),
  ]);
  const tableLoads = [itemLottery, fieldLottery, dungeonItem, dungeonReward];
  const snapshot = normalizeChestDrops({
    itemLotteryDocument: itemLottery.document,
    fieldLotteryDocument: fieldLottery.document,
    dungeonItemDocument: dungeonItem.document,
    dungeonRewardDocument: dungeonReward.document,
    itemSnapshot: itemSnapshot.document,
    blueprints,
  }, {
    gameVersion: values["game-version"] ?? PINNED_GAME_VERSION,
    gameBuildId: values["game-build-id"] ?? PINNED_BUILD_ID,
    mappingSha256: values["mapping-sha256"] ?? PINNED_MAPPING_SHA256,
    strictCoverage: true,
    inputs: {
      tables: tableNames.map((file, index) => ({ file, sha256: tableLoads[index].sha256 })),
      blueprints: blueprints.map(({ file, sha256: hash }) => ({ file, sha256: hash })),
      itemSnapshot: { file: basename(itemPath), sha256: itemSnapshot.sha256 },
    },
  });
  if (values["dry-run"]) {
    console.log(JSON.stringify({ counts: snapshot.counts, diagnostics: {
      orphanPoolIds: snapshot.diagnostics.orphanPoolIds,
      fallbackConsumerDomainFields: snapshot.diagnostics.fallbackConsumerDomainFields,
    } }, null, 2));
    return;
  }
  const output = resolve(values.output ?? resolve(root, "scripts/vendor/palworld/chest-drops-v1.json"));
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Wrote ${snapshot.counts.fieldGradePools} conditional-grade pools from ${snapshot.counts.classifiedRawRows} classified rows.`);
  console.log(`Positive variants: ${snapshot.counts.positiveWeightEntries}; distinct items: ${snapshot.counts.distinctItems}.`);
  console.log(`Sources: ${snapshot.counts.sources}; orphan pools: ${snapshot.counts.orphanPools}.`);
  console.log(`Snapshot: ${output}`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch((error) => {
  console.error(`Chest-drop import failed: ${error.message}`);
  process.exitCode = 1;
});
