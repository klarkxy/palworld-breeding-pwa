import { describe, expect, it } from "vitest";
import {
  buildItemFamilies,
  findMatchingFamilyVariant,
  itemRarityLabel,
  itemRarityTone,
  itemRarityValue,
} from "@/core/itemFamilies";
import type { ItemRecipeRecord, ItemRecord } from "@/stores/itemData";

type TestItem = ItemRecord & { baseItemId?: string };

function makeItem(id: string, overrides: Partial<TestItem> = {}): TestItem {
  return {
    id,
    names: { zh: id, en: id },
    typeA: "Weapon",
    typeB: "WeaponMelee",
    rarity: 0,
    ...overrides,
  };
}

function unlockRecipe(id: string, productItemId: string): ItemRecipeRecord {
  return {
    id: productItemId,
    sourceTable: "main",
    product: { itemId: productItemId, count: 1 },
    materials: [],
    workAmountRaw: 1,
    unlockItemId: id,
  };
}

describe("buildItemFamilies", () => {
  it("keeps Metal Bat products and schematics in separate, rarity-sorted families", () => {
    const products = [4, 0, 2, 1, 3].map((rarity) => makeItem(
      rarity === 0 ? "Bat3" : `Bat3_${rarity + 1}`,
      {
        names: { zh: "金属球棒", en: "Metal Bat" },
        baseItemId: "Bat3",
        rarity,
        sortId: 108 - rarity,
      },
    ));
    const blueprints = [4, 1, 3, 2].map((rarity) => makeItem(`Blueprint_Bat3_${rarity + 1}`, {
      names: { zh: `金属球棒设计图${rarity}`, en: `Metal Bat Schematic ${rarity}` },
      typeA: "Blueprint",
      typeB: "Blueprint",
      rarity,
    }));
    const recipes = blueprints.map((blueprint) => unlockRecipe(
      blueprint.id,
      blueprint.id.replace("Blueprint_", ""),
    ));

    const families = buildItemFamilies([...blueprints, ...products], recipes);
    const productFamily = families.find((family) => family.id.endsWith(":Bat3") && family.kind === "item");
    const blueprintFamily = families.find((family) => family.id.endsWith(":Bat3") && family.kind === "blueprint");

    expect(productFamily?.variants.map((item) => item.id)).toEqual([
      "Bat3", "Bat3_2", "Bat3_3", "Bat3_4", "Bat3_5",
    ]);
    expect(blueprintFamily?.variants.map((item) => item.id)).toEqual([
      "Blueprint_Bat3_2", "Blueprint_Bat3_3", "Blueprint_Bat3_4", "Blueprint_Bat3_5",
    ]);
    expect(productFamily?.isGrouped).toBe(true);
    expect(blueprintFamily?.isGrouped).toBe(true);
    expect(productFamily?.id).not.toBe(blueprintFamily?.id);
  });

  it("keeps an unmapped schematic as a singleton", () => {
    const blueprint = makeItem("Blueprint_CandleStand", {
      typeA: "Blueprint",
      typeB: "Blueprint",
      rarity: 1,
    });
    const families = buildItemFamilies([blueprint], []);

    expect(families).toHaveLength(1);
    expect(families[0]).toMatchObject({ kind: "blueprint", isGrouped: false });
    expect(families[0].variants).toEqual([blueprint]);
  });

  it("splits the whole candidate family when rarity is duplicated", () => {
    const items = [
      makeItem("Gun_A", { names: { zh: "测试枪", en: "Test Gun" }, baseItemId: "Gun", rarity: 1 }),
      makeItem("Gun_B", { names: { zh: "测试枪", en: "Test Gun" }, baseItemId: "Gun", rarity: 1 }),
      makeItem("Gun_C", { names: { zh: "测试枪", en: "Test Gun" }, baseItemId: "Gun", rarity: 2 }),
    ];

    const families = buildItemFamilies(items, []);
    expect(families).toHaveLength(3);
    expect(families.every((family) => !family.isGrouped && family.variants.length === 1)).toBe(true);
  });

  it("does not aggregate a shared baseItemId when normalized display names differ", () => {
    const items = [
      makeItem("Wood", { names: { zh: "木材", en: "Wood" }, baseItemId: "Wood", rarity: 0 }),
      makeItem("Wood_Fine", { names: { zh: "优质木材", en: "Hardwood" }, baseItemId: "Wood", rarity: 1 }),
      makeItem("Wood_WorldTree", { names: { zh: "神话木材", en: "Mythical Wood" }, baseItemId: "Wood", rarity: 2 }),
    ];

    expect(buildItemFamilies(items, [])).toHaveLength(3);
    expect(buildItemFamilies(items, []).every((family) => !family.isGrouped)).toBe(true);
  });
});

describe("rarity helpers", () => {
  it("normalizes numeric and enum rarity values and exposes stable labels and tones", () => {
    const rare = makeItem("Rare", { rarity: "EPalRarityType::Rare" });
    expect(itemRarityValue(rare)).toBe(2);
    expect(itemRarityLabel(rare)).toBe("稀有");
    expect(itemRarityTone(rare)).toBe("rare");
    expect(itemRarityTone(makeItem("Legendary", { rarity: 4 }))).toBe("legendary");
    expect(itemRarityTone(makeItem("Internal", { rarity: 99 }))).toBe("unknown");
    expect(itemRarityTone()).toBe("unknown");
    expect(itemRarityLabel()).toBe("未知");
  });
});

describe("findMatchingFamilyVariant", () => {
  it("returns the exact quality variant that matched the search", () => {
    const products = [1, 2, 3, 4].map((rarity) => makeItem(`Bat3_${rarity + 1}`, {
      names: { zh: "金属球棒", en: "Metal Bat" },
      baseItemId: "Bat3",
      rarity,
    }));
    const blueprints = products.map((product, index) => makeItem(`Blueprint_${product.id}`, {
      names: { zh: `金属球棒设计图${index + 1}`, en: `Metal Bat Schematic ${index + 1}` },
      typeA: "Blueprint",
      typeB: "Blueprint",
      rarity: index + 1,
    }));
    const recipes = blueprints.map((blueprint, index) => unlockRecipe(blueprint.id, products[index].id));
    const family = buildItemFamilies([...products, ...blueprints], recipes)
      .find((entry) => entry.kind === "blueprint" && entry.isGrouped);

    expect(family).toBeDefined();
    expect(findMatchingFamilyVariant(
      family!,
      (item) => item.names.en?.toLocaleLowerCase().includes("schematic 4") === true,
    )?.id).toBe("Blueprint_Bat3_5");
    expect(findMatchingFamilyVariant(family!, () => false)).toBeUndefined();
  });
});
