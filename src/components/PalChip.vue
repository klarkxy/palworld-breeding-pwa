<script setup lang="ts">
import type { PalRecord } from "@/core";
import { formatDex } from "@/composables/usePalData";
import PalIcon from "./PalIcon.vue";

defineProps<{ pal?: PalRecord; muted?: boolean }>();
</script>

<template>
  <span class="pal-chip" :class="{ 'pal-chip--muted': muted }">
    <PalIcon :pal size="small" />
    <span>
      <strong>{{ pal?.names.zh ?? "未知帕鲁" }}</strong>
      <small>{{ pal ? formatDex(pal) : "数据缺失" }}</small>
    </span>
  </span>
</template>
