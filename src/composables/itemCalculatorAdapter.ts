import { calculateItemCraftPlan } from "@/core/itemCalculator";
import type { ItemCraftIssue, ItemCraftResult } from "@/core/itemCalculator";
import { calculateItemEconomics } from "@/core/itemEconomics";
import type { ItemEconomicsRecord } from "@/core/itemEconomics";
import { isCalculationRecipe } from "@/composables/itemRecipePolicy";
import type { ItemRecipeRecord, ItemRecord } from "@/stores/itemData";

export interface ItemCalculationRequest {
  itemId: string;
  quantity: number;
  recipeChoices?: Readonly<Record<string, string>>;
}

function toCalculatorCatalog(items: readonly ItemRecord[], recipes: readonly ItemRecipeRecord[]) {
  return {
    items: items.map((item) => ({
      id: item.id,
      names: {
        zh: item.names.zh || item.names.en || item.id,
        en: item.names.en || item.names.zh || item.id,
      },
      ...(item.baseSellPrice === undefined ? {} : { sellPrice: item.baseSellPrice }),
    })),
    recipes: recipes.filter(isCalculationRecipe).map((recipe) => ({
      id: recipe.id,
      output: { itemId: recipe.product.itemId, quantity: recipe.product.count },
      ingredients: recipe.materials.map((material) => ({
        itemId: material.itemId,
        quantity: material.count,
      })),
      ...(recipe.baseSeconds === undefined ? {} : { workAmount: recipe.baseSeconds }),
    })),
  };
}

/** Converts the extraction schema to the deliberately smaller calculator contract. */
export function calculateItemPlanForView(
  request: ItemCalculationRequest,
  items: readonly ItemRecord[],
  recipes: readonly ItemRecipeRecord[],
): ItemCraftResult {
  return calculateItemCraftPlan(toCalculatorCatalog(items, recipes), {
    itemId: request.itemId,
    quantity: request.quantity,
    choices: request.recipeChoices,
  });
}

/** Per-item recursive work and sale efficiency for catalog display/sorting. */
export function calculateItemEconomicsForView(
  items: readonly ItemRecord[],
  recipes: readonly ItemRecipeRecord[],
): readonly ItemEconomicsRecord[] {
  return calculateItemEconomics(toCalculatorCatalog(items, recipes));
}

export function itemCraftIssueText(issue: ItemCraftIssue) {
  switch (issue.kind) {
    case "choice-required": return `${issue.itemId} 有多个配方，需要先选择其中一个。`;
    case "invalid-choice": return `${issue.itemId} 选择了无效配方 ${issue.recipeId}。`;
    case "cycle": return `配方存在循环：${issue.path.join(" → ")}`;
    case "unknown-item": return `配方引用了未收录道具：${issue.itemId}`;
    case "invalid-quantity": return `${issue.itemId} 的数量 ${issue.quantity} 无效。`;
    case "invalid-work-amount": return `${issue.recipeId} 的工作量无效。`;
    case "invalid-sell-price": return `${issue.itemId} 的售价无效。`;
    case "duplicate-item": return `道具 ID 重复：${issue.itemId}`;
    case "duplicate-recipe": return `配方 ID 重复：${issue.recipeId}`;
    case "overflow": return `${issue.itemId} 的计算结果超出安全整数范围。`;
  }
}
