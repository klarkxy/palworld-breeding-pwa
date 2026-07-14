import { describe, expect, it } from "vitest";
import {
  calculateItemEconomics,
  type ItemCatalogRecord,
  type ItemCraftCatalog,
  type ItemRecipeRecord,
} from "../../src/core";

const item = (id: string, sellPrice?: number): ItemCatalogRecord => ({
  id,
  names: { zh: id, en: id },
  ...(sellPrice === undefined ? {} : { sellPrice }),
});

const recipe = (
  id: string,
  outputId: string,
  outputQuantity: number,
  ingredients: readonly [string, number][],
  workAmount?: number,
): ItemRecipeRecord => ({
  id,
  output: { itemId: outputId, quantity: outputQuantity },
  ingredients: ingredients.map(([itemId, quantity]) => ({ itemId, quantity })),
  ...(workAmount === undefined ? {} : { workAmount }),
});

const calculate = (
  catalog: ItemCraftCatalog,
  options?: Parameters<typeof calculateItemEconomics>[1],
) => new Map(calculateItemEconomics(catalog, options).map((record) => [record.itemId, record]));

describe("item economics", () => {
  it("keeps a leaf's own work unavailable while treating it as zero crafting work upstream", () => {
    const result = calculate({
      items: [item("Product", 100), item("Raw")],
      recipes: [recipe("make-product", "Product", 2, [["Raw", 3]], 10)],
    });

    expect(result.get("Raw")).toEqual({ itemId: "Raw", status: "base-material" });
    expect(result.get("Product")).toEqual({
      itemId: "Product",
      status: "calculated",
      totalWorkAmount: 5,
      goldPerWork: 20,
      selectedRecipeId: "make-product",
    });
  });

  it("includes recursive material work and normalizes every recipe by its output count", () => {
    const result = calculate({
      items: [item("Target", 22), item("Part"), item("Ore")],
      recipes: [
        recipe("make-target", "Target", 4, [["Part", 6]], 20),
        recipe("make-part", "Part", 2, [["Ore", 3]], 8),
      ],
    });

    expect(result.get("Part")).toMatchObject({ totalWorkAmount: 4 });
    expect(result.get("Target")).toEqual({
      itemId: "Target",
      status: "calculated",
      totalWorkAmount: 11,
      goldPerWork: 2,
      selectedRecipeId: "make-target",
    });
  });

  it("chooses the cheapest valid recursive recipe and breaks exact ties by recipe id", () => {
    const result = calculate({
      items: [item("Target"), item("Part"), item("Raw")],
      recipes: [
        recipe("z-direct", "Target", 1, [["Raw", 1]], 12),
        recipe("m-part", "Target", 1, [["Part", 2]], 1),
        recipe("make-part", "Part", 1, [["Raw", 1]], 3),
        recipe("b-tie", "Target", 1, [["Raw", 1]], 7),
        recipe("a-tie", "Target", 1, [["Raw", 2]], 7),
      ],
    });

    expect(result.get("Target")).toMatchObject({
      totalWorkAmount: 7,
      selectedRecipeId: "a-tie",
    });
  });

  it("rejects cyclic routes but still selects an acyclic alternative", () => {
    const result = calculate({
      items: [item("A"), item("B"), item("Raw")],
      recipes: [
        recipe("cycle-a", "A", 1, [["B", 1]], 1),
        recipe("safe-a", "A", 1, [["Raw", 1]], 9),
        recipe("cycle-b", "B", 1, [["A", 1]], 1),
      ],
    });

    expect(result.get("A")).toMatchObject({
      status: "calculated",
      totalWorkAmount: 9,
      selectedRecipeId: "safe-a",
    });
    expect(result.get("B")).toMatchObject({
      status: "calculated",
      totalWorkAmount: 10,
      selectedRecipeId: "cycle-b",
    });

    const pureCycle = calculate({
      items: [item("A"), item("B")],
      recipes: [
        recipe("make-a", "A", 1, [["B", 1]], 1),
        recipe("make-b", "B", 1, [["A", 1]], 1),
      ],
    });
    expect(pureCycle.get("A")).toEqual({ itemId: "A", status: "unresolvable" });
    expect(pureCycle.get("B")).toEqual({ itemId: "B", status: "unresolvable" });
  });

  it("ignores routes with unknown references or missing work instead of selecting them", () => {
    const result = calculate({
      items: [item("Target"), item("Broken"), item("Raw")],
      recipes: [
        recipe("unknown-route", "Target", 1, [["Missing", 1]], 1),
        recipe("safe-route", "Target", 1, [["Raw", 1]], 6),
        recipe("unknown-only", "Broken", 1, [["Missing", 1]], 1),
        recipe("missing-work", "Broken", 1, [["Raw", 1]]),
      ],
    });

    expect(result.get("Target")).toMatchObject({ selectedRecipeId: "safe-route" });
    expect(result.get("Broken")).toEqual({ itemId: "Broken", status: "unresolvable" });
  });

  it("supports both recipe-id and predicate exclusions", () => {
    const catalog: ItemCraftCatalog = {
      items: [item("Mineral"), item("Sphere"), item("Ore")],
      recipes: [
        recipe("sphere-conversion", "Mineral", 5, [["Sphere", 1]], 1),
        recipe("mine-mineral", "Mineral", 1, [["Ore", 2]], 8),
        recipe("make-sphere", "Sphere", 1, [["Ore", 1]], 2),
      ],
    };

    const byId = calculate(catalog, { excludedRecipeIds: ["sphere-conversion"] });
    expect(byId.get("Mineral")).toMatchObject({
      totalWorkAmount: 8,
      selectedRecipeId: "mine-mineral",
    });

    const byPredicate = calculate(catalog, {
      excludeRecipe: (candidate) => candidate.id.includes("sphere"),
    });
    expect(byPredicate.get("Mineral")).toMatchObject({
      totalWorkAmount: 8,
      selectedRecipeId: "mine-mineral",
    });
    expect(byPredicate.get("Sphere")).toEqual({ itemId: "Sphere", status: "excluded" });
  });

  it("does not emit an infinite gold ratio for a zero-work recipe", () => {
    const result = calculate({
      items: [item("Free", 10), item("Worthless", 0)],
      recipes: [
        recipe("make-free", "Free", 1, [], 0),
        recipe("make-worthless", "Worthless", 1, [], 5),
      ],
    });

    expect(result.get("Free")).toEqual({
      itemId: "Free",
      status: "calculated",
      totalWorkAmount: 0,
      selectedRecipeId: "make-free",
    });
    expect(result.get("Worthless")?.goldPerWork).toBe(0);
  });
});
