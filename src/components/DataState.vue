<script setup lang="ts">
defineProps<{ isLoading: boolean; error: string }>();
defineEmits<{ retry: [] }>();
</script>

<template>
  <div v-if="isLoading" class="data-state" role="status">
    <span class="egg-loader" aria-hidden="true" />
    <p>正在整理 1.0 配种手册…</p>
  </div>
  <div v-else-if="error" class="data-state data-state--error" role="alert">
    <p><strong>数据没有加载成功</strong></p>
    <p>{{ error }}</p>
    <button class="button button--primary" type="button" @click="$emit('retry')">重新加载</button>
  </div>
  <slot v-else />
</template>
