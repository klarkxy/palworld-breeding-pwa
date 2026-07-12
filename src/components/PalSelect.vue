<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import type { PalId, PalRecord } from "@/core";
import { elementName, palLabel, palPinyinInitials, workName } from "@/composables/usePalData";

const { pals, label, hint = "中文 / 拼音首字母 / English / 编号 / ID" } = defineProps<{
  pals: readonly PalRecord[];
  label: string;
  hint?: string;
}>();
const model = defineModel<PalId | "">({ required: true });
const inputId = useId();
const listId = useId();
const inputValue = ref("");
const element = ref("");
const work = ref("");
const variant = ref<"all" | "base" | "variant">("all");
const elementOptions = computed(() => [...new Set(pals.flatMap((pal) => pal.elements))].sort());
const workOptions = computed(() => [...new Set(pals.flatMap((pal) => Object.keys(pal.workSuitability)))].sort());
const filteredPals = computed(() => pals.filter((pal) => {
  if (element.value && !pal.elements.includes(element.value)) return false;
  if (work.value && !(work.value in pal.workSuitability)) return false;
  if (variant.value === "base" && pal.variant) return false;
  return variant.value !== "variant" || pal.variant;
}));

function syncFromModel() {
  const selected = pals.find((pal) => pal.id === model.value);
  inputValue.value = selected ? palLabel(selected) : "";
}

function commit() {
  const value = inputValue.value.trim().toLocaleLowerCase();
  const selected = pals.find((pal) => {
    const candidates = [palLabel(pal), pal.id, pal.names.zh, pal.names.en, String(pal.dexNo)];
    return candidates.some((candidate) => candidate.toLocaleLowerCase() === value);
  }) ?? (() => {
    const matches = pals.filter((pal) => palPinyinInitials(pal) === value);
    return matches.length === 1 ? matches[0] : undefined;
  })();
  model.value = selected?.id ?? "";
  if (selected) inputValue.value = palLabel(selected);
}

watch([() => model.value, () => pals.length], syncFromModel, { immediate: true });
</script>

<template>
  <div class="field pal-select">
    <label class="field__label" :for="inputId">{{ label }}</label>
    <span class="field__control">
      <input
        :id="inputId"
        v-model="inputValue"
        type="search"
        :list="listId"
        :placeholder="hint"
        autocomplete="off"
        @change="commit"
        @blur="commit"
        @keydown.enter.prevent="commit"
      />
      <button v-if="model" class="icon-button" type="button" aria-label="清除选择" @click="model = ''; inputValue = ''">×</button>
    </span>
    <datalist :id="listId">
      <option v-for="pal in filteredPals" :key="pal.id" :value="palLabel(pal)" :label="`${palPinyinInitials(pal).toLocaleUpperCase()} · ${pal.names.zh}`" />
    </datalist>
    <details class="pal-select__filters">
      <summary>按属性、工作或亚种筛选</summary>
      <span class="pal-select__filter-grid">
        <label><span>属性</span><select v-model="element" :aria-label="`${label}属性筛选`"><option value="">全部</option><option v-for="item in elementOptions" :key="item" :value="item">{{ elementName(item) }}</option></select></label>
        <label><span>工作</span><select v-model="work" :aria-label="`${label}工作筛选`"><option value="">全部</option><option v-for="item in workOptions" :key="item" :value="item">{{ workName(item) }}</option></select></label>
        <label><span>种类</span><select v-model="variant" :aria-label="`${label}种类筛选`"><option value="all">本体与亚种</option><option value="base">仅本体</option><option value="variant">仅亚种</option></select></label>
      </span>
    </details>
  </div>
</template>
