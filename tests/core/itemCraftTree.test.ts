import { describe, expect, it } from "vitest";
import { buildItemCraftTree } from "../../src/components/itemCraftTree";
import { calculateItemCraftPlan } from "../../src/core/itemCalculator";
import type { ItemCatalogRecord } from "../../src/core/itemCalculator";
import type { ItemRecord } from "../../src/stores/itemData";

const itemIds = ["Target", "Computer", "Shared", "Raw"] as const;
const itemRecords = itemIds.map((id) => ({
  id,
  names: { zh: id, en: id },
})) as ItemRecord[];
const catalogItems: ItemCatalogRecord[] = itemRecords.map((item) => ({
  id: item.id,
  names: { zh: item.names.zh!, en: item.names.en! },
}));
const itemById = new Map(itemRecords.map((item) => [item.id, item]));

describe("item craft tree projection", () => {
  it("keeps per-branch quantities while expanding a shared craftable item only once", () => {
    const result = calculateItemCraftPlan({
      items: catalogItems,
      recipes: [
        {
          id: "make-target",
          output: { itemId: "Target", quantity: 1 },
          ingredients: [
            { itemId: "Shared", quantity: 25 },
            { itemId: "Computer", quantity: 15 },
          ],
          workAmount: 5,
        },
        {
          id: "make-computer",
          output: { itemId: "Computer", quantity: 1 },
          ingredients: [{ itemId: "Shared", quantity: 2 }],
          workAmount: 3,
        },
        {
          id: "make-shared",
          output: { itemId: "Shared", quantity: 10 },
          ingredients: [{ itemId: "Raw", quantity: 3 }],
          workAmount: 100,
        },
      ],
    }, { itemId: "Target", quantity: 1 });
    if (!result.ok) throw new Error(JSON.stringify(result.issues));

    const tree = buildItemCraftTree(result.plan, itemById)!;
    const computer = tree.children.find((node) => node.item.id === "Computer")!;
    const sharedProduction = computer.children.find((node) => node.item.id === "Shared")!;
    const sharedReference = tree.children.find((node) => node.item.id === "Shared")!;

    expect(sharedProduction).toMatchObject({
      required: 30,
      aggregateRequired: 55,
      produced: 60,
      surplus: 5,
      workAmount: 600,
      shared: true,
    });
    expect(sharedProduction.reference).toBeUndefined();
    expect(sharedProduction.children).toHaveLength(1);
    expect(sharedProduction.children[0]).toMatchObject({
      required: 18,
      base: true,
    });

    expect(sharedReference).toMatchObject({
      required: 25,
      aggregateRequired: 55,
      shared: true,
      reference: true,
      children: [],
    });
    expect(sharedReference.produced).toBeUndefined();
    expect(sharedReference.workAmount).toBeUndefined();
  });

  it("represents a directly requested raw item as one base-material node", () => {
    const result = calculateItemCraftPlan({ items: catalogItems, recipes: [] }, {
      itemId: "Raw",
      quantity: 7,
    });
    if (!result.ok) throw new Error(JSON.stringify(result.issues));

    expect(buildItemCraftTree(result.plan, itemById)).toMatchObject({
      item: { id: "Raw" },
      required: 7,
      base: true,
      children: [],
    });
  });
});
