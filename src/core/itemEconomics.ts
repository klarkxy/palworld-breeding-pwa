import type {
  ItemCraftCatalog,
  ItemId,
  ItemRecipeId,
  ItemRecipeRecord,
} from "./itemCalculator";

export type ItemEconomicsStatus =
  | "calculated"
  | "base-material"
  | "excluded"
  | "unresolvable";

export interface ItemEconomicsRecord {
  itemId: ItemId;
  status: ItemEconomicsStatus;
  /** Recursive normalized work required for one unit of this item. */
  totalWorkAmount?: number;
  /** Per-item sale value divided by totalWorkAmount. */
  goldPerWork?: number;
  selectedRecipeId?: ItemRecipeId;
}

export interface ItemEconomicsOptions {
  /** Recipes in this collection are ignored completely. */
  excludedRecipeIds?: readonly ItemRecipeId[] | ReadonlySet<ItemRecipeId>;
  /** Return true to ignore a recipe completely. */
  excludeRecipe?: (recipe: Readonly<ItemRecipeRecord>) => boolean;
}

interface ResolvedCost {
  kind: "calculated" | "leaf" | "unresolvable";
  totalWorkAmount?: number;
  selectedRecipeId?: ItemRecipeId;
  excludedOnly?: boolean;
}

const compareText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const isPositiveFinite = (value: number) => Number.isFinite(value) && value > 0;
const isNonNegativeFinite = (value: number) => Number.isFinite(value) && value >= 0;

/**
 * Calculates per-unit recursive crafting work for every known item.
 *
 * `ItemRecipeRecord.workAmount` is expected to contain the normalized batch work
 * (the extracted item snapshot maps `baseSeconds` to this field). For a recipe:
 *
 *     unit work = (batch work + sum(material quantity * material unit work))
 *                 / output quantity
 *
 * Items without an eligible recipe are leaves. Their own total is deliberately
 * unavailable, while their contribution as a material is zero because there is
 * no known crafting work for acquiring them.
 */
export function calculateItemEconomics(
  catalog: ItemCraftCatalog,
  options: ItemEconomicsOptions = {},
): readonly ItemEconomicsRecord[] {
  const itemsById = new Map(catalog.items.map((item) => [item.id, item]));
  const recipesByOutput = new Map<ItemId, ItemRecipeRecord[]>();

  for (const recipe of catalog.recipes) {
    if (!itemsById.has(recipe.output.itemId)) continue;
    const candidates = recipesByOutput.get(recipe.output.itemId) ?? [];
    candidates.push(recipe);
    recipesByOutput.set(recipe.output.itemId, candidates);
  }
  for (const recipes of recipesByOutput.values()) {
    recipes.sort((left, right) => compareText(left.id, right.id));
  }

  const excludedIds = new Set(options.excludedRecipeIds ?? []);
  const isExcluded = (recipe: ItemRecipeRecord) =>
    excludedIds.has(recipe.id) || options.excludeRecipe?.(recipe) === true;

  /**
   * Resolve afresh for each root. A globally memoized answer is not safe here:
   * within a cyclic component the cheapest valid alternative can depend on which
   * ancestor items are currently forbidden.
   */
  const resolve = (itemId: ItemId, ancestors: ReadonlySet<ItemId>): ResolvedCost => {
    if (ancestors.has(itemId) || !itemsById.has(itemId)) return { kind: "unresolvable" };

    const allCandidates = recipesByOutput.get(itemId) ?? [];
    if (allCandidates.length === 0) return { kind: "leaf" };

    const candidates = allCandidates.filter((recipe) => !isExcluded(recipe));
    if (candidates.length === 0) return { kind: "leaf", excludedOnly: true };

    const nextAncestors = new Set(ancestors);
    nextAncestors.add(itemId);
    let best: { recipeId: ItemRecipeId; totalWorkAmount: number } | undefined;

    for (const recipe of candidates) {
      if (!isPositiveFinite(recipe.output.quantity)) continue;
      if (recipe.workAmount === undefined || !isNonNegativeFinite(recipe.workAmount)) continue;

      let batchWork = recipe.workAmount;
      let valid = true;
      for (const ingredient of recipe.ingredients) {
        if (!isPositiveFinite(ingredient.quantity) || !itemsById.has(ingredient.itemId)) {
          valid = false;
          break;
        }

        const material = resolve(ingredient.itemId, nextAncestors);
        if (material.kind === "unresolvable") {
          valid = false;
          break;
        }
        if (material.kind === "calculated") {
          batchWork += ingredient.quantity * material.totalWorkAmount!;
          if (!Number.isFinite(batchWork)) {
            valid = false;
            break;
          }
        }
      }
      if (!valid) continue;

      const totalWorkAmount = batchWork / recipe.output.quantity;
      if (!isNonNegativeFinite(totalWorkAmount)) continue;
      if (
        best === undefined
        || totalWorkAmount < best.totalWorkAmount
        || (totalWorkAmount === best.totalWorkAmount && compareText(recipe.id, best.recipeId) < 0)
      ) {
        best = { recipeId: recipe.id, totalWorkAmount };
      }
    }

    return best === undefined
      ? { kind: "unresolvable" }
      : {
        kind: "calculated",
        totalWorkAmount: best.totalWorkAmount,
        selectedRecipeId: best.recipeId,
      };
  };

  return [...itemsById.values()]
    .sort((left, right) => compareText(left.id, right.id))
    .map((item): ItemEconomicsRecord => {
      const resolved = resolve(item.id, new Set());
      if (resolved.kind === "leaf") {
        return {
          itemId: item.id,
          status: resolved.excludedOnly ? "excluded" : "base-material",
        };
      }
      if (resolved.kind === "unresolvable") {
        return { itemId: item.id, status: "unresolvable" };
      }

      const totalWorkAmount = resolved.totalWorkAmount!;
      const sellPrice = item.sellPrice;
      const goldPerWork = totalWorkAmount > 0
        && sellPrice !== undefined
        && isNonNegativeFinite(sellPrice)
        ? sellPrice / totalWorkAmount
        : undefined;
      return {
        itemId: item.id,
        status: "calculated",
        totalWorkAmount,
        selectedRecipeId: resolved.selectedRecipeId,
        ...(goldPerWork === undefined ? {} : { goldPerWork }),
      };
    });
}
