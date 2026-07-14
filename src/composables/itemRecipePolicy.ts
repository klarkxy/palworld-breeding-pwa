import type { ItemRecipeRecord } from "@/stores/itemData";

const PAL_SPHERE_ID = /^PalSphere(?:_|$)/;

/**
 * Sphere recycling is a special exchange route rather than an ordinary
 * production recipe. Keeping it in recursive calculations creates a false
 * sphere/mineral loop and makes the work-efficiency figures misleading.
 */
export function isPalSphereRecyclingRecipe(recipe: ItemRecipeRecord) {
  return recipe.product.itemId === "Pal_crystal_S"
    && recipe.materials.length === 1
    && PAL_SPHERE_ID.test(recipe.materials[0]?.itemId ?? "");
}

export function isCalculationRecipe(recipe: ItemRecipeRecord) {
  return !isPalSphereRecyclingRecipe(recipe);
}
