import type { ItemRecipeRecord, ItemRecord } from "@/stores/itemData";

type ItemWithFamilyMetadata = ItemRecord & { readonly baseItemId?: unknown };

export type ItemRarityTone = "common" | "uncommon" | "rare" | "epic" | "legendary" | "special" | "unknown";

export interface ItemFamily {
  readonly id: string;
  readonly kind: "item" | "blueprint";
  readonly baseItemId?: string;
  readonly variants: readonly ItemRecord[];
  readonly representative: ItemRecord;
  readonly isGrouped: boolean;
}

interface FamilyCandidate {
  readonly item: ItemRecord;
  readonly nameSource: ItemRecord;
  readonly targetTypeA?: string;
  readonly targetTypeB?: string;
}

const rarityByName: Readonly<Record<string, number>> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
  special: 5,
};

const rarityLabels: Readonly<Record<number, string>> = {
  0: "普通",
  1: "精良",
  2: "稀有",
  3: "史诗",
  4: "传说",
  5: "特殊",
};

const rarityTones: Readonly<Record<number, ItemRarityTone>> = {
  0: "common",
  1: "uncommon",
  2: "rare",
  3: "epic",
  4: "legendary",
  5: "special",
};

function rarityOf(item?: ItemRecord) {
  return item?.rarity;
}

/** Returns the normalized numeric rarity used for ordering and family validation. */
export function itemRarityValue(item?: ItemRecord): number | undefined {
  const rarity = rarityOf(item);
  if (typeof rarity === "number") return Number.isFinite(rarity) ? rarity : undefined;
  if (typeof rarity !== "string") return undefined;
  const trimmed = rarity.trim();
  if (!trimmed) return undefined;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) return numeric;
  const normalized = trimmed
    .replace(/^.*::/, "")
    .replace(/^rarity_/i, "")
    .toLocaleLowerCase("en-US");
  return rarityByName[normalized];
}

export function itemRarityLabel(item?: ItemRecord): string {
  const value = itemRarityValue(item);
  return value === undefined ? "未知" : rarityLabels[value] ?? "未知";
}

export function itemRarityTone(item?: ItemRecord): string {
  const value = itemRarityValue(item);
  return value === undefined ? "unknown" : rarityTones[value] ?? "unknown";
}

function familyBaseItemId(item: ItemRecord) {
  const value = (item as ItemWithFamilyMetadata).baseItemId;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isBlueprint(item: ItemRecord) {
  return item.typeA === "Blueprint" || item.typeB === "Blueprint";
}

function normalizedDisplayName(value: string | undefined) {
  return value?.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase() ?? "";
}

function displayNameKey(item: ItemRecord) {
  return `${normalizedDisplayName(item.names.zh)}\u0000${normalizedDisplayName(item.names.en)}`;
}

function hasUsableDisplayName(item: ItemRecord) {
  return Boolean(normalizedDisplayName(item.names.zh) || normalizedDisplayName(item.names.en));
}

function compareItems(left: ItemRecord, right: ItemRecord) {
  const leftRarity = itemRarityValue(left) ?? Number.MAX_SAFE_INTEGER;
  const rightRarity = itemRarityValue(right) ?? Number.MAX_SAFE_INTEGER;
  return leftRarity - rightRarity
    || (left.sortId ?? Number.MAX_SAFE_INTEGER) - (right.sortId ?? Number.MAX_SAFE_INTEGER)
    || left.id.localeCompare(right.id, "en");
}

function canAggregate(candidates: readonly FamilyCandidate[]) {
  if (candidates.length < 2) return false;
  const rarities = candidates.map(({ item }) => itemRarityValue(item));
  if (rarities.some((value) => value === undefined)
    || new Set(rarities).size !== candidates.length) return false;
  const first = candidates.at(0);
  if (!first) return false;
  if (!hasUsableDisplayName(first.nameSource)) return false;
  const nameKey = displayNameKey(first.nameSource);
  return candidates.every(({ nameSource, targetTypeA, targetTypeB }) =>
    displayNameKey(nameSource) === nameKey
    && targetTypeA === first.targetTypeA
    && targetTypeB === first.targetTypeB);
}

function singletonFamily(item: ItemRecord): ItemFamily {
  const kind = isBlueprint(item) ? "blueprint" : "item";
  return {
    id: `${kind}:single:${item.id}`,
    kind,
    variants: [item],
    representative: item,
    isGrouped: false,
  };
}

/**
 * Builds lossless display families. A family only collapses when every candidate
 * has a distinct known rarity and the same normalized Chinese and English name.
 */
export function buildItemFamilies(
  items: readonly ItemRecord[],
  recipes: readonly ItemRecipeRecord[],
): ItemFamily[] {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const recipesByUnlockItem = new Map<string, ItemRecipeRecord[]>();
  for (const recipe of recipes) {
    if (!recipe.unlockItemId) continue;
    const matches = recipesByUnlockItem.get(recipe.unlockItemId) ?? [];
    matches.push(recipe);
    recipesByUnlockItem.set(recipe.unlockItemId, matches);
  }

  const candidatesByKey = new Map<string, FamilyCandidate[]>();
  const singletons: ItemRecord[] = [];
  for (const item of items) {
    let key: string | undefined;
    let candidate: FamilyCandidate | undefined;
    if (isBlueprint(item)) {
      const matches = recipesByUnlockItem.get(item.id) ?? [];
      if (matches.length === 1) {
        const product = itemById.get(matches[0]!.product.itemId);
        const baseItemId = product && familyBaseItemId(product);
        if (product && baseItemId) {
          key = `blueprint:family:${baseItemId}`;
          candidate = {
            item,
            nameSource: product,
            targetTypeA: product.typeA,
            targetTypeB: product.typeB,
          };
        }
      }
    } else {
      const baseItemId = familyBaseItemId(item);
      if (baseItemId) {
        key = `item:family:${item.typeA ?? ""}:${item.typeB ?? ""}:${baseItemId}`;
        candidate = {
          item,
          nameSource: item,
          targetTypeA: item.typeA,
          targetTypeB: item.typeB,
        };
      }
    }
    if (!key || !candidate) {
      singletons.push(item);
      continue;
    }
    const bucket = candidatesByKey.get(key) ?? [];
    bucket.push(candidate);
    candidatesByKey.set(key, bucket);
  }

  const families: ItemFamily[] = singletons.map(singletonFamily);
  for (const [id, candidates] of candidatesByKey) {
    if (!canAggregate(candidates)) {
      families.push(...candidates.map(({ item }) => singletonFamily(item)));
      continue;
    }
    const variants = candidates.map(({ item }) => item).sort(compareItems);
    const representative = variants[0]!;
    const kind = id.startsWith("blueprint:") ? "blueprint" : "item";
    families.push({
      id,
      kind,
      baseItemId: id.slice(id.lastIndexOf(":") + 1),
      variants,
      representative,
      isGrouped: true,
    });
  }
  return families.sort((left, right) =>
    compareItems(left.representative, right.representative) || left.id.localeCompare(right.id, "en"));
}

/** Returns the exact variant satisfying a search predicate, never a family placeholder. */
export function findMatchingFamilyVariant(
  family: ItemFamily,
  matches: (item: ItemRecord) => boolean,
  preferredItemId?: string,
): ItemRecord | undefined {
  const preferred = preferredItemId
    ? family.variants.find((item) => item.id === preferredItemId)
    : undefined;
  if (preferred && matches(preferred)) return preferred;
  return family.variants.find(matches);
}
