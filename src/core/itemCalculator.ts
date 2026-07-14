export type ItemId = string;
export type ItemRecipeId = string;

export interface ItemCatalogRecord {
  id: ItemId;
  names: Readonly<{ zh: string; en: string }>;
  /** Per-item sale value. Absence means that the source does not provide a price. */
  sellPrice?: number;
}

export interface ItemAmount {
  itemId: ItemId;
  quantity: number;
}

export interface ItemRecipeRecord {
  id: ItemRecipeId;
  output: Readonly<ItemAmount>;
  ingredients: readonly Readonly<ItemAmount>[];
  /** Normalized work amount for one recipe batch. Absence is preserved as unknown. */
  workAmount?: number;
}

export interface ItemCraftCatalog {
  items: readonly ItemCatalogRecord[];
  recipes: readonly ItemRecipeRecord[];
}

export interface ItemCraftRequest {
  itemId: ItemId;
  quantity: number;
  /** One recipe per item for this plan. A choice is required only when an item has multiple recipes. */
  choices?: Readonly<Record<ItemId, ItemRecipeId | undefined>>;
}

export type ItemCraftIssue =
  | Readonly<{ kind: "duplicate-item"; itemId: ItemId }>
  | Readonly<{ kind: "duplicate-recipe"; recipeId: ItemRecipeId }>
  | Readonly<{ kind: "unknown-item"; itemId: ItemId; recipeId?: ItemRecipeId }>
  | Readonly<{
    kind: "invalid-quantity";
    scope: "request" | "output" | "ingredient";
    itemId: ItemId;
    quantity: number;
    recipeId?: ItemRecipeId;
  }>
  | Readonly<{ kind: "invalid-work-amount"; recipeId: ItemRecipeId; workAmount: number }>
  | Readonly<{ kind: "invalid-sell-price"; itemId: ItemId; sellPrice: number }>
  | Readonly<{ kind: "choice-required"; itemId: ItemId; recipeIds: readonly ItemRecipeId[] }>
  | Readonly<{
    kind: "invalid-choice";
    itemId: ItemId;
    recipeId: ItemRecipeId;
    recipeIds: readonly ItemRecipeId[];
  }>
  | Readonly<{ kind: "cycle"; path: readonly ItemId[] }>
  | Readonly<{ kind: "overflow"; itemId: ItemId }>;

export interface ItemCraftStep {
  itemId: ItemId;
  recipeId: ItemRecipeId;
  requiredQuantity: number;
  batchCount: number;
  outputPerBatch: number;
  producedQuantity: number;
  surplusQuantity: number;
  ingredients: readonly Readonly<ItemAmount>[];
  workAmountPerBatch?: number;
  totalWorkAmount?: number;
}

export interface ItemCraftPlan {
  itemId: ItemId;
  requestedQuantity: number;
  producedQuantity: number;
  steps: readonly ItemCraftStep[];
  baseMaterials: readonly Readonly<ItemAmount>[];
  surpluses: readonly Readonly<ItemAmount>[];
  /** Sum of known work amounts. Check workAmountComplete before treating it as a complete total. */
  totalWorkAmount: number;
  workAmountComplete: boolean;
  /** Requested quantity multiplied by the per-item sale price. */
  saleValue?: number;
  /** Actual root-batch output multiplied by the per-item sale price. */
  producedSaleValue?: number;
}

export type ItemCraftResult =
  | Readonly<{ ok: true; plan: ItemCraftPlan; issues: readonly ItemCraftIssue[] }>
  | Readonly<{ ok: false; issues: readonly ItemCraftIssue[] }>;

const compareText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const isPositiveSafeInteger = (value: number) => Number.isSafeInteger(value) && value > 0;

function failure(issues: readonly ItemCraftIssue[]): ItemCraftResult {
  return { ok: false, issues };
}

/**
 * Expands one item request into a deterministic batch plan.
 *
 * The selected recipe graph is resolved and checked first. Demand is then propagated in
 * topological order, so all uses of a shared intermediate item are merged before its batch
 * count is rounded upward.
 */
export function calculateItemCraftPlan(
  catalog: ItemCraftCatalog,
  request: ItemCraftRequest,
): ItemCraftResult {
  const issues: ItemCraftIssue[] = [];
  const itemsById = new Map<ItemId, ItemCatalogRecord>();
  for (const item of catalog.items) {
    if (itemsById.has(item.id)) issues.push({ kind: "duplicate-item", itemId: item.id });
    else itemsById.set(item.id, item);
  }

  const recipesById = new Map<ItemRecipeId, ItemRecipeRecord>();
  const recipesByOutput = new Map<ItemId, ItemRecipeRecord[]>();
  for (const recipe of catalog.recipes) {
    if (recipesById.has(recipe.id)) {
      issues.push({ kind: "duplicate-recipe", recipeId: recipe.id });
      continue;
    }
    recipesById.set(recipe.id, recipe);
    const candidates = recipesByOutput.get(recipe.output.itemId) ?? [];
    candidates.push(recipe);
    recipesByOutput.set(recipe.output.itemId, candidates);
  }
  for (const candidates of recipesByOutput.values()) {
    candidates.sort((left, right) => compareText(left.id, right.id));
  }

  if (!isPositiveSafeInteger(request.quantity)) {
    issues.push({
      kind: "invalid-quantity",
      scope: "request",
      itemId: request.itemId,
      quantity: request.quantity,
    });
  }
  if (!itemsById.has(request.itemId)) {
    issues.push({ kind: "unknown-item", itemId: request.itemId });
  }
  if (issues.length) return failure(issues);

  const selectedRecipes = new Map<ItemId, ItemRecipeRecord | undefined>();
  const dependencies = new Map<ItemId, ItemAmount[]>();
  const visitState = new Map<ItemId, "visiting" | "done">();
  const visitStack: ItemId[] = [];

  const resolveItem = (itemId: ItemId): void => {
    const state = visitState.get(itemId);
    if (state === "done") return;
    if (state === "visiting") {
      const cycleStart = visitStack.indexOf(itemId);
      issues.push({
        kind: "cycle",
        path: [...visitStack.slice(Math.max(cycleStart, 0)), itemId],
      });
      return;
    }

    visitState.set(itemId, "visiting");
    visitStack.push(itemId);
    const candidates = recipesByOutput.get(itemId) ?? [];
    const chosenId = request.choices?.[itemId];
    let recipe: ItemRecipeRecord | undefined;
    if (chosenId !== undefined) {
      const chosen = recipesById.get(chosenId);
      if (!chosen || chosen.output.itemId !== itemId) {
        issues.push({
          kind: "invalid-choice",
          itemId,
          recipeId: chosenId,
          recipeIds: candidates.map((candidate) => candidate.id),
        });
      } else {
        recipe = chosen;
      }
    } else if (candidates.length === 1) {
      recipe = candidates[0];
    } else if (candidates.length > 1) {
      issues.push({
        kind: "choice-required",
        itemId,
        recipeIds: candidates.map((candidate) => candidate.id),
      });
    }

    selectedRecipes.set(itemId, recipe);
    const mergedIngredients = new Map<ItemId, number>();
    if (recipe) {
      if (!isPositiveSafeInteger(recipe.output.quantity)) {
        issues.push({
          kind: "invalid-quantity",
          scope: "output",
          itemId,
          quantity: recipe.output.quantity,
          recipeId: recipe.id,
        });
      }
      if (recipe.workAmount !== undefined && (!Number.isFinite(recipe.workAmount) || recipe.workAmount < 0)) {
        issues.push({ kind: "invalid-work-amount", recipeId: recipe.id, workAmount: recipe.workAmount });
      }
      for (const ingredient of recipe.ingredients) {
        if (!isPositiveSafeInteger(ingredient.quantity)) {
          issues.push({
            kind: "invalid-quantity",
            scope: "ingredient",
            itemId: ingredient.itemId,
            quantity: ingredient.quantity,
            recipeId: recipe.id,
          });
          continue;
        }
        if (!itemsById.has(ingredient.itemId)) {
          issues.push({ kind: "unknown-item", itemId: ingredient.itemId, recipeId: recipe.id });
          continue;
        }
        const merged = (mergedIngredients.get(ingredient.itemId) ?? 0) + ingredient.quantity;
        if (!Number.isSafeInteger(merged)) {
          issues.push({ kind: "overflow", itemId: ingredient.itemId });
          continue;
        }
        mergedIngredients.set(ingredient.itemId, merged);
      }
    }

    const itemDependencies = [...mergedIngredients]
      .sort(([left], [right]) => compareText(left, right))
      .map(([dependencyId, quantity]) => ({ itemId: dependencyId, quantity }));
    dependencies.set(itemId, itemDependencies);
    for (const dependency of itemDependencies) resolveItem(dependency.itemId);

    visitStack.pop();
    visitState.set(itemId, "done");
  };

  resolveItem(request.itemId);
  if (issues.length) return failure(issues);

  const indegree = new Map<ItemId, number>(
    [...selectedRecipes.keys()].map((itemId) => [itemId, 0]),
  );
  for (const itemDependencies of dependencies.values()) {
    for (const dependency of itemDependencies) {
      indegree.set(dependency.itemId, (indegree.get(dependency.itemId) ?? 0) + 1);
    }
  }

  const ready = [...indegree]
    .filter(([, degree]) => degree === 0)
    .map(([itemId]) => itemId)
    .sort(compareText);
  const demand = new Map<ItemId, number>([[request.itemId, request.quantity]]);
  const steps: ItemCraftStep[] = [];
  const baseMaterials: ItemAmount[] = [];
  let totalWorkAmount = 0;
  let workAmountComplete = true;
  let rootProducedQuantity = request.quantity;

  const checkedMultiply = (left: number, right: number, itemId: ItemId): number | undefined => {
    const value = left * right;
    if (!Number.isSafeInteger(value)) {
      issues.push({ kind: "overflow", itemId });
      return undefined;
    }
    return value;
  };

  while (ready.length && !issues.length) {
    const itemId = ready.shift()!;
    const requiredQuantity = demand.get(itemId) ?? 0;
    const recipe = selectedRecipes.get(itemId);
    const itemDependencies = dependencies.get(itemId) ?? [];
    if (!recipe) {
      baseMaterials.push({ itemId, quantity: requiredQuantity });
    } else {
      const batchCount = Math.ceil(requiredQuantity / recipe.output.quantity);
      const producedQuantity = checkedMultiply(batchCount, recipe.output.quantity, itemId);
      if (producedQuantity === undefined) break;
      if (itemId === request.itemId) rootProducedQuantity = producedQuantity;

      const expandedIngredients: ItemAmount[] = [];
      for (const ingredient of itemDependencies) {
        const quantity = checkedMultiply(ingredient.quantity, batchCount, ingredient.itemId);
        if (quantity === undefined) break;
        const nextDemand = (demand.get(ingredient.itemId) ?? 0) + quantity;
        if (!Number.isSafeInteger(nextDemand)) {
          issues.push({ kind: "overflow", itemId: ingredient.itemId });
          break;
        }
        demand.set(ingredient.itemId, nextDemand);
        expandedIngredients.push({ itemId: ingredient.itemId, quantity });
      }
      if (issues.length) break;

      let stepWorkAmount: number | undefined;
      if (recipe.workAmount === undefined) {
        workAmountComplete = false;
      } else {
        stepWorkAmount = recipe.workAmount * batchCount;
        if (!Number.isFinite(stepWorkAmount) || !Number.isFinite(totalWorkAmount + stepWorkAmount)) {
          issues.push({ kind: "overflow", itemId });
          break;
        }
        totalWorkAmount += stepWorkAmount;
      }
      steps.push({
        itemId,
        recipeId: recipe.id,
        requiredQuantity,
        batchCount,
        outputPerBatch: recipe.output.quantity,
        producedQuantity,
        surplusQuantity: producedQuantity - requiredQuantity,
        ingredients: expandedIngredients,
        ...(recipe.workAmount === undefined ? {} : {
          workAmountPerBatch: recipe.workAmount,
          totalWorkAmount: stepWorkAmount,
        }),
      });
    }

    for (const dependency of itemDependencies) {
      const nextDegree = (indegree.get(dependency.itemId) ?? 0) - 1;
      indegree.set(dependency.itemId, nextDegree);
      if (nextDegree === 0) {
        ready.push(dependency.itemId);
        ready.sort(compareText);
      }
    }
  }

  if (issues.length) return failure(issues);

  const target = itemsById.get(request.itemId)!;
  let saleValue: number | undefined;
  let producedSaleValue: number | undefined;
  if (target.sellPrice !== undefined) {
    if (!Number.isFinite(target.sellPrice) || target.sellPrice < 0) {
      return failure([{ kind: "invalid-sell-price", itemId: target.id, sellPrice: target.sellPrice }]);
    }
    saleValue = target.sellPrice * request.quantity;
    producedSaleValue = target.sellPrice * rootProducedQuantity;
    if (!Number.isFinite(saleValue) || !Number.isFinite(producedSaleValue)) {
      return failure([{ kind: "overflow", itemId: target.id }]);
    }
  }

  baseMaterials.sort((left, right) => compareText(left.itemId, right.itemId));
  const surpluses = steps
    .filter((step) => step.surplusQuantity > 0)
    .map((step) => ({ itemId: step.itemId, quantity: step.surplusQuantity }));
  return {
    ok: true,
    issues: [],
    plan: {
      itemId: request.itemId,
      requestedQuantity: request.quantity,
      producedQuantity: rootProducedQuantity,
      steps,
      baseMaterials,
      surpluses,
      totalWorkAmount,
      workAmountComplete,
      ...(saleValue === undefined ? {} : { saleValue, producedSaleValue }),
    },
  };
}
