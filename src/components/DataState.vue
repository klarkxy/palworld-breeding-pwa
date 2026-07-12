<script setup lang="ts">
import { NAlert, NButton, NEmpty, NSpin } from "naive-ui";

defineProps<{ isLoading: boolean; error: string }>();
defineEmits<{ retry: [] }>();
</script>

<template>
  <div v-if="isLoading" class="data-state" role="status" aria-live="polite">
    <NSpin>
      <template #description>正在加载配种数据…</template>
    </NSpin>
  </div>
  <div v-else-if="error" class="data-state data-state--error" role="alert">
    <NAlert type="error" title="数据没有加载成功" :bordered="false" :show-icon="false">
      <NEmpty :description="error" size="small">
        <template #extra>
          <NButton type="primary" @click="$emit('retry')">重新加载</NButton>
        </template>
      </NEmpty>
    </NAlert>
  </div>
  <slot v-else />
</template>
