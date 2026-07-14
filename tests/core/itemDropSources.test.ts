import { describe, expect, it } from "vitest";
import type { ChestItemDropRecord } from "../../src/stores/itemData";
import {
  describeChestQuantity,
  describeChestChance,
  DROP_SOURCE_PREVIEW_LIMIT,
  formatChestGrade,
  formatExpectedQuantityPerOpen,
  formatDropQuantity,
  palDropLevelLabel,
  palDropSourceLabel,
  resolveChestSource,
} from "../../src/components/itemDropSources";

const chestDrop = (values: Partial<ChestItemDropRecord> = {}): ChestItemDropRecord => ({
  fieldName: "TreasureSlotA",
  slot: 1,
  itemId: "Wool",
  minQuantity: 1,
  maxQuantity: 2,
  ...values,
});

describe("item drop source presentation", () => {
  it("formats quantities, source kinds, and level buckets", () => {
    expect(DROP_SOURCE_PREVIEW_LIMIT).toBe(12);
    expect(formatDropQuantity(2, 2)).toBe("× 2");
    expect(formatDropQuantity(2, 5)).toBe("× 2–5");
    expect(formatExpectedQuantityPerOpen(0.45653414495)).toBe("× 0.4565");
    expect(describeChestQuantity(chestDrop({ minQuantity: undefined, maxQuantity: undefined }))).toBeUndefined();
    expect(describeChestQuantity(chestDrop())).toBe("× 1–2");
    expect(formatChestGrade("Grade5")).toBe("5");
    expect(palDropSourceLabel("normal")).toBe("普通");
    expect(palDropSourceLabel("alpha")).toBe("Alpha");
    expect(palDropSourceLabel("predator")).toBe("凶猛");
    expect(palDropLevelLabel(0)).toBe("默认等级段");
    expect(palDropLevelLabel(70)).toBe("Lv.70 等级段");
  });

  it("keeps pool-summary probabilities explicitly conditional on a known grade", () => {
    expect(describeChestChance(chestDrop({
      probabilityBasis: "conditionalOnGrade",
      treasureBoxGrade: "Grade1",
      conditionalOnGradeChancePercent: 52.6404447064769,
    }))).toEqual({
      kind: "grade-conditional", label: "该品级开启概率", value: "52.6404%",
    });
    expect(describeChestChance(chestDrop({
      perOpenChancePercent: 12.5,
      treasureGrade: 3,
    }))).toEqual({
      kind: "grade-conditional", label: "该品级开启概率", value: "12.5%",
    });
    expect(describeChestChance(chestDrop({ chanceAtLeastOnePercent: 8.75 }))).toEqual({
      kind: "grade-conditional", label: "该品级开启概率", value: "8.75%",
    });

    // Legacy records without grade context remain compatible.
    expect(describeChestChance(chestDrop({ perOpenChancePercent: 12.5, weight: 80 }))).toEqual({
      kind: "per-open", label: "每次开启概率", value: "12.5%",
    });
    expect(describeChestChance(chestDrop({ chancePercent: 3.33 }))).toEqual({
      kind: "per-open", label: "每次开启概率", value: "3.33%",
    });
    expect(describeChestChance(chestDrop({ slotProbabilityPercent: 25, weight: 30 }))).toEqual({
      kind: "conditional", label: "条件概率", value: "25% · 权重 30",
    });
    expect(describeChestChance(chestDrop({ weight: 30 }))).toEqual({
      kind: "weight", label: "条件权重", value: "30",
    });
    expect(describeChestChance(chestDrop())).toEqual({
      kind: "unknown", label: "掉落概率", value: "尚未解析",
    });
  });

  it("resolves a chest's display source without losing region or grade", () => {
    const source = resolveChestSource(chestDrop({ sourceId: "dungeon-g3" }), [{
      id: "dungeon-g3",
      labelZh: "火山地牢宝箱",
      region: "火山区域",
      sourceKind: "dungeon",
      treasureBoxGrade: "Grade3",
    }]);
    expect(source).toEqual({
      label: "火山地牢宝箱",
      region: "火山区域",
      kind: "地牢宝箱",
      treasureGrade: "Grade3",
    });
    expect(resolveChestSource(chestDrop({ sourceLabel: "自定义宝箱" }), []).label).toBe("自定义宝箱");
  });

  it.each([
    ["field", "野外宝箱"],
    ["enemyCamp", "敌对据点宝箱"],
    ["oilrig", "油田宝箱"],
    ["treasureMap", "藏宝图宝箱"],
    ["dungeon", "地牢宝箱"],
    ["visible", "场景掉落宝箱"],
    ["elemental", "元素宝箱"],
  ])("localizes chest source kind %s", (sourceKind, expected) => {
    expect(resolveChestSource(chestDrop({
      poolId: "Grass01::Grade1",
      labelZh: "草原宝箱",
      sourceKind,
      treasureBoxGrade: "Grade1",
    }), [])).toEqual({
      label: "草原宝箱",
      region: undefined,
      kind: expected,
      treasureGrade: "Grade1",
    });
  });
});
