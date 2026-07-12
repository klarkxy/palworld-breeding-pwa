<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from "vue";
import PalIcon from "@/components/PalIcon.vue";
import type { PalId, PalRecord } from "@/core";
import {
  elementName,
  formatDex,
  palLabel,
  palMatchesSearch,
  palPinyinInitials,
  workName,
} from "@/composables/usePalData";

const { pals, label, hint = "中文 / 拼音首字母 / English / 编号 / ID" } = defineProps<{
  pals: readonly PalRecord[];
  label: string;
  hint?: string;
}>();
const model = defineModel<PalId | "">({ required: true });
const inputId = useId();
const listId = useId();
const inputValue = ref("");
const isOpen = ref(false);
const activeIndex = ref(-1);
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
const selectedPal = computed(() => pals.find((pal) => pal.id === model.value));
const displayedSelectedPal = computed(() => {
  const selected = selectedPal.value;
  return selected && inputValue.value === palLabel(selected) ? selected : undefined;
});
const searchQuery = computed(() => displayedSelectedPal.value ? "" : inputValue.value);
const suggestions = computed(() => filteredPals.value.filter((pal) => palMatchesSearch(pal, searchQuery.value)));
const activeOptionId = computed(() => isOpen.value && activeIndex.value >= 0
  ? `${listId}-${activeIndex.value}`
  : undefined);

function syncFromModel() {
  const selected = selectedPal.value;
  inputValue.value = selected ? palLabel(selected) : "";
}

function closeMenu() {
  isOpen.value = false;
  activeIndex.value = -1;
}

function openMenu() {
  isOpen.value = true;
  activeIndex.value = -1;
}

function selectPal(pal: PalRecord) {
  model.value = pal.id;
  inputValue.value = palLabel(pal);
  closeMenu();
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
  closeMenu();
}

function clearSelection() {
  model.value = "";
  inputValue.value = "";
  closeMenu();
}

function handleInput() {
  isOpen.value = true;
  activeIndex.value = -1;
}

function moveActive(direction: 1 | -1) {
  if (!isOpen.value) isOpen.value = true;
  if (!suggestions.value.length) return;
  activeIndex.value = activeIndex.value < 0
    ? (direction === 1 ? 0 : suggestions.value.length - 1)
    : (activeIndex.value + direction + suggestions.value.length) % suggestions.value.length;
  void nextTick(() => document.getElementById(`${listId}-${activeIndex.value}`)?.scrollIntoView({ block: "nearest" }));
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    moveActive(event.key === "ArrowDown" ? 1 : -1);
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    closeMenu();
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    const activePal = suggestions.value[activeIndex.value];
    if (isOpen.value && activePal) selectPal(activePal);
    else commit();
  }
}

watch([() => model.value, () => pals.length], syncFromModel, { immediate: true });
</script>

<template>
  <div class="field pal-select" :class="{ 'pal-select--open': isOpen }">
    <label class="field__label" :for="inputId">{{ label }}</label>
    <div class="field__control" :class="{ 'field__control--selected': displayedSelectedPal }">
      <span v-if="displayedSelectedPal" class="pal-select__selected-icon" aria-hidden="true">
        <PalIcon :pal="displayedSelectedPal" size="small" />
      </span>
      <input
        :id="inputId"
        v-model="inputValue"
        type="search"
        :placeholder="hint"
        autocomplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-haspopup="listbox"
        :aria-expanded="isOpen"
        :aria-controls="listId"
        :aria-activedescendant="activeOptionId"
        @focus="openMenu"
        @click="openMenu"
        @input="handleInput"
        @blur="commit"
        @keydown="handleKeydown"
      />
      <button v-if="model" class="icon-button" type="button" aria-label="清除选择" @click="clearSelection">×</button>
      <ul v-if="isOpen" :id="listId" class="pal-select__menu" role="listbox" :aria-label="`${label}候选帕鲁`">
        <li
          v-for="(pal, index) in suggestions"
          :id="`${listId}-${index}`"
          :key="pal.id"
          class="pal-select__option"
          :class="{ 'pal-select__option--active': activeIndex === index }"
          role="option"
          :aria-selected="model === pal.id"
          @mousedown.prevent
          @click="selectPal(pal)"
        >
          <span aria-hidden="true"><PalIcon :pal="pal" size="small" /></span>
          <span class="pal-select__option-copy">
            <strong>{{ pal.names.zh }}</strong>
            <small>{{ palPinyinInitials(pal).toLocaleUpperCase() }} · {{ pal.names.en }} · {{ formatDex(pal) }} · {{ pal.id }}</small>
          </span>
          <span class="pal-select__option-check" aria-hidden="true">{{ model === pal.id ? "✓" : "" }}</span>
        </li>
        <li v-if="!suggestions.length" class="pal-select__empty" role="option" aria-disabled="true">没有匹配的帕鲁</li>
      </ul>
    </div>
    <details class="pal-select__filters" @toggle="closeMenu">
      <summary>按属性、工作或亚种筛选</summary>
      <span class="pal-select__filter-grid">
        <label><span>属性</span><select v-model="element" :aria-label="`${label}属性筛选`"><option value="">全部</option><option v-for="item in elementOptions" :key="item" :value="item">{{ elementName(item) }}</option></select></label>
        <label><span>工作</span><select v-model="work" :aria-label="`${label}工作筛选`"><option value="">全部</option><option v-for="item in workOptions" :key="item" :value="item">{{ workName(item) }}</option></select></label>
        <label><span>种类</span><select v-model="variant" :aria-label="`${label}种类筛选`"><option value="all">本体与亚种</option><option value="base">仅本体</option><option value="variant">仅亚种</option></select></label>
      </span>
    </details>
  </div>
</template>
