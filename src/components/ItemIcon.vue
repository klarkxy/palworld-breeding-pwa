<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { ItemRecord } from "@/stores/itemData";

const { item, size = "medium" } = defineProps<{
  item?: ItemRecord;
  size?: "small" | "medium" | "large";
}>();
const failed = ref(false);
const source = computed(() => {
  if (!item?.icon) return "";
  if (/^(?:data:|https?:)/i.test(item.icon)) return item.icon;
  return `${import.meta.env.BASE_URL}${item.icon.replace(/^\/+/, "")}`;
});
const fallback = computed(() => item?.names.zh?.trim().charAt(0) || "□");
watch(source, () => { failed.value = false; });
</script>

<template>
  <span class="item-icon" :class="`item-icon--${size}`" aria-hidden="true">
    <img v-if="source && !failed" :src="source" alt="" loading="lazy" @error="failed = true" />
    <span v-else class="item-icon__fallback">{{ fallback }}</span>
  </span>
</template>
