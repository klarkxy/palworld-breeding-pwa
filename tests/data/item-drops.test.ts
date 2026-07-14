import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeItemDrops, validateItemDropSnapshot } from "../../scripts/import-item-drops.mjs";

const completeRow = (values: Record<string, unknown>) => ({
  CharacterID: "SheepBall",
  Level: 0,
  ...Object.fromEntries(Array.from({ length: 10 }, (_, index) => {
    const slot = index + 1;
    return [
      [`ItemId${slot}`, "None"], [`Rate${slot}`, 0], [`min${slot}`, 0], [`Max${slot}`, 0],
    ];
  }).flat()),
  ...values,
});

describe("Pal item-drop import", () => {
  it("keeps source kinds and levels while rejecting zero-rate slots", () => {
    const snapshot = normalizeItemDrops([{ Name: "DT_PalDropItem", Rows: {
      SheepBall000: completeRow({
        ItemId1: "Wool", Rate1: 100, min1: 1, Max1: 3,
        ItemId2: "Meat_SheepBall", Rate2: 100, min2: 1, Max2: 1,
        ItemId3: "Poppy", Rate3: 0, min3: 1, Max3: 1,
      }),
      BOSS_SheepBall070: completeRow({
        CharacterID: "BOSS_SheepBall", Level: 70,
        ItemId1: "poppy", Rate1: 25, min1: 2, Max1: 4,
      }),
      PREDATOR_Garm000: completeRow({
        CharacterID: "PREDATOR_Garm",
        ItemId1: "PredatorCrystal", Rate1: 100, min1: 1, Max1: 1,
      }),
      Hunter000: completeRow({
        CharacterID: "Hunter_Handgun",
        ItemId1: "Wool", Rate1: 100, min1: 1, Max1: 1,
      }),
    } }], [{ Name: "DT_PalMonsterParameter", Rows: {
      SheepBall: { Tribe: "EPalTribeID::SheepBall", BPClass: "SheepBall", IsBoss: false },
      BOSS_SheepBall: { Tribe: "EPalTribeID::SheepBall", BPClass: "BOSS_SheepBall", IsBoss: true },
      PREDATOR_Garm: { Tribe: "EPalTribeID::Garm", BPClass: "PREDATOR_Garm", IsBoss: true },
    } }], {
      items: [
        { id: "Wool", typeB: "MaterialProccessing" },
        { id: "Meat_SheepBall", typeB: "FoodMeat" },
        { id: "Poppy", typeB: "FoodVegetable" },
        { id: "PredatorCrystal", typeB: "MaterialProccessing" },
      ],
    }, { Pals: [
      { InternalName: "SheepBall" }, { InternalName: "Garm" },
    ] });

    expect(snapshot.counts).toMatchObject({
      rawSourceRows: 4,
      includedSourceRows: 3,
      excludedSourceRows: 1,
      sourceRowsByType: { normal: 1, alpha: 1, predator: 1 },
      palDropEdges: 4,
      canonicalizedItemReferences: 1,
      unresolvedItemRefs: 0,
    });
    expect(snapshot.diagnostics.ignoredNonPositiveSlots).toBe(1);
    expect(snapshot.palDrops).toEqual(expect.arrayContaining([
      expect.objectContaining({
        rowId: "BOSS_SheepBall070", palId: "SheepBall", sourceType: "alpha",
        level: 70, itemId: "Poppy", baseChancePercent: 25, minQuantity: 2, maxQuantity: 4,
      }),
      expect.objectContaining({
        rowId: "PREDATOR_Garm000", palId: "Garm", sourceType: "predator",
      }),
      expect.objectContaining({ itemId: "Meat_SheepBall", captureEligible: false }),
    ]));
  });

  it("prefers a selectable direct ID and leaves Tribe-only aliases out of the Paldex", () => {
    const snapshot = normalizeItemDrops([{ Name: "DT_PalDropItem", Rows: {
      PlantSlime_Flower000: completeRow({
        CharacterID: "PlantSlime_Flower", ItemId1: "Wool", Rate1: 100, min1: 1, Max1: 1,
      }),
      BOSS_PlantSlime_Flower000: completeRow({
        CharacterID: "BOSS_PlantSlime_Flower", ItemId1: "Wool", Rate1: 100, min1: 1, Max1: 1,
      }),
      PREDATOR_Garm_Quest000: completeRow({
        CharacterID: "PREDATOR_Garm_Quest", ItemId1: "Wool", Rate1: 100, min1: 1, Max1: 1,
      }),
      WingGolem_Oilrig000: completeRow({
        CharacterID: "WingGolem_Oilrig", ItemId1: "Wool", Rate1: 100, min1: 1, Max1: 1,
      }),
    } }], [{ Name: "DT_PalMonsterParameter", Rows: {
      PlantSlime_Flower: { Tribe: "EPalTribeID::PlantSlime" },
      BOSS_PlantSlime_Flower: { Tribe: "EPalTribeID::PlantSlime", IsBoss: true },
      PREDATOR_Garm_Quest: { Tribe: "EPalTribeID::Garm", IsBoss: false },
      WingGolem_Oilrig: { Tribe: "EPalTribeID::WingGolem", IsBoss: false },
    } }], { items: [{ id: "Wool", typeB: "MaterialProccessing" }] }, { Pals: [
      { InternalName: "PlantSlime" }, { InternalName: "PlantSlime_Flower" },
      { InternalName: "Garm" }, { InternalName: "WingGolem" },
    ] });

    expect(snapshot.counts).toMatchObject({
      includedSourceRows: 2,
      sourceRowsByType: { normal: 1, alpha: 1, predator: 0 },
      palDropEdges: 2,
    });
    expect(new Set(snapshot.palDrops.map((drop) => drop.palId))).toEqual(new Set(["PlantSlime_Flower"]));
    expect(snapshot.diagnostics.monsterTribeMismatches).toHaveLength(2);
    expect(snapshot.diagnostics.tribeOnlyAliasRows.map((row: { rowId: string }) => row.rowId)).toEqual([
      "PREDATOR_Garm_Quest000", "WingGolem_Oilrig000",
    ]);
  });

  it("keeps the checked 1.0 snapshot reproducible and level buckets separate", () => {
    const document = JSON.parse(readFileSync(resolve("public/data/item-drops.json"), "utf8"));
    const itemDocument = JSON.parse(readFileSync(resolve("public/data/items.json"), "utf8"));
    const paldex = JSON.parse(readFileSync(resolve("public/data/paldex.json"), "utf8"));
    const itemById = new Map(itemDocument.items.map((item: { id: string }) => [item.id, item]));
    const counts = validateItemDropSnapshot(document, {
      itemIds: new Set(itemById.keys()), itemById,
      palIds: new Set(paldex.pals.map((pal: { id: string }) => pal.id)),
    });

    expect(counts).toMatchObject({
      rawSourceRows: 1_044,
      includedSourceRows: 790,
      rawMonsterParameterRows: 753,
      sourceRowsByType: { normal: 417, alpha: 330, predator: 43 },
      distinctDropPals: 288,
      palDropEdges: 2_645,
      distinctDropItems: 148,
      captureIneligibleEdges: 32,
      canonicalizedItemReferences: 2,
      unresolvedItemRefs: 0,
      chestDropEdges: 3_504,
      chestDropItems: 647,
      chestDropFields: 109,
      chestDropPools: 250,
      chestDropPositiveEntries: 3_523,
      chestAuditedSources: 170,
      chestOrphanPools: 0,
    });
    expect(document.chestDrops).toHaveLength(3_504);
    expect(document.chestSources).toHaveLength(109);
    const grassStone = document.chestDrops.find((drop: Record<string, unknown>) =>
      drop.poolId === "Grass01::Grade1" && drop.itemId === "PalUpgradeStone");
    expect(grassStone).toMatchObject({
      sourceId: "field:Grass01",
      sourceKind: "field",
      fieldName: "Grass01",
      probabilityBasis: "conditionalOnGrade",
      conditionalOnGradeChancePercent: 52.640444706477,
      expectedQuantityPerOpen: 0.789606670597,
      minQuantity: 1,
      maxQuantity: 2,
      treasureBoxGrade: "Grade1",
      treasureGrade: "Grade1",
    });
    expect(grassStone).not.toHaveProperty("perOpenChancePercent");
    expect(document.chestDrops.every((drop: { sourceIds: string[] }) => drop.sourceIds.length > 0)).toBe(true);
    const anubisBone = document.palDrops.filter((drop: Record<string, unknown>) =>
      drop.palId === "Anubis" && drop.sourceType === "normal" && drop.itemId === "Bone");
    expect(anubisBone.map((drop: { level: number }) => drop.level).sort((a: number, b: number) => a - b))
      .toEqual([0, 80]);
    expect(document.palDrops.every((drop: { baseChancePercent: number }) =>
      drop.baseChancePercent > 0 && drop.baseChancePercent <= 100)).toBe(true);
  });
});
