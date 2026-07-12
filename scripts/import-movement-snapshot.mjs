import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const input = process.argv[2];
if (!input) throw new Error("Usage: node scripts/import-movement-snapshot.mjs <raw-unpack.json>");

const [rawBytes, dbBytes] = await Promise.all([
  readFile(resolve(input)),
  readFile(resolve(root, "scripts/vendor/palcalc/db.json")),
]);
const raw = JSON.parse(rawBytes.toString("utf8"));
const db = JSON.parse(dbBytes.toString("utf8"));
const rawById = new Map(raw.records.map((record) => [record.id, record]));
const rawArtifactSha256 = createHash("sha256").update(rawBytes).digest("hex");
const movementTypes = {
  GroundOnly: "ground",
  Fly: "fly",
  FlyAndLanding: "flyAndLanding",
  Swim: "swim",
};

if (raw.source?.gameBuildId !== "24088745")
  throw new Error(`Unexpected game build: ${raw.source?.gameBuildId}`);
if (rawArtifactSha256 !== "528b804632f0030186804cd9b1b3a3a89b75f046baa0c77e713d2e3e76009d16")
  throw new Error(`Unexpected raw artifact checksum: ${rawArtifactSha256}`);
if (raw.source?.mappingSha256?.toLowerCase() !== "741798898aabf3da8803e26ff005a35052b33bd0c90d771aabbb5f2c367f7df7")
  throw new Error("Unexpected Mapping.usmap checksum");
if (raw.recordCount !== 753 || raw.records.length !== 753 || rawById.size !== raw.records.length)
  throw new Error("Expected 753 unique raw character rows");
if (raw.blueprintMovementCount !== 299)
  throw new Error(`Unexpected Blueprint movement count: ${raw.blueprintMovementCount}`);
if (db.Version !== "v23" || db.Pals.length !== 306)
  throw new Error("Expected the pinned PalCalc v23 snapshot with 306 records");

const records = db.Pals.map((pal) => {
  const row = rawById.get(pal.InternalName);
  if (!row) throw new Error(`Missing unpacked movement row: ${pal.InternalName}`);
  const effective = raw.effectiveBlueprintMovements?.[pal.InternalName];
  const rawMovementType = effective?.MovementType?.split("::").at(-1);
  const movementType = rawMovementType ? movementTypes[rawMovementType] : undefined;
  if (rawMovementType && !movementType)
    throw new Error(`Unexpected movement type for ${pal.InternalName}: ${rawMovementType}`);
  for (const [sourceKey, rawKey] of [
    ["BreedingPower", "breedingPower"],
    ["WalkSpeed", "walkSpeed"],
    ["RunSpeed", "runSpeed"],
    ["RideSprintSpeed", "rideSprintSpeed"],
    ["TransportSpeed", "transportSpeed"],
    ["Stamina", "stamina"],
  ]) if (pal[sourceKey] !== row[rawKey])
    throw new Error(`Unpack/PalCalc mismatch for ${pal.InternalName}.${rawKey}`);

  const result = {
    id: pal.InternalName,
    breedingPower: row.breedingPower,
    slowWalkSpeed: row.slowWalkSpeed,
    walkSpeed: row.walkSpeed,
    runSpeed: row.runSpeed,
    rideSprintSpeed: row.rideSprintSpeed,
    transportSpeed: row.transportSpeed,
    swimSpeed: row.swimSpeed,
    swimDashSpeed: row.swimDashSpeed,
    stamina: row.stamina,
  };
  for (const [key, value] of Object.entries(result))
    if (key !== "id" && !Number.isFinite(value)) throw new Error(`Invalid ${key}: ${pal.InternalName}`);
  if (movementType) result.movementType = movementType;
  if (effective?.FlySpeedOverride != null) result.flySpeedOverride = effective.FlySpeedOverride;
  if (effective?.FlySprintSpeedOverride != null) result.flySprintSpeedOverride = effective.FlySprintSpeedOverride;
  return result;
});

const selectableIds = new Set(db.Pals
  .filter((pal) => pal.Id.PalDexNo > 0 && pal.Id.PalDexNo < 10_000)
  .map((pal) => pal.InternalName));
const selectable = records.filter((record) => selectableIds.has(record.id));
if (selectable.length !== 288 || selectable.some((record) => !record.movementType))
  throw new Error("Expected movement types for all 288 selectable Pals");
const movementTypeCounts = Object.fromEntries(Object.values(movementTypes).map((type) => [
  type,
  selectable.filter((record) => record.movementType === type).length,
]));
const expectedTypeCounts = { ground: 252, fly: 21, flyAndLanding: 7, swim: 8 };
if (JSON.stringify(movementTypeCounts) !== JSON.stringify(expectedTypeCounts))
  throw new Error(`Unexpected selectable movement types: ${JSON.stringify(movementTypeCounts)}`);
const missingMovementTypes = records.filter((record) => !record.movementType).map((record) => record.id).sort();
const expectedMissing = [
  "AmaterasuWolf_Dark_Quest_Friend", "POLICE_HawkBird", "POLICE_ThunderDog",
  "PREDATOR_FlowerRabbit_Quest", "YakushimaMonster001_Blue", "YakushimaMonster001_Pink",
  "YakushimaMonster001_Purple", "YakushimaMonster001_Rainbow", "YakushimaMonster001_Red",
].sort();
if (JSON.stringify(missingMovementTypes) !== JSON.stringify(expectedMissing))
  throw new Error(`Unexpected movement-type gaps: ${missingMovementTypes.join(", ")}`);
const overrideIds = records.filter((record) => record.flySpeedOverride != null || record.flySprintSpeedOverride != null);
if (overrideIds.some((record) => record.flySpeedOverride == null || record.flySprintSpeedOverride == null)
  || overrideIds.length !== 6)
  throw new Error("Expected six paired effective fly-speed overrides");

const snapshot = {
  source: {
    gameVersion: "1.0",
    gameBuildId: raw.source.gameBuildId,
    gamePak: "Pal-Windows.pak",
    table: raw.source.table,
    extractedAtUtc: raw.source.extractedAtUtc,
    extractor: {
      name: "CUE4Parse",
      version: "1.2.2.202607",
      repo: "FabianFG/CUE4Parse",
      commit: "ecad882a3049df6f27e0c5c3a3531346305c010b",
    },
    mapping: {
      repo: "PalModding/UtililityFiles",
      commit: "455de2110d8414f703699204f33cb6ac052a3f98",
      blob: "4ae676dd2c13a3d74d32df5a89c6f437754ffcd6",
      sha256: raw.source.mappingSha256.toLowerCase(),
    },
    rawArtifactSha256,
  },
  counts: {
    rawRows: raw.recordCount,
    rawBlueprintMovements: raw.blueprintMovementCount,
    pals: records.length,
    selectableMovementTypes: selectable.length,
    movementTypes: movementTypeCounts,
    missingMovementTypes: missingMovementTypes.length,
    effectiveFlyOverrides: overrideIds.length,
  },
  records,
};

const output = resolve(root, "scripts/vendor/palworld/movement-v1.json");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Wrote ${records.length} movement records to ${output}`);
