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
    expect(store.chestDropsByItem.get("Wool")?.[0]?.conditionalOnGradeChancePercent).toBe(20);
    expect(store.chestDropsByItem.get("Wool")?.[0]?.expectedQuantityPerOpen).toBe(0.4);
    expect(store.chestSources[0]?.labelZh).toBe("野外木箱");
  });
});
