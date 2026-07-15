<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { itemRarityTone } from "@/core/itemFamilies";
import type { ItemRecord } from "@/stores/itemData";

const { item, previewItem, badge, size = "medium" } = defineProps<{
  item?: ItemRecord;
  previewItem?: ItemRecord;
  badge?: string;
  size?: "small" | "medium" | "large";
}>();

const sourceIndex = ref(0);
const resolveSource = (icon: string) => /^(?:data:|https?:)/i.test(icon)
  ? icon
  : `${import.meta.env.BASE_URL}${icon.replace(/^\/+/, "")}`;
const sources = computed(() => [...new Set(
  [previewItem?.icon, item?.icon]
    .filter((icon): icon is string => Boolean(icon))
    .map(resolveSource),
)]);
const source = computed(() => sources.value[sourceIndex.value] ?? "");
const fallback = computed(() => item?.names.zh?.trim().charAt(0)
  || previewItem?.names.zh?.trim().charAt(0)
  || "□");
const rarityTone = computed(() => itemRarityTone(item));
const previewItemId = computed(() => previewItem && previewItem.id !== item?.id
  ? previewItem.id
  : undefined);
const badgeLabel = computed(() => badge?.trim() ?? "");

watch([() => item, () => previewItem], () => {
  sourceIndex.value = 0;
});

function tryNextSource() {
  sourceIndex.value += 1;
}
</script>

<template>
  <span
    class="item-icon"
    :class="[`item-icon--${size}`, `item-icon--rarity-${rarityTone}`]"
    :data-preview-item-id="previewItemId"
    aria-hidden="true"
  >
    <img v-if="source" :src="source" alt="" loading="lazy" @error="tryNextSource" />
    <span v-else class="item-icon__fallback">{{ fallback }}</span>
    <span v-if="badgeLabel" class="item-icon__badge">{{ badgeLabel }}</span>
  </span>
</template>
