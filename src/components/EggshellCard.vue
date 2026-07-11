<script setup lang="ts">
const { tone = "plain" } = defineProps<{ tone?: "plain" | "sky" | "coral" }>();
</script>

<template>
  <section class="eggshell-card" :class="`eggshell-card--${tone}`">
    <slot />
  </section>
</template>
