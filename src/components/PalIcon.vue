<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { PalRecord } from "@/core";

const { pal, size = "medium" } = defineProps<{ pal?: PalRecord; size?: "small" | "medium" | "large" }>();
const hasError = ref(false);
const src = computed(() => {
  if (!pal?.icon) return "";
  if (/^https?:/.test(pal.icon)) return pal.icon;
  return `${import.meta.env.BASE_URL}${pal.icon.replace(/^\//, "")}`;
});

watch(() => pal?.id, () => (hasError.value = false));
</script>

<template>
  <span class="pal-icon" :class="`pal-icon--${size}`">
    <img
      v-if="pal && src && !hasError"
      :src="src"
      :alt="pal.names.zh"
      width="100"
      height="100"
      loading="lazy"
      @error="hasError = true"
    />
    <span v-else class="pal-icon__fallback" role="img" :aria-label="pal ? `${pal.names.zh}图标不可用` : '帕鲁图标占位'">◒</span>
  </span>
</template>
