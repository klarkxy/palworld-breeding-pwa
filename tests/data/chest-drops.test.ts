import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  normalizeChestDrops,
  validateChestDropSnapshot,
} from "../../scripts/import-chest-drops.mjs";

const grade = "EPalMapObjectTreasureGradeType::Grade1";

describe("Palworld chest-drop importer", () => {
  it("merges duplicate item variants within a slot and unions independent slots", () => {
    const snapshot = normalizeChestDrops({
      itemLotteryDocument: [{ Rows: {
        "1": {
          FieldName: "Grass01", SlotNo: 1, WeightInSlot: 1, StaticItemId: "A",
          MinNum: 1, MaxNum: 1, NumUnit: 1, TreasureBoxGrade: grade,
        },
        "2": {
          FieldName: "Grass01", SlotNo: 1, WeightInSlot: 3, StaticItemId: "A",
          MinNum: 2, MaxNum: 2, NumUnit: 1, TreasureBoxGrade: grade,
        },
        "3": {
          FieldName: "Grass01", SlotNo: 1, WeightInSlot: 6, StaticItemId: "B",
          MinNum: 1, MaxNum: 1, NumUnit: 1, TreasureBoxGrade: grade,
        },
        "4": {
          FieldName: "Grass01", SlotNo: 2, WeightInSlot: 5, StaticItemId: "A",
          MinNum: 1, MaxNum: 1, NumUnit: 3, TreasureBoxGrade: grade,
        },
        "5": {
          FieldName: "Grass01", SlotNo: 2, WeightInSlot: 5, StaticItemId: "B",
          MinNum: 1, MaxNum: 1, NumUnit: 1, TreasureBoxGrade: grade,
        },
        "6": {
          FieldName: "Grass01", SlotNo: 2, WeightInSlot: 100, StaticItemId: "B",
          MinNum: 1, MaxNum: 1, NumUnit: 1, TreasureBoxGrade: grade,
        },
      } }],
      fieldLotteryDocument: [{ Rows: {
        Grass01: { ItemSlot1_ProbabilityPercent: 100, ItemSlot2_ProbabilityPercent: 50 },
      } }],
      dungeonItemDocument: [{ Rows: {} }],
      dungeonRewardDocument: [{ Rows: {} }],
      blueprints: [{
        file: "BP_PalMapObjectSpawner_Treasure_Grass_Grade_01.json",
        sha256: "fixture",
        document: [
          {
            Type: "BlueprintGeneratedClass",
            Name: "BP_PalMapObjectSpawner_Treasure_Grass_Grade_01_C",
            Package: "Pal/Test/BP_PalMapObjectSpawner_Treasure_Grass_Grade_01",
            SuperStruct: { ObjectName: "Class'PalMapObjectSpawnerTreasureBox'" },
          },
          {
            Name: "Default__BP_PalMapObjectSpawner_Treasure_Grass_Grade_01_C",
            Properties: {
              SpawnMapObjectId: { Key: "TreasureBox" },
              FieldLotteryName: { Key: "Grass01" },
            },
          },
        ],
      }],
      itemSnapshot: { items: [{ id: "A" }, { id: "B" }] },
    });

    const item = snapshot.summary.find((entry: { itemId: string }) => entry.itemId === "A");
    expect(snapshot.entries.filter((entry: { itemId: string }) => entry.itemId === "A")).toHaveLength(3);
    expect(item.slotContributions[0]).toMatchObject({
      slot: 1,
      combinedItemWeight: 4,
      slotWeightTotal: 10,
      conditionalOnGradeChancePercent: 40,
      expectedQuantityPerOpen: 0.7,
    });
    // Slot 2 denominator includes both B variants, so A contributes 50% * 5 / 110.
    expect(item.slotContributions[1].conditionalOnGradeChancePercent).toBeCloseTo(2.272727272727, 10);
    expect(item.conditionalOnGradeChancePercent).toBeCloseTo(41.363636363636, 10);
    expect(item.expectedQuantityPerOpen).toBeCloseTo(0.768181818182, 10);
    expect(snapshot.sources[0]).toMatchObject({
      fieldName: "Grass01",
      mapObjectId: "TreasureBox",
      outerBranchChancePercent: 100,
      probabilityBasis: "conditionalOnGrade",
    });
  });

  it("keeps the checked 1.0 chest snapshot reproducible", () => {
    const snapshot = JSON.parse(readFileSync(
      resolve("scripts/vendor/palworld/chest-drops-v1.json"), "utf8"));
    const counts = validateChestDropSnapshot(snapshot);

    expect(counts).toMatchObject({
      classifiedFieldNames: 109,
      classifiedRawRows: 3_527,
      positiveWeightEntries: 3_523,
      excludedNonPositiveWeightRows: 4,
      fieldGradePools: 250,
      classifiedDistinctItems: 648,
      distinctItems: 647,
      poolItemSummaries: 3_504,
      sources: 170,
      orphanPools: 0,
    });
    const grassStone = snapshot.summary.find((entry: { poolId: string; itemId: string }) =>
      entry.poolId === "Grass01::Grade1" && entry.itemId === "PalUpgradeStone");
    expect(grassStone).toMatchObject({
      conditionalOnGradeChancePercent: 52.640444706477,
      expectedQuantityPerOpen: 0.789606670597,
    });
    const duplicateBoost = snapshot.summary.find((entry: { poolId: string; itemId: string }) =>
      entry.poolId === "Grass01::Grade1" && entry.itemId === "ExpBoost_02");
    expect(duplicateBoost.variantIds).toEqual(["lottery:31", "lottery:32"]);
    expect(duplicateBoost.conditionalOnGradeChancePercent).toBeCloseTo(11.320754716981, 10);

    const worldTree = snapshot.sources.filter((source: { id: string }) =>
      source.id.startsWith("blueprint:BP_PalMapObjectSpawner_Treasure_WorldTree:"));
    expect(worldTree.map((source: { outerBranchChancePercent: number }) =>
      source.outerBranchChancePercent)).toEqual([80, 6.666666666667, 6.666666666667, 6.666666666667]);
    expect(snapshot.pools.every((pool: { probabilityBasis: string; gradeDistributionKnown: boolean }) =>
      pool.probabilityBasis === "conditionalOnGrade" && pool.gradeDistributionKnown === false)).toBe(true);
  });
});
