import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { rowsOf } from "./import-item-snapshot.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PINNED_GAME_VERSION = "1.0";
const PINNED_BUILD_ID = "24088745";
const PINNED_MAPPING_SHA256 = "741798898aabf3da8803e26ff005a35052b33bd0c90d771aabbb5f2c367f7df7";
const SOURCE_TYPES = new Set(["normal", "alpha", "predator"]);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export const ITEM_DROP_SCHEMA_VERSION = 2;

function numberField(row, key, label) {
  const value = row[key];
  const number = typeof value === "number" ? value
    : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  assert(Number.isFinite(number), `Invalid ${label}: ${JSON.stringify(value)}`);
  return number;
}

function palIndexOf(document) {
  const records = Array.isArray(document?.Pals) ? document.Pals
    : Array.isArray(document?.pals) ? document.pals : undefined;
  assert(records, "Pal catalog must contain Pals or pals");
  const selectable = records.filter((record) => {
    if (typeof record.selectable === "boolean") return record.selectable;
    const dexNo = record.Id?.PalDexNo ?? record.dexNo;
    // Small fixtures predate the selectable flag; production PalCalc records
    // are selected by the same Paldex range used by generate_data.py.
    return dexNo === undefined || (Number.isInteger(dexNo) && dexNo > 0 && dexNo < 10_000);
  });
  const result = new Map();
  for (const record of selectable) {
    const id = record.InternalName ?? record.id;
    assert(typeof id === "string" && id, "Pal catalog contains an invalid ID");
    const folded = id.toLocaleLowerCase("en-US");
    assert(!result.has(folded), `Case-insensitive duplicate selectable Pal ID: ${id}`);
    result.set(folded, id);
  }
  return { records, selectable, byFoldedId: result };
}

function foldedIndex(rows, label) {
  const result = new Map();
  for (const [id, row] of Object.entries(rows)) {
    const folded = id.toLocaleLowerCase("en-US");
    assert(!result.has(folded), `Case-insensitive duplicate ${label} row: ${id}`);
    result.set(folded, { id, row });
  }
  return result;
}

function palIdFromTribe(tribe) {
  return typeof tribe === "string" && tribe.startsWith("EPalTribeID::")
    ? tribe.slice("EPalTribeID::".length) : undefined;
}

function classifyCharacter(characterId, palByFoldedId) {
  const foldedCharacterId = characterId.toLocaleLowerCase("en-US");
  const normalPalId = palByFoldedId.get(foldedCharacterId);
  if (normalPalId) return { sourceType: "normal", palId: normalPalId, candidate: characterId };

  for (const [prefix, sourceType] of [["BOSS_", "alpha"], ["PREDATOR_", "predator"]]) {
    if (!foldedCharacterId.startsWith(prefix.toLocaleLowerCase("en-US"))) continue;
    const candidate = characterId.slice(prefix.length);
    const palId = palByFoldedId.get(candidate.toLocaleLowerCase("en-US"));
    if (palId) return { sourceType, palId, candidate };
  }
  return undefined;
}

function rawTableMetadata(document, fallbackAsset, fallbackName) {
  const exportObject = Array.isArray(document) ? document[0] : document;
  return {
    asset: exportObject?.Package ?? fallbackAsset,
    name: exportObject?.Name ?? fallbackName,
  };
}

export function normalizeItemDrops(rawDocument, monsterParameterDocument, itemSnapshot, palCatalog, options = {}) {
  const rows = rowsOf(rawDocument, "Pal drop table");
  const monsterRows = rowsOf(monsterParameterDocument, "Pal monster-parameter table");
  const monsterByCharacterId = foldedIndex(monsterRows, "monster-parameter");
  const palCatalogIndex = palIndexOf(palCatalog);
  const palIds = new Set(palCatalogIndex.byFoldedId.values());
  const items = itemSnapshot?.items;
  assert(Array.isArray(items), "Item snapshot must contain items");
  const itemByFoldedId = new Map();
  for (const item of items) {
    assert(typeof item.id === "string" && item.id, "Item snapshot contains an invalid ID");
    const folded = item.id.toLocaleLowerCase("en-US");
    assert(!itemByFoldedId.has(folded), `Case-insensitive duplicate item ID: ${item.id}`);
    itemByFoldedId.set(folded, item);
  }

  const palDrops = [];
  const referenceCorrections = [];
  const unresolvedItemRefs = [];
  const excludedByPrefix = {};
  const sourceRowsByType = { normal: 0, alpha: 0, predator: 0 };
  const excludedByReason = {
    missingMonsterParameter: 0,
    nonSelectableOrUnknownTribe: 0,
    tribeOnlyAlias: 0,
  };
  const missingMonsterParameterRows = [];
  const nonSelectableTribeRows = [];
  const tribeOnlyAliasRows = [];
  const characterFNameCorrections = [];
  const palFNameCorrections = [];
  const monsterTribeMismatches = [];
  let ignoredNoneSlots = 0;
  let ignoredNonPositiveSlots = 0;
  let includedSourceRows = 0;

  for (const [rowId, row] of Object.entries(rows).sort(([left], [right]) => left.localeCompare(right))) {
    assert(row && typeof row === "object" && !Array.isArray(row), `Invalid drop row: ${rowId}`);
    const characterId = row.CharacterID;
    assert(typeof characterId === "string" && characterId, `Missing CharacterID in ${rowId}`);
    const monsterMatch = monsterByCharacterId.get(characterId.toLocaleLowerCase("en-US"));
    if (!monsterMatch) {
      excludedByReason.missingMonsterParameter += 1;
      missingMonsterParameterRows.push({ rowId, characterId });
      const prefix = characterId.split("_", 1)[0] || "(empty)";
      excludedByPrefix[prefix] = (excludedByPrefix[prefix] ?? 0) + 1;
      continue;
    }
    const monster = monsterMatch.row;
    const tribeId = palIdFromTribe(monster.Tribe);
    const tribePalId = tribeId
      ? palCatalogIndex.byFoldedId.get(tribeId.toLocaleLowerCase("en-US")) : undefined;
    const source = classifyCharacter(characterId, palCatalogIndex.byFoldedId);
    if (!source) {
      if (tribePalId) {
        excludedByReason.tribeOnlyAlias += 1;
        tribeOnlyAliasRows.push({
          rowId, characterId, monsterRowId: monsterMatch.id,
          tribe: monster.Tribe, suggestedPalId: tribePalId,
        });
        continue;
      }
      excludedByReason.nonSelectableOrUnknownTribe += 1;
      nonSelectableTribeRows.push({
        rowId, characterId, monsterRowId: monsterMatch.id,
        tribe: monster.Tribe ?? "None", zukanIndex: monster.ZukanIndex,
      });
      continue;
    }
    if (monsterMatch.id !== characterId) characterFNameCorrections.push({
      rowId, source: characterId, canonical: monsterMatch.id,
    });
    if (source.candidate !== source.palId) palFNameCorrections.push({
      rowId, source: source.candidate, canonical: source.palId,
    });
    // CharacterID is authoritative for directly selectable variants. The
    // current table intentionally gives PlantSlime_Flower the base
    // PlantSlime Tribe; record that mismatch instead of collapsing the Pal.
    if (tribePalId && tribePalId !== source.palId) monsterTribeMismatches.push({
      rowId, characterId, directPalId: source.palId, tribePalId,
    });

    includedSourceRows += 1;
    sourceRowsByType[source.sourceType] += 1;
    const level = numberField(row, "Level", `${rowId}.Level`);
    assert(Number.isInteger(level) && level >= 0, `Invalid level in ${rowId}: ${level}`);

    for (let slot = 1; slot <= 10; slot += 1) {
      const rawItemId = row[`ItemId${slot}`];
      const rate = numberField(row, `Rate${slot}`, `${rowId}.Rate${slot}`);
      if (!rawItemId || rawItemId === "None") {
        ignoredNoneSlots += 1;
        continue;
      }
      if (rate <= 0) {
        ignoredNonPositiveSlots += 1;
        continue;
      }
      assert(rate <= 100, `Drop chance exceeds 100 in ${rowId} slot ${slot}: ${rate}`);
      const item = itemByFoldedId.get(String(rawItemId).toLocaleLowerCase("en-US"));
      if (!item) {
        unresolvedItemRefs.push({ rowId, slot, itemId: String(rawItemId) });
        continue;
      }
      if (item.id !== rawItemId) referenceCorrections.push({
        rowId, slot, source: String(rawItemId), canonical: item.id,
      });
      const minQuantity = numberField(row, `min${slot}`, `${rowId}.min${slot}`);
      const maxQuantity = numberField(row, `Max${slot}`, `${rowId}.Max${slot}`);
      assert(Number.isInteger(minQuantity) && minQuantity > 0,
        `Invalid minimum quantity in ${rowId} slot ${slot}: ${minQuantity}`);
      assert(Number.isInteger(maxQuantity) && maxQuantity >= minQuantity,
        `Invalid maximum quantity in ${rowId} slot ${slot}: ${maxQuantity}`);
      palDrops.push({
        rowId,
        characterId,
        monsterRowId: monsterMatch.id,
        palId: source.palId,
        sourceType: source.sourceType,
        level,
        itemId: item.id,
        slot,
        baseChancePercent: rate,
        minQuantity,
        maxQuantity,
        captureEligible: item.typeB !== "FoodMeat",
      });
    }
  }

  const counts = {
    rawSourceRows: Object.keys(rows).length,
    rawMonsterParameterRows: Object.keys(monsterRows).length,
    includedSourceRows,
    excludedSourceRows: Object.keys(rows).length - includedSourceRows,
    sourceRowsByType,
    distinctDropPals: new Set(palDrops.map((drop) => drop.palId)).size,
    palDropEdges: palDrops.length,
    distinctDropItems: new Set(palDrops.map((drop) => drop.itemId)).size,
    captureIneligibleEdges: palDrops.filter((drop) => !drop.captureEligible).length,
    canonicalizedItemReferences: referenceCorrections.length,
    unresolvedItemRefs: unresolvedItemRefs.length,
    chestDropEdges: 0,
  };
  const table = rawTableMetadata(rawDocument,
    "Pal/Content/Pal/DataTable/Character/DT_PalDropItem", "DT_PalDropItem");
  const monsterTable = rawTableMetadata(monsterParameterDocument,
    "Pal/Content/Pal/DataTable/Character/DT_PalMonsterParameter", "DT_PalMonsterParameter");
  const snapshot = {
    schemaVersion: ITEM_DROP_SCHEMA_VERSION,
    source: {
      gameVersion: options.gameVersion ?? PINNED_GAME_VERSION,
      gameBuildId: options.gameBuildId ?? PINNED_BUILD_ID,
      extractionTool: "CUE4Parse",
      mappingSha256: options.mappingSha256 ?? PINNED_MAPPING_SHA256,
      rawTable: {
        ...table,
        file: options.rawFile ?? "DT_PalDropItem.json",
        sha256: options.rawSha256,
        rows: Object.keys(rows).length,
      },
      monsterParameterTable: {
        ...monsterTable,
        file: options.monsterParameterFile ?? "DT_PalMonsterParameter.json",
        sha256: options.monsterParameterSha256,
        rows: Object.keys(monsterRows).length,
      },
      palCatalogRows: palCatalogIndex.records.length,
      selectablePalRows: palCatalogIndex.selectable.length,
      palCatalogSha256: options.palCatalogSha256,
      itemSnapshotSha256: options.itemSnapshotSha256,
    },
    counts,
    diagnostics: {
      excludedSourceRows: counts.excludedSourceRows,
      excludedByReason,
      excludedByCharacterPrefix: Object.fromEntries(Object.entries(excludedByPrefix)
        .sort(([left], [right]) => left.localeCompare(right))),
      missingMonsterParameterRows,
      nonSelectableTribeRows,
      tribeOnlyAliasRows,
      characterFNameCorrections,
      palFNameCorrections,
      monsterTribeMismatches,
      ignoredNoneSlots,
      ignoredNonPositiveSlots,
      referenceCorrections,
      unresolvedItemRefs,
    },
    palDrops,
    chestDrops: [],
  };
  validateItemDropSnapshot(snapshot, { itemIds: new Set(items.map((item) => item.id)), palIds });
  return snapshot;
}

export function validateItemDropSnapshot(snapshot, references = {}) {
  assert(snapshot?.schemaVersion === ITEM_DROP_SCHEMA_VERSION, "Unexpected item-drop schema version");
  assert(snapshot.source?.gameVersion === PINNED_GAME_VERSION, "Unexpected item-drop game version");
  assert(snapshot.source?.gameBuildId === PINNED_BUILD_ID, "Unexpected item-drop game build ID");
  assert(Array.isArray(snapshot.palDrops), "Item-drop snapshot must contain palDrops");
  assert(Array.isArray(snapshot.chestDrops), "Item-drop snapshot must reserve chestDrops");
  assert(snapshot.counts.palDropEdges === snapshot.palDrops.length, "Pal-drop edge count mismatch");
  assert(snapshot.counts.chestDropEdges === snapshot.chestDrops.length, "Chest-drop edge count mismatch");
  assert(snapshot.counts.rawSourceRows === snapshot.counts.includedSourceRows
    + snapshot.counts.excludedSourceRows, "Item-drop source-row accounting mismatch");
  assert(snapshot.counts.rawMonsterParameterRows === snapshot.source?.monsterParameterTable?.rows,
    "Monster-parameter source-row accounting mismatch");
  assert(Number.isInteger(snapshot.source?.selectablePalRows)
    && snapshot.source.selectablePalRows > 0,
  "Item-drop source must record its selectable Pal catalog size");
  assert(Object.values(snapshot.counts.sourceRowsByType).reduce((sum, count) => sum + count, 0)
    === snapshot.counts.includedSourceRows, "Item-drop source-type accounting mismatch");
  assert(snapshot.counts.unresolvedItemRefs === 0, "Item-drop snapshot has unresolved item references");
  if (snapshot.diagnostics) {
    assert(snapshot.diagnostics.unresolvedItemRefs.length === 0,
      "Item-drop diagnostics have unresolved item references");
    assert(Object.values(snapshot.diagnostics.excludedByReason)
      .reduce((sum, count) => sum + count, 0) === snapshot.counts.excludedSourceRows,
    "Item-drop exclusion diagnostics do not balance");
  }

  const seen = new Set();
  for (const drop of snapshot.palDrops) {
    const key = `${drop.rowId}\0${drop.slot}`;
    assert(!seen.has(key), `Duplicate item-drop slot: ${drop.rowId} slot ${drop.slot}`);
    seen.add(key);
    assert(SOURCE_TYPES.has(drop.sourceType), `Unknown item-drop source type: ${drop.sourceType}`);
    assert(Number.isInteger(drop.level) && drop.level >= 0, `Invalid item-drop level: ${drop.rowId}`);
    assert(Number.isInteger(drop.slot) && drop.slot >= 1 && drop.slot <= 10,
      `Invalid item-drop slot: ${drop.rowId}`);
    assert(drop.baseChancePercent > 0 && drop.baseChancePercent <= 100,
      `Invalid item-drop chance: ${drop.rowId}`);
    assert(Number.isInteger(drop.minQuantity) && drop.minQuantity > 0
      && Number.isInteger(drop.maxQuantity) && drop.maxQuantity >= drop.minQuantity,
    `Invalid item-drop quantity: ${drop.rowId}`);
    assert(typeof drop.captureEligible === "boolean", `Invalid capture flag: ${drop.rowId}`);
    assert(typeof drop.monsterRowId === "string" && drop.monsterRowId,
      `Invalid monster-parameter row: ${drop.rowId}`);
    if (references.itemIds) assert(references.itemIds.has(drop.itemId),
      `Unknown item-drop item ID: ${drop.itemId}`);
    if (references.palIds) assert(references.palIds.has(drop.palId),
      `Unknown item-drop Pal ID: ${drop.palId}`);
    if (references.itemById) assert(drop.captureEligible
      === (references.itemById.get(drop.itemId)?.typeB !== "FoodMeat"),
    `Incorrect capture eligibility: ${drop.rowId} slot ${drop.slot}`);
  }
  assert(new Set(snapshot.palDrops.map((drop) => drop.itemId)).size
    === snapshot.counts.distinctDropItems, "Distinct item-drop item count mismatch");
  assert(snapshot.palDrops.filter((drop) => !drop.captureEligible).length
    === snapshot.counts.captureIneligibleEdges, "Capture-ineligible item-drop count mismatch");
  assert(new Set(snapshot.palDrops.map((drop) => drop.palId)).size
    === snapshot.counts.distinctDropPals, "Distinct item-drop Pal count mismatch");
  return snapshot.counts;
}

function publicDocument(snapshot) {
  return {
    schemaVersion: snapshot.schemaVersion,
    gameVersion: snapshot.source.gameVersion,
    gameBuildId: snapshot.source.gameBuildId,
    source: snapshot.source,
    counts: snapshot.counts,
    palDrops: snapshot.palDrops,
    chestDrops: snapshot.chestDrops,
  };
}

export async function writeItemDrops(snapshot, options = {}) {
  const snapshotOutput = resolve(options.snapshotOutput
    ?? resolve(root, "scripts/vendor/palworld/item-drops-v1.json"));
  const publicOutput = options.publicOutput ? resolve(options.publicOutput) : undefined;
  const directories = [mkdir(dirname(snapshotOutput), { recursive: true })];
  if (publicOutput) directories.push(mkdir(dirname(publicOutput), { recursive: true }));
  await Promise.all(directories);
  const snapshotBytes = Buffer.from(`${JSON.stringify(snapshot, null, 2)}\n`);
  const publicBytes = Buffer.from(`${JSON.stringify(publicDocument(snapshot))}\n`);
  const writes = [writeFile(snapshotOutput, snapshotBytes)];
  if (publicOutput) writes.push(writeFile(publicOutput, publicBytes));
  await Promise.all(writes);
  return { snapshotOutput, publicOutput, snapshotSha256: sha256(snapshotBytes) };
}

function usage() {
  return `Usage: node scripts/import-item-drops.mjs <DT_PalDropItem.json> [options]

Options:
  --items-snapshot <path>   Default scripts/vendor/palworld/items-v1.json
  --pal-catalog <path>      Default scripts/vendor/palcalc/db.json
  --monster-parameters <path> Default sibling DT_PalMonsterParameter.json
  --snapshot-output <path>  Default scripts/vendor/palworld/item-drops-v1.json
  --public-output <path>    Optional Pal-only debug output; normally run generate_data.py
  --game-version <version>  Default 1.0
  --game-build-id <id>      Default 24088745
  --mapping-sha256 <hash>   Default pinned Palworld 1.0 mapping hash
  --dry-run                 Validate and print counts without writing files`;
}

export async function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      "items-snapshot": { type: "string" },
      "pal-catalog": { type: "string" },
      "monster-parameters": { type: "string" },
      "snapshot-output": { type: "string" },
      "public-output": { type: "string" },
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
  assert(positionals.length === 1, usage());
  const rawPath = resolve(positionals[0]);
  const monsterParameterPath = resolve(values["monster-parameters"]
    ?? resolve(dirname(rawPath), "DT_PalMonsterParameter.json"));
  const itemPath = resolve(values["items-snapshot"]
    ?? resolve(root, "scripts/vendor/palworld/items-v1.json"));
  const palPath = resolve(values["pal-catalog"]
    ?? resolve(root, "scripts/vendor/palcalc/db.json"));
  const [rawBytes, monsterParameterBytes, itemBytes, palBytes] = await Promise.all([
    readFile(rawPath), readFile(monsterParameterPath), readFile(itemPath), readFile(palPath),
  ]);
  const snapshot = normalizeItemDrops(
    JSON.parse(rawBytes.toString("utf8")),
    JSON.parse(monsterParameterBytes.toString("utf8")),
    JSON.parse(itemBytes.toString("utf8")),
    JSON.parse(palBytes.toString("utf8")),
    {
      gameVersion: values["game-version"] ?? PINNED_GAME_VERSION,
      gameBuildId: values["game-build-id"] ?? PINNED_BUILD_ID,
      mappingSha256: values["mapping-sha256"] ?? PINNED_MAPPING_SHA256,
      rawFile: basename(rawPath),
      rawSha256: sha256(rawBytes),
      monsterParameterFile: basename(monsterParameterPath),
      monsterParameterSha256: sha256(monsterParameterBytes),
      itemSnapshotSha256: sha256(itemBytes.toString("utf8").replaceAll("\r\n", "\n")),
      palCatalogSha256: sha256(palBytes.toString("utf8").replaceAll("\r\n", "\n")),
    },
  );
  if (values["dry-run"]) {
    console.log(JSON.stringify(snapshot.counts, null, 2));
    return;
  }
  const written = await writeItemDrops(snapshot, {
    snapshotOutput: values["snapshot-output"],
    publicOutput: values["public-output"],
  });
  console.log(`Wrote ${snapshot.counts.includedSourceRows} Pal drop rows and ${snapshot.palDrops.length} edges.`);
  console.log(`Snapshot: ${written.snapshotOutput}`);
  if (written.publicOutput) console.log(`Pal-only debug data: ${written.publicOutput}`);
  else console.log("Run python scripts/generate_data.py to merge Pal and chest drops into public data.");
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch((error) => {
  console.error(`Item-drop import failed: ${error.message}`);
  process.exitCode = 1;
});
