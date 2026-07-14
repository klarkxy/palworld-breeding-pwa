import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";

export interface ItemLocalizedText {
  zh?: string;
  en?: string;
  ja?: string;
}

export interface ItemRecord {
  id: string;
  names: ItemLocalizedText;
  description?: ItemLocalizedText;
  typeA?: string;
  typeB?: string;
  rank?: number;
  rarity?: string | number;
  priceRaw?: number;
  baseSellPrice?: number;
  maxStack?: number;
  weight?: number;
  sortId?: number;
  iconId?: string;
  icon?: string;
  flags?: readonly string[] | Readonly<Record<string, unknown>>;
  shopOffers?: readonly unknown[];
}

export interface ItemAmount {
  itemId: string;
  count: number;
}

export interface ItemRecipeRecord {
  id: string;
  sourceTable: "main" | "common";
  product: ItemAmount;
  materials: readonly ItemAmount[];
  workAmountRaw: number;
  baseSeconds?: number;
  workableAttribute?: string;
  unlockItemId?: string;
  craftExpRate?: number;
  technologyUnlocks?: readonly unknown[];
}

interface ItemsFile {
  schemaVersion?: number;
  gameVersion?: string;
  gameBuildId?: string;
  items: ItemRecord[];
}

interface RecipesFile {
  schemaVersion?: number;
  gameVersion?: string;
  gameBuildId?: string;
  recipes: ItemRecipeRecord[];
  recipesByProduct?: Readonly<Record<string, readonly string[]>>;
  cycles?: readonly (readonly string[])[];
}

const dataUrl = (file: string) => `${import.meta.env.BASE_URL}data/${file}`;

async function fetchJson<T>(file: string): Promise<T> {
  const response = await fetch(dataUrl(file));
  if (response.status === 404)
    throw new Error("当前版本尚未安装道具数据快照，请先生成 items.json 与 recipes.json。");
  if (!response.ok) throw new Error(`${file} 加载失败（${response.status}）`);
  return response.json() as Promise<T>;
}

function unwrapItems(value: ItemsFile | ItemRecord[]) {
  return Array.isArray(value) ? value : value.items;
}

function unwrapRecipes(value: RecipesFile | ItemRecipeRecord[]) {
  return Array.isArray(value) ? value : value.recipes;
}

export const useItemDataStore = defineStore("itemData", () => {
  const items = shallowRef<ItemRecord[]>([]);
  const recipes = shallowRef<ItemRecipeRecord[]>([]);
  const isLoading = ref(false);
  const error = ref("");
  let loadPromise: Promise<void> | undefined;

  const itemById = computed(() => new Map(items.value.map((item) => [item.id, item])));
  const recipeById = computed(() => new Map(recipes.value.map((recipe) => [recipe.id, recipe])));
  const recipesByProduct = computed(() => {
    const index = new Map<string, ItemRecipeRecord[]>();
    for (const recipe of recipes.value) {
      const entries = index.get(recipe.product.itemId) ?? [];
      entries.push(recipe);
      index.set(recipe.product.itemId, entries);
    }
    return index;
  });
  const recipesByMaterial = computed(() => {
    const index = new Map<string, ItemRecipeRecord[]>();
    for (const recipe of recipes.value) {
      for (const material of recipe.materials) {
        const entries = index.get(material.itemId) ?? [];
        entries.push(recipe);
        index.set(material.itemId, entries);
      }
    }
    return index;
  });

  async function load() {
    if (items.value.length && recipes.value.length) return;
    if (loadPromise) return loadPromise;
    isLoading.value = true;
    error.value = "";
    loadPromise = (async () => {
      try {
        const [itemsFile, recipesFile] = await Promise.all([
          fetchJson<ItemsFile | ItemRecord[]>("items.json"),
          fetchJson<RecipesFile | ItemRecipeRecord[]>("recipes.json"),
        ]);
        items.value = unwrapItems(itemsFile);
        recipes.value = unwrapRecipes(recipesFile);
      } catch (reason) {
        error.value = reason instanceof Error ? reason.message : "道具数据加载失败";
        loadPromise = undefined;
      } finally {
        isLoading.value = false;
      }
    })();
    return loadPromise;
  }

  return {
    items, recipes, itemById, recipeById, recipesByProduct, recipesByMaterial,
    isLoading, error, load,
  };
});
