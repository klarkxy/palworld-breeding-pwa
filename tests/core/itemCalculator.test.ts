import { describe, expect, it } from "vitest";
import {
  calculateItemCraftPlan,
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
  itemId: string,
  quantity: number,
  choices?: Readonly<Record<string, string>>,
) => calculateItemCraftPlan(catalog, { itemId, quantity, choices });

describe("item crafting batch plans", () => {
  it("rounds every recipe batch upward and totals work, sale value, and surplus", () => {
    const result = calculate({
      items: [item("T", 50), item("A"), item("Ore")],
      recipes: [
        recipe("make-t", "T", 2, [["A", 3]], 10),
        recipe("make-a", "A", 4, [["Ore", 2]], 7),
      ],
    }, "T", 5);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan).toMatchObject({
      itemId: "T",
      requestedQuantity: 5,
      producedQuantity: 6,
      totalWorkAmount: 51,
      workAmountComplete: true,
      saleValue: 250,
      producedSaleValue: 300,
      baseMaterials: [{ itemId: "Ore", quantity: 6 }],
      surpluses: [{ itemId: "T", quantity: 1 }, { itemId: "A", quantity: 3 }],
    });
    expect(result.plan.steps).toEqual([
      {
        itemId: "T", recipeId: "make-t", requiredQuantity: 5, batchCount: 3,
        outputPerBatch: 2, producedQuantity: 6, surplusQuantity: 1,
        ingredients: [{ itemId: "A", quantity: 9 }],
        workAmountPerBatch: 10, totalWorkAmount: 30,
      },
      {
        itemId: "A", recipeId: "make-a", requiredQuantity: 9, batchCount: 3,
        outputPerBatch: 4, producedQuantity: 12, surplusQuantity: 3,
        ingredients: [{ itemId: "Ore", quantity: 6 }],
        workAmountPerBatch: 7, totalWorkAmount: 21,
      },
    ]);
  });

  it("merges shared intermediates before their output batch is rounded", () => {
    const result = calculate({
      items: ["T", "A", "B", "C", "Raw"].map((id) => item(id)),
      recipes: [
        recipe("make-t", "T", 1, [["A", 1], ["B", 1]], 1),
        recipe("make-a", "A", 1, [["C", 1]], 1),
        recipe("make-b", "B", 1, [["C", 1]], 1),
        recipe("make-c", "C", 3, [["Raw", 1]], 1),
      ],
    }, "T", 1);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.steps.find((step) => step.itemId === "C")).toMatchObject({
      requiredQuantity: 2,
      batchCount: 1,
      producedQuantity: 3,
      surplusQuantity: 1,
      ingredients: [{ itemId: "Raw", quantity: 1 }],
    });
    expect(result.plan.baseMaterials).toEqual([{ itemId: "Raw", quantity: 1 }]);
    expect(result.plan.steps.filter((step) => step.itemId === "C")).toHaveLength(1);
  });

  it("also merges duplicate ingredient rows within one recipe", () => {
    const result = calculate({
      items: [item("T"), item("Raw")],
      recipes: [recipe("make-t", "T", 1, [["Raw", 1], ["Raw", 2]])],
    }, "T", 2);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.steps[0]?.ingredients).toEqual([{ itemId: "Raw", quantity: 6 }]);
    expect(result.plan.baseMaterials).toEqual([{ itemId: "Raw", quantity: 6 }]);
  });

  it("requires an explicit stable choice for multiple recipes", () => {
    const catalog: ItemCraftCatalog = {
      items: [item("T"), item("A"), item("Ore"), item("Fiber")],
      recipes: [
        recipe("make-t", "T", 1, [["A", 2]]),
        recipe("z-fiber", "A", 2, [["Fiber", 3]], 8),
        recipe("a-ore", "A", 1, [["Ore", 2]], 5),
      ],
    };

    const unresolved = calculate(catalog, "T", 3);
    expect(unresolved).toEqual({
      ok: false,
      issues: [{ kind: "choice-required", itemId: "A", recipeIds: ["a-ore", "z-fiber"] }],
    });

    const selected = calculate(catalog, "T", 3, { A: "z-fiber" });
    expect(selected.ok).toBe(true);
    if (selected.ok) {
      expect(selected.plan.steps.find((step) => step.itemId === "A")).toMatchObject({
        recipeId: "z-fiber",
        requiredQuantity: 6,
        batchCount: 3,
        ingredients: [{ itemId: "Fiber", quantity: 9 }],
      });
    }

    expect(calculate(catalog, "T", 1, { A: "make-t" })).toEqual({
      ok: false,
      issues: [{
        kind: "invalid-choice", itemId: "A", recipeId: "make-t",
        recipeIds: ["a-ore", "z-fiber"],
      }],
    });
  });

  it("treats an item without a recipe as a base material and preserves a missing sale price", () => {
    const result = calculate({ items: [item("Raw")], recipes: [] }, "Raw", 5);

    expect(result).toEqual({
      ok: true,
      issues: [],
      plan: {
        itemId: "Raw",
        requestedQuantity: 5,
        producedQuantity: 5,
        steps: [],
        baseMaterials: [{ itemId: "Raw", quantity: 5 }],
        surpluses: [],
        totalWorkAmount: 0,
        workAmountComplete: true,
      },
    });

    const zeroPrice = calculate({ items: [item("Free", 0)], recipes: [] }, "Free", 5);
    expect(zeroPrice.ok && zeroPrice.plan.saleValue).toBe(0);
  });

  it("reports incomplete work totals without treating missing work as zero-known data", () => {
    const result = calculate({
      items: [item("T"), item("A"), item("Raw")],
      recipes: [
        recipe("make-t", "T", 1, [["A", 1]]),
        recipe("make-a", "A", 1, [["Raw", 1]], 3),
      ],
    }, "T", 2);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.totalWorkAmount).toBe(6);
    expect(result.plan.workAmountComplete).toBe(false);
    expect(result.plan.steps.find((step) => step.itemId === "T")).not.toHaveProperty("totalWorkAmount");
  });
});

describe("item crafting failures", () => {
  it("reports a selected dependency cycle with its exact path", () => {
    const result = calculate({
      items: [item("A"), item("B")],
      recipes: [
        recipe("make-a", "A", 1, [["B", 1]]),
        recipe("make-b", "B", 1, [["A", 1]]),
      ],
    }, "A", 1);

    expect(result).toEqual({
      ok: false,
      issues: [{ kind: "cycle", path: ["A", "B", "A"] }],
    });
  });

  it("lets an explicit acyclic recipe choice avoid another recipe's cycle", () => {
    const catalog: ItemCraftCatalog = {
      items: [item("A"), item("B"), item("Raw")],
      recipes: [
        recipe("cycle-a", "A", 1, [["B", 1]]),
        recipe("safe-a", "A", 1, [["Raw", 1]]),
        recipe("make-b", "B", 1, [["A", 1]]),
      ],
    };

    const safe = calculate(catalog, "A", 1, { A: "safe-a" });
    expect(safe.ok).toBe(true);
    if (safe.ok) expect(safe.plan.baseMaterials).toEqual([{ itemId: "Raw", quantity: 1 }]);
    expect(calculate(catalog, "A", 1, { A: "cycle-a" })).toMatchObject({
      ok: false,
      issues: [{ kind: "cycle", path: ["A", "B", "A"] }],
    });
  });

  it.each([0, -1, 1.5, Number.NaN])("rejects an invalid requested quantity %s", (quantity) => {
    const result = calculate({ items: [item("A")], recipes: [] }, "A", quantity);
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatchObject({
      kind: "invalid-quantity", scope: "request", itemId: "A", quantity,
    });
  });

  it("reports unknown targets and chosen recipe references", () => {
    expect(calculate({ items: [item("A")], recipes: [] }, "Missing", 1)).toEqual({
      ok: false,
      issues: [{ kind: "unknown-item", itemId: "Missing" }],
    });

    const result = calculate({
      items: [item("A")],
      recipes: [recipe("make-a", "A", 1, [["Missing", 1]])],
    }, "A", 1);
    expect(result).toEqual({
      ok: false,
      issues: [{ kind: "unknown-item", itemId: "Missing", recipeId: "make-a" }],
    });
  });

  it("reports invalid output and ingredient quantities on the selected path", () => {
    const result = calculate({
      items: [item("A"), item("Raw")],
      recipes: [{
        id: "make-a",
        output: { itemId: "A", quantity: 0 },
        ingredients: [{ itemId: "Raw", quantity: 1.5 }],
      }],
    }, "A", 1);

    expect(result).toEqual({
      ok: false,
      issues: [
        { kind: "invalid-quantity", scope: "output", itemId: "A", quantity: 0, recipeId: "make-a" },
        { kind: "invalid-quantity", scope: "ingredient", itemId: "Raw", quantity: 1.5, recipeId: "make-a" },
      ],
    });
  });
});
