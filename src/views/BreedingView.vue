<script setup lang="ts">
import { storeToRefs } from "pinia";
import { NButton, NCheckbox, NEmpty, NTabPane, NTabs } from "naive-ui";
import { computed, watch } from "vue";
import { useRoute } from "vue-router";
import { findMates, getChildren, getParentPairs } from "@/core";
import type { PalId } from "@/core";
import DataState from "@/components/DataState.vue";
import EggshellCard from "@/components/EggshellCard.vue";
import PageIntro from "@/components/PageIntro.vue";
import PalChip from "@/components/PalChip.vue";
import PalSelect from "@/components/PalSelect.vue";
import { useBreedingStore } from "@/stores/breeding";
import { useCollectionStore } from "@/stores/collection";
import { usePalDataStore } from "@/stores/palData";

const route = useRoute();
const palData = usePalDataStore();
const collection = useCollectionStore();
const breeding = useBreedingStore();
const { visiblePals, palById, index, isLoading, error } = storeToRefs(palData);
const { entries } = storeToRefs(collection);
const { mode, parentA, parentB, target, ownedOnly } = storeToRefs(breeding);
const { load } = palData;
const modes = [
  { id: "forward", label: "A ＋ B ＝ ?", help: "两个亲本会孵出谁" },
  { id: "mate", label: "A ＋ ? ＝ B", help: "为亲本寻找配偶" },
  { id: "pairs", label: "? ＋ ? ＝ B", help: "查看目标的全部父母组合" },
] as const;

watch([() => route.query, () => visiblePals.value.length], ([query, palCount]) => {
  if (palCount) breeding.applyRoute(query);
}, { immediate: true });

interface Recipe {
  a: PalId;
  b: PalId;
  child: PalId;
}

function uniqueRecipes(rows: readonly Recipe[]) {
  const result = new Map<string, Recipe & { key: string }>();
  for (const row of rows) {
    const parents = [row.a, row.b].sort();
    const key = `${parents[0]}\0${parents[1]}\0${row.child}`;
    if (!result.has(key)) result.set(key, { ...row, key });
  }
  return [...result.values()];
}

const results = computed(() => {
  if (!index.value) return [];
  if (mode.value === "forward" && parentA.value && parentB.value) {
    return uniqueRecipes(getChildren(index.value, parentA.value, parentB.value).map((match) => ({
      a: match.parentA, b: match.parentB, child: match.child,
    })));
  }
  if (mode.value === "mate" && parentA.value && target.value) {
    return uniqueRecipes(findMates(index.value, parentA.value, target.value).map((match) => ({
      a: match.parent, b: match.mate, child: match.child,
    })));
  }
  if (mode.value === "pairs" && target.value) {
    return uniqueRecipes(getParentPairs(index.value, target.value, ownedOnly.value ? entries.value : undefined)
      .map((match) => ({ a: match.parentA, b: match.parentB, child: match.child })));
  }
  return [];
});

const isReady = computed(() => mode.value === "forward"
  ? Boolean(parentA.value && parentB.value)
  : mode.value === "mate"
    ? Boolean(parentA.value && target.value)
    : Boolean(target.value));

function swapParents() {
  [parentA.value, parentB.value] = [parentB.value, parentA.value];
}
</script>

<template>
  <main class="page-shell">
    <PageIntro eyebrow="育种台" title="配种计算" description="正向算子代、反查配偶，或一次查看目标帕鲁的全部父母组合。" />
    <DataState :is-loading :error @retry="load">
      <NTabs v-model:value="mode" class="segmented-control" type="segment" aria-label="选择计算方式" :pane-wrapper-style="{ display: 'none' }" :tab-style="{ flex: '1 1 0', justifyContent: 'center', minWidth: 0 }">
        <NTabPane v-for="item in modes" :key="item.id" :name="item.id">
          <template #tab><span class="mode-tab"><strong>{{ item.label }}</strong><small>{{ item.help }}</small></span></template>
        </NTabPane>
      </NTabs>

      <EggshellCard tone="sky" class="calculator-shell">
        <div class="calculator-fields">
          <div v-if="mode !== 'pairs'" class="parent-field">
            <PalSelect v-model="parentA" :pals="visiblePals" label="亲本 A" />
          </div>

          <NButton v-if="mode === 'forward'" class="swap-button" circle aria-label="交换两个亲本" @click="swapParents">⇄</NButton>
          <span v-else-if="mode === 'mate'" class="equation-mark" aria-hidden="true">＋ ? ＝</span>
          <span v-else class="equation-mark" aria-hidden="true">? ＋ ? ＝</span>

          <div v-if="mode === 'forward'" class="parent-field">
            <PalSelect v-model="parentB" :pals="visiblePals" label="亲本 B" />
          </div>
          <PalSelect v-else v-model="target" :pals="visiblePals" label="目标子代 B" />
        </div>
        <NCheckbox v-if="mode === 'pairs'" v-model:checked="ownedOnly" class="check-row">只看库存中可直接配对的组合</NCheckbox>
      </EggshellCard>

      <section class="results-section" aria-live="polite">
        <header class="section-heading">
          <div><p class="eyebrow">计算结果</p><h2>{{ isReady ? `${results.length} 个可行组合` : "等待选择帕鲁" }}</h2></div>
          <span v-if="isReady" class="result-count">{{ results.length }}</span>
        </header>

        <NEmpty v-if="!isReady" class="empty-state" description="选好帕鲁后查看结果。" size="large" />
        <NEmpty v-else-if="!results.length" class="empty-state" description="当前组合没有可行配方。" size="large" />
        <ol v-else class="recipe-list">
          <li v-for="match in results" :key="match.key" class="recipe-row">
            <PalChip :pal="palById.get(match.a)" />
            <span class="operator">＋</span>
            <PalChip :pal="palById.get(match.b)" />
            <span class="operator">＝</span>
            <PalChip :pal="palById.get(match.child)" />
          </li>
        </ol>
      </section>
    </DataState>
  </main>
</template>
