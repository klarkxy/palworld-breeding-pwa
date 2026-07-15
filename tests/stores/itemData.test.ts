import { afterEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useItemDataStore } from "../../src/stores/itemData";

afterEach(() => vi.unstubAllGlobals());

describe("item data store", () => {
  it("loads item, recipe, and drop snapshots once and builds reverse indexes", async () => {
    const documents: Record<string, unknown> = {
      "items.json": { items: [{ id: "Wool", names: { zh: "羊毛" } }] },
      "recipes.json": { recipes: [] },
      "item-drops.json": {
        palDrops: [{
          rowId: "SheepBall000", characterId: "SheepBall", palId: "SheepBall",
          sourceType: "normal", level: 0, itemId: "Wool", slot: 1,
          baseChancePercent: 100, minQuantity: 1, maxQuantity: 2, captureEligible: true,
        }, {
          rowId: "SheepBall080", characterId: "SheepBall", palId: "SheepBall",
          sourceType: "normal", level: 80, itemId: "Bone", slot: 1,
          baseChancePercent: 50, minQuantity: 1, maxQuantity: 1, captureEligible: true,
        }, {
          rowId: "InternalNpc000", characterId: "InternalNpc",
          sourceType: "normal", level: 0, itemId: "HiddenItem", slot: 1,
          baseChancePercent: 100, minQuantity: 1, maxQuantity: 1, captureEligible: true,
        }],
        chestDrops: [{
          poolId: "Grass01::Grade1", fieldName: "Grass01", itemId: "Wool",
          probabilityBasis: "conditionalOnGrade", treasureBoxGrade: "Grade1",
          conditionalOnGradeChancePercent: 20, expectedQuantityPerOpen: 0.4,
        }],
        chestSources: [{
          id: "Grass01::Grade1", fieldName: "Grass01", labelZh: "野外木箱",
          sourceKind: "field", treasureBoxGrade: "Grade1", region: "草原",
        }],
      },
    };
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const file = String(input).split("/").at(-1) ?? "";
      return new Response(JSON.stringify(documents[file]), {
        status: documents[file] ? 200 : 404,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    setActivePinia(createPinia());

    const store = useItemDataStore();
    expect(store.isLoaded).toBe(false);
    await store.load();
    await store.load();

    expect(store.isLoaded).toBe(true);
    expect(store.isLoading).toBe(false);
    expect(store.error).toBe("");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(store.palDropsByItem.get("Wool")).toHaveLength(1);
    expect(store.palDropsByPal.get("SheepBall")?.map((drop) => drop.level)).toEqual([0, 80]);
    expect(store.palDropsByPal.has("InternalNpc")).toBe(false);
    expect(store.palDropsByItem.get("HiddenItem")).toHaveLength(1);
    expect(store.chestDropsByItem.get("Wool")?.[0]?.conditionalOnGradeChancePercent).toBe(20);
    expect(store.chestDropsByItem.get("Wool")?.[0]?.expectedQuantityPerOpen).toBe(0.4);
    expect(store.chestSources[0]?.labelZh).toBe("野外木箱");
  });
  it("uses a uniquely unlocked product icon only for generic blueprints", async () => {
    const documents: Record<string, unknown> = {
      "items.json": { items: [
        { id: "Bat3_2", names: { zh: "金属球棒" }, typeA: "Weapon", icon: "/item-icons/Bat3.webp" },
        {
          id: "Blueprint_Bat3_2", names: { zh: "金属球棒设计图1" },
          typeA: "Blueprint", icon: "/item-icons/Blueprint.webp",
        },
        {
          id: "Blueprint_Building", names: { zh: "建筑设计图" },
          typeA: "Blueprint", icon: "/item-icons/Blueprint_Building.webp",
        },
        {
          id: "Blueprint_Ambiguous", names: { zh: "歧义设计图" },
          typeA: "Blueprint", icon: "/item-icons/Blueprint.webp",
        },
      ] },
      "recipes.json": { recipes: [
        {
          id: "Bat3_2", sourceTable: "main", product: { itemId: "Bat3_2", count: 1 },
          materials: [], workAmountRaw: 100, unlockItemId: "Blueprint_Bat3_2",
        },
        {
          id: "BuildingRecipe", sourceTable: "main", product: { itemId: "Bat3_2", count: 1 },
          materials: [], workAmountRaw: 100, unlockItemId: "Blueprint_Building",
        },
        {
          id: "AmbiguousRecipeA", sourceTable: "main", product: { itemId: "Bat3_2", count: 1 },
          materials: [], workAmountRaw: 100, unlockItemId: "Blueprint_Ambiguous",
        },
        {
          id: "AmbiguousRecipeB", sourceTable: "common", product: { itemId: "Bat3_2", count: 1 },
          materials: [], workAmountRaw: 200, unlockItemId: "Blueprint_Ambiguous",
        },
      ] },
      "item-drops.json": { palDrops: [] },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const file = String(input).split("/").at(-1) ?? "";
      return new Response(JSON.stringify(documents[file]), {
        status: documents[file] ? 200 : 404,
        headers: { "Content-Type": "application/json" },
      });
    }));
    setActivePinia(createPinia());

    const store = useItemDataStore();
    await store.load();

    expect(store.recipesByUnlockItem.get("Blueprint_Bat3_2")?.map((recipe) => recipe.id))
      .toEqual(["Bat3_2"]);
    expect(store.itemIconPreviewById.get("Blueprint_Bat3_2"))
      .toBe(store.itemById.get("Bat3_2"));
    expect(store.itemIconPreviewById.get("Blueprint_Building")).toBeUndefined();
    expect(store.recipesByUnlockItem.get("Blueprint_Ambiguous")).toHaveLength(2);
    expect(store.itemIconPreviewById.get("Blueprint_Ambiguous")).toBeUndefined();
  });
});
