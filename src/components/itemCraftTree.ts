import type { ItemRecord } from "@/stores/itemData";
import type { ItemCraftPlan } from "@/core/itemCalculator";

/** A presentation-ready node in an expanded item crafting tree. */
export interface ItemCraftTreeNode {
  item: ItemRecord;
  /** Quantity requested by this node's immediate parent branch. */
  required: number;
  /** Global merged demand when the same craftable item is used by multiple branches. */
  aggregateRequired?: number;
  /** Global output after merged batch rounding. Omitted for base materials and references. */
  produced?: number;
  surplus?: number;
  workAmount?: number;
  children: readonly ItemCraftTreeNode[];
  base?: boolean;
  shared?: boolean;
  /** A later branch pointing to the first, globally merged shared production node. */
  reference?: boolean;
}

/**
 * Projects the calculator's merged DAG plan into a readable tree. Shared craftable
 * items expand once; later occurrences retain their branch quantity as references.
 */
export function buildItemCraftTree(
  plan: ItemCraftPlan,
  itemById: ReadonlyMap<string, ItemRecord>,
): ItemCraftTreeNode | undefined {
  const rootItem = itemById.get(plan.itemId);
  if (!rootItem) return undefined;

  const stepsByItem = new Map(plan.steps.map((step) => [step.itemId, step]));
  const incomingBranches = new Map<string, number>();
  for (const step of plan.steps) {
    for (const ingredient of step.ingredients) {
      incomingBranches.set(ingredient.itemId, (incomingBranches.get(ingredient.itemId) ?? 0) + 1);
    }
  }
  const expanded = new Set<string>();

  const buildNode = (itemId: string, branchRequired: number): ItemCraftTreeNode | undefined => {
    const item = itemById.get(itemId);
    if (!item) return undefined;
    const step = stepsByItem.get(itemId);
    if (!step) {
      return {
        item,
        required: branchRequired,
        children: [],
        base: true,
      };
    }

    const shared = (incomingBranches.get(itemId) ?? 0) > 1;
    const reference = expanded.has(itemId);
    if (reference) {
      return {
        item,
        required: branchRequired,
        aggregateRequired: step.requiredQuantity,
        children: [],
        shared: true,
        reference: true,
      };
    }

    expanded.add(itemId);
    const children = step.ingredients
      .map((ingredient) => buildNode(ingredient.itemId, ingredient.quantity))
      .filter((child): child is ItemCraftTreeNode => Boolean(child));
    return {
      item,
      required: branchRequired,
      produced: step.producedQuantity,
      surplus: step.surplusQuantity,
      children,
      ...(step.totalWorkAmount === undefined ? {} : { workAmount: step.totalWorkAmount }),
      ...(shared ? {
        shared: true,
        aggregateRequired: step.requiredQuantity,
      } : {}),
    };
  };

  return buildNode(plan.itemId, plan.requestedQuantity);
}
