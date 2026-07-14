<script setup lang="ts">
import { useSlots } from "vue";

defineProps<{ eyebrow: string; title: string; description: string }>();

const slots = useSlots();
</script>

<template>
  <header class="page-intro">
    <p class="eyebrow">{{ eyebrow }}</p>
    <h1>{{ title }}</h1>
    <p class="page-intro__description">{{ description }}</p>
    <div v-if="slots.actions" class="page-intro__actions">
      <slot name="actions" />
    </div>
  </header>
</template>
