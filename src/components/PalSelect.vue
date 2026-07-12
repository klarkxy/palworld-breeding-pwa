<script setup lang="ts">
import { NSelect } from "naive-ui";
import type { SelectOption } from "naive-ui";
import { computed, h, ref, useId } from "vue";
import type { InputHTMLAttributes } from "vue";
import PalIcon from "@/components/PalIcon.vue";
import type { PalId, PalRecord } from "@/core";
import {
  formatDex,
  palLabel,
  palMatchesSearch,
  palPinyinInitials,
} from "@/composables/usePalData";

const { pals, label, hint = "中文 / 拼音首字母 / English / 编号 / ID" } = defineProps<{
  pals: readonly PalRecord[];
  label: string;
  hint?: string;
}>();
const model = defineModel<PalId | "">({ required: true });
const inputId = useId();
const listId = useId();
const searchValue = ref("");
const isOpen = ref(false);

interface PalOption extends SelectOption {
  value: PalId;
  label: string;
  pal: PalRecord;
}

const options = computed<PalOption[]>(() => pals.map((pal) => ({
  value: pal.id,
  label: palLabel(pal),
  pal,
})));
const selectedValue = computed<PalId | null>({
  get: () => model.value || null,
  set: (value) => (model.value = value ?? ""),
});
const inputProps = computed<InputHTMLAttributes>(() => ({
  id: inputId,
  name: inputId,
  type: "search",
  autocomplete: "off",
  role: "combobox",
  "aria-label": label,
  "aria-autocomplete": "list",
  "aria-haspopup": "listbox",
  "aria-expanded": isOpen.value,
  "aria-controls": listId,
}));
const menuProps = computed(() => ({
  id: listId,
  class: "pal-select__menu",
  "aria-label": `${label}候选帕鲁`,
}));

function filterPal(pattern: string, option: SelectOption) {
  return palMatchesSearch((option as PalOption).pal, pattern);
}

function renderPal(option: SelectOption, selected: boolean) {
  const pal = (option as PalOption).pal;
  return h("span", { class: "pal-select__option-content" }, [
    h("span", { class: selected ? "pal-select__selected-icon" : "pal-select__option-icon", "aria-hidden": "true" }, [
      h(PalIcon, { pal, size: "small" }),
    ]),
    h("span", { class: "pal-select__option-copy" }, [
      h("strong", pal.names.zh),
      h("small", `${palPinyinInitials(pal).toLocaleUpperCase()} · ${pal.names.en} · ${formatDex(pal)} · ${pal.id}`),
    ]),
  ]);
}

function updateValue(value: string | number | Array<string | number> | null) {
  selectedValue.value = typeof value === "string" ? value : null;
  searchValue.value = "";
}

function commitSearch(rawValue = searchValue.value) {
  const value = rawValue.trim().toLocaleLowerCase();
  if (!value) return;
  const selected = pals.find((pal) => [palLabel(pal), pal.id, pal.names.zh, pal.names.en, String(pal.dexNo)]
    .some((candidate) => candidate.toLocaleLowerCase() === value))
    ?? (() => {
      const matches = pals.filter((pal) => palPinyinInitials(pal) === value);
      return matches.length === 1 ? matches[0] : undefined;
    })();
  model.value = selected?.id ?? "";
  searchValue.value = "";
}

function commitOnTab(event: KeyboardEvent) {
  if (event.key === "Tab" && event.target instanceof HTMLInputElement) commitSearch(event.target.value);
}
</script>

<template>
  <div class="field pal-select" @keydown.capture="commitOnTab">
    <label class="field__label" :for="inputId">{{ label }}</label>
    <NSelect
      class="field-control"
      :value="selectedValue"
      :options="options"
      :filter="filterPal"
      :render-label="renderPal"
      :placeholder="hint"
      :fallback-option="false"
      :input-props="inputProps"
      :menu-props="menuProps"
      clearable
      filterable
      ignore-composition
      show-on-focus
      virtual-scroll
      size="large"
      menu-size="large"
      @search="searchValue = $event"
      @blur="commitSearch()"
      @update:show="isOpen = $event"
      @update:value="updateValue"
    />
  </div>
</template>
