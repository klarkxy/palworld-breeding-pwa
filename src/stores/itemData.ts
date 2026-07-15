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
  iconTextureId?: string;
  iconAssetPath?: string;
  baseItemId?: string;
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

export type PalDropSourceType = "normal" | "alpha" | "predator";

export interface PalItemDropRecord {
  rowId: string;
  characterId: string;
  palId?: string;
  sourceType: PalDropSourceType;
  level: number;
  itemId: string;
  slot: number;
  baseChancePercent: number;
  minQuantity: number;
  maxQuantity: number;
  captureEligible: boolean;
}

export interface ChestItemDropRecord {
  rowId?: string;
  poolId?: string;
  sourceId?: string;
  labelZh?: string;
  sourceLabel?: string;
  sourceKind?: string;
  region?: string;
  fieldName?: string;
  /** Pool summaries combine every contributing slot, so they use no slot or slot 0. */
  slot?: number;
  itemId: string;
  /** Exact chance after combining slots, conditional on the chest grade already being known. */
  conditionalOnGradeChancePercent?: number;
  /** Compatible name for the combined chance before its probability basis is inspected. */
  chanceAtLeastOnePercent?: number;
  /** Exact, fully resolved chance for one chest opening. */
  perOpenChancePercent?: number;
  /** Backward-compatible alias for a fully resolved per-opening chance. */
  chancePercent?: number;
  /** Chance inside one selected slot or loot pool; not an overall opening chance. */
  slotProbabilityPercent?: number;
  minQuantity?: number;
  maxQuantity?: number;
  /** Expected quantity per opening, under the same probability basis as the chance. */
  expectedQuantityPerOpen?: number;
  /** Relative weight inside a conditional pool; never a percentage by itself. */
  weight?: number;
  probabilityBasis?: string;
  conditionalOnGrade?: boolean;
  gradeDistributionKnown?: boolean;
  treasureBoxGrade?: number | string;
  treasureGrade?: number | string;
  slotContributions?: readonly Readonly<Record<string, unknown>>[];
}

export interface ChestDropSourceRecord {
  id?: string;
  poolId?: string;
  sourceId?: string;
  labelZh?: string;
  label?: string;
  sourceLabel?: string;
  name?: string;
  fieldName?: string;
  region?: string;
  sourceKind?: string;
  treasureBoxGrade?: number | string;
  treasureGrade?: number | string;
  [key: string]: unknown;
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

interface ItemDropsFile {
  schemaVersion?: number;
  gameVersion?: string;
  gameBuildId?: string;
  palDrops: PalItemDropRecord[];
  chestDrops?: ChestItemDropRecord[];
  chestSources?: ChestDropSourceRecord[];
  counts?: Readonly<Record<string, unknown>>;
}

const dataUrl = (file: string) => `${import.meta.env.BASE_URL}data/${file}`;

async function fetchJson<T>(file: string): Promise<T> {
  const response = await fetch(dataUrl(file));
  if (response.status === 404)
    throw new Error("当前版本尚未安装完整道具数据快照，请先生成 items.json、recipes.json 与 item-drops.json。");
  if (!response.ok) throw new Error(`${file} 加载失败（${response.status}）`);
  return response.json() as Promise<T>;
}

function unwrapItems(value: ItemsFile | ItemRecord[]) {
  return Array.isArray(value) ? value : value.items;
}

function unwrapRecipes(value: RecipesFile | ItemRecipeRecord[]) {
  return Array.isArray(value) ? value : value.recipes;
}

function groupDropsByItem<T extends { itemId: string }>(records: readonly T[]) {
  const index = new Map<string, T[]>();
  for (const record of records) {
    const entries = index.get(record.itemId) ?? [];
    entries.push(record);
    index.set(record.itemId, entries);
  }
  return index;
}

function groupPalDropsByPal(records: readonly PalItemDropRecord[]) {
  const index = new Map<string, PalItemDropRecord[]>();
  for (const record of records) {
    if (!record.palId) continue;
    const entries = index.get(record.palId) ?? [];
    entries.push(record);
    index.set(record.palId, entries);
  }
  return index;
}

export const useItemDataStore = defineStore("itemData", () => {
  const items = shallowRef<ItemRecord[]>([]);
  const recipes = shallowRef<ItemRecipeRecord[]>([]);
  const palDrops = shallowRef<PalItemDropRecord[]>([]);
  const chestDrops = shallowRef<ChestItemDropRecord[]>([]);
  const chestSources = shallowRef<ChestDropSourceRecord[]>([]);
  const isLoaded = ref(false);
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
  const recipesByUnlockItem = computed(() => {
    const index = new Map<string, ItemRecipeRecord[]>();
    for (const recipe of recipes.value) {
      if (!recipe.unlockItemId) continue;
      const entries = index.get(recipe.unlockItemId) ?? [];
      entries.push(recipe);
      index.set(recipe.unlockItemId, entries);
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
  const itemIconPreviewById = computed(() => {
    const index = new Map<string, ItemRecord>();
    for (const item of items.value) {
      if (item.typeA !== "Blueprint" || item.icon !== "/item-icons/Blueprint.webp") continue;
      const unlockRecipes = recipesByUnlockItem.value.get(item.id);
      if (unlockRecipes?.length !== 1) continue;
      const [unlockRecipe] = unlockRecipes;
      const product = unlockRecipe && itemById.value.get(unlockRecipe.product.itemId);
      if (product?.icon) index.set(item.id, product);
    }
    return index;
  });
  const palDropsByItem = computed(() => groupDropsByItem(palDrops.value));
  const palDropsByPal = computed(() => groupPalDropsByPal(palDrops.value));
  const chestDropsByItem = computed(() => groupDropsByItem(chestDrops.value));

  async function load() {
    if (isLoaded.value) return;
    if (loadPromise) return loadPromise;
    isLoading.value = true;
    error.value = "";
    loadPromise = (async () => {
      try {
        const [itemsFile, recipesFile, itemDropsFile] = await Promise.all([
          fetchJson<ItemsFile | ItemRecord[]>("items.json"),
          fetchJson<RecipesFile | ItemRecipeRecord[]>("recipes.json"),
          fetchJson<ItemDropsFile>("item-drops.json"),
        ]);
        items.value = unwrapItems(itemsFile);
        recipes.value = unwrapRecipes(recipesFile);
        palDrops.value = itemDropsFile.palDrops ?? [];
        chestDrops.value = itemDropsFile.chestDrops ?? [];
        chestSources.value = itemDropsFile.chestSources ?? [];
        isLoaded.value = true;
      } catch (reason) {
        error.value = reason instanceof Error ? reason.message : "道具数据加载失败";
        isLoaded.value = false;
        loadPromise = undefined;
      } finally {
        isLoading.value = false;
      }
    })();
    return loadPromise;
  }

  return {
    items, recipes, palDrops, chestDrops, chestSources,
    itemById, recipeById, recipesByProduct, recipesByUnlockItem, recipesByMaterial,
    itemIconPreviewById, palDropsByItem, palDropsByPal, chestDropsByItem,
    isLoaded, isLoading, error, load,
  };
});
