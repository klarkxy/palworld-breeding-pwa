import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isCalculationRecipe,
  isPalSphereRecyclingRecipe,
} from "../../src/composables/itemRecipePolicy";
import { calculateItemEconomicsForView } from "../../src/composables/itemCalculatorAdapter";
import type { ItemRecipeRecord, ItemRecord } from "../../src/stores/itemData";

interface RecipeSnapshot {
  recipes: ItemRecipeRecord[];
}

interface ItemSnapshot {
  items: ItemRecord[];
}

const snapshot = JSON.parse(readFileSync(
  join(process.cwd(), "public", "data", "recipes.json"),
  "utf8",
)) as RecipeSnapshot;
const itemSnapshot = JSON.parse(readFileSync(
  join(process.cwd(), "public", "data", "items.json"),
  "utf8",
)) as ItemSnapshot;

describe("item calculation recipe policy", () => {
  it("excludes exactly the ten Pal Sphere recycling exchanges in the current snapshot", () => {
    const excluded = snapshot.recipes
      .filter(isPalSphereRecyclingRecipe)
      .map((recipe) => recipe.id)
      .sort();

    expect(excluded).toEqual([
      "CryStal_PalSphere",
      "CryStal_PalSphere_Ancient_1",
      "CryStal_PalSphere_Ancient_2",
      "CryStal_PalSphere_Exotic",
      "CryStal_PalSphere_Giga",
      "CryStal_PalSphere_Legend",
      "CryStal_PalSphere_Master",
      "CryStal_PalSphere_Mega",
      "CryStal_PalSphere_Tera",
      "CryStal_PalSphere_Ultimate",
    ]);
    expect(snapshot.recipes.filter(isCalculationRecipe)).toHaveLength(1_404);
  });

  it("keeps ordinary mineral recipes and Pal Sphere production recipes", () => {
    for (const recipeId of ["Pal_crystal_S", "Pal_crystal_S_2", "Pal_crystal_S_3", "PalSphere"]) {
      const recipe = snapshot.recipes.find((candidate) => candidate.id === recipeId);
      expect(recipe, recipeId).toBeDefined();
      expect(isCalculationRecipe(recipe!)).toBe(true);
    }
  });

  it("produces stable recursive economics for representative real items", () => {
    const economics = new Map(calculateItemEconomicsForView(
      itemSnapshot.items,
      snapshot.recipes,
    ).map((record) => [record.itemId, record]));

    expect(economics.get("Cake")).toMatchObject({
      totalWorkAmount: 2_050,
      goldPerWork: 630 / 2_050,
      selectedRecipeId: "Cake",
    });
    expect(economics.get("CarbonFiber")).toMatchObject({
      totalWorkAmount: 100,
      goldPerWork: 0.84,
      selectedRecipeId: "CarbonFiber",
    });
    expect(economics.get("Pal_crystal_S")?.selectedRecipeId).toBe("Pal_crystal_S_2");
    expect(economics.get("Pal_crystal_S")?.selectedRecipeId).not.toMatch(/^CryStal_PalSphere/);
  });
});
