<script setup lang="ts">
import { storeToRefs } from "pinia";
import { NButton, NEmpty, NSelect, NTabPane, NTabs } from "naive-ui";
import { computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { findChains, planFromOwned } from "@/core";
import type { BreedPlan } from "@/core";
import BreedPlanCard from "@/components/BreedPlanCard.vue";
import DataState from "@/components/DataState.vue";
import EggshellCard from "@/components/EggshellCard.vue";
import PageIntro from "@/components/PageIntro.vue";
import PalSelect from "@/components/PalSelect.vue";
import ShareButton from "@/components/ShareButton.vue";
import { isSnapshotQuery, queriesEqual, snapshotQuery } from "@/routing/queryState";
import { useCollectionStore } from "@/stores/collection";
import { usePalDataStore } from "@/stores/palData";
import { usePathsStore } from "@/stores/paths";

const palData = usePalDataStore();
const collection = useCollectionStore();
const paths = usePathsStore();
const route = useRoute();
const router = useRouter();
const { visiblePals, palById, index, isLoading, error } = storeToRefs(palData);
const { entries } = storeToRefs(collection);
const { mode, start, target, maxDepth, lastRun } = storeToRefs(paths);
const { load } = palData;
const modes = [
  { id: "single", label: "单起点路线", help: "每代推荐一个配偶" },
  { id: "owned", label: "从库存规划", help: "计算所有繁育支线" },
] as const;
const depthOptions = Array.from({ length: 8 }, (_, index) => ({ label: `${index + 1} 代`, value: index + 1 }));
const hasSearched = computed(() => Boolean(lastRun.value));
const emptyDescription = computed(() => lastRun.value?.mode === "owned" && !entries.value.length
  ? "先在图鉴中标记至少一种已拥有的帕鲁。"
  : "代数范围内没有路线，试试增加上限。");

let routeHydrated = false;
let applyingRoute = false;

function currentRouteQuery() {
  return snapshotQuery({
    mode: mode.value === "single" ? undefined : mode.value,
    start: start.value || undefined,
    target: target.value || undefined,
    depth: maxDepth.value === 5 ? undefined : String(maxDepth.value),
    run: lastRun.value ? "1" : undefined,
  });
}

function syncRoute() {
  if (!routeHydrated || applyingRoute || route.name !== "paths") return;
  const query = currentRouteQuery();
  if (!queriesEqual(route.query, query)) void router.replace({ path: route.path, query });
}

watch([() => route.name, () => route.query, () => visiblePals.value.length], ([routeName, query, palCount]) => {
  if (routeName !== "paths" || !palCount) return;
  paths.sanitize(new Set(visiblePals.value.map((pal) => pal.id)));
  if (isSnapshotQuery(query) && queriesEqual(query, currentRouteQuery())) {
    routeHydrated = true;
    return;
  }
  applyingRoute = true;
  try {
    if (isSnapshotQuery(query)) paths.reset();
    paths.applyRoute(query);
  } finally {
    applyingRoute = false;
  }
  routeHydrated = true;
  syncRoute();
}, { immediate: true });

watch([mode, start, target, maxDepth, lastRun], syncRoute, { deep: true, flush: "sync" });

const plans = computed<BreedPlan[]>(() => {
  const run = lastRun.value;
  if (!index.value || !run) return [];
  return run.mode === "single"
    ? findChains(index.value, run.start, run.target, run.maxDepth)
    : planFromOwned(index.value, entries.value, run.target, run.maxDepth);
});
</script>

<template>
  <main class="page-shell">
    <PageIntro eyebrow="路线室" title="繁育路线" description="按最少繁育代数查路线；库存模式会把多条支线合成一棵完整繁育树。">
      <template #actions>
        <ShareButton
          :to="{ path: '/paths', query: currentRouteQuery() }"
          :disabled="!visiblePals.length"
          title="繁育路线 · 帕鲁孵化实验室"
        />
      </template>
    </PageIntro>
    <DataState :is-loading :error @retry="load">
      <NTabs v-model:value="mode" class="segmented-control segmented-control--two" type="segment" aria-label="选择路径模式" :pane-wrapper-style="{ display: 'none' }" :tab-style="{ flex: '1 1 0', justifyContent: 'center', minWidth: 0 }">
        <NTabPane v-for="item in modes" :key="item.id" :name="item.id">
          <template #tab><span class="mode-tab"><strong>{{ item.label }}</strong><small>{{ item.help }}</small></span></template>
        </NTabPane>
      </NTabs>

      <EggshellCard tone="coral" class="route-form">
        <div class="route-form__grid">
          <div v-if="mode === 'single'" class="parent-field">
            <PalSelect v-model="start" :pals="visiblePals" label="起点帕鲁" />
          </div>
          <div v-else class="inventory-summary">
            <strong>{{ entries.length }}</strong><span>种已记录帕鲁</span>
            <RouterLink :to="{ path: '/paldex', query: { view: 'all' } }">管理拥有标记 →</RouterLink>
          </div>
          <span class="route-arrow" aria-hidden="true">⟶</span>
          <PalSelect v-model="target" :pals="visiblePals" label="目标帕鲁" />
        </div>
        <div class="route-form__actions">
          <label class="field field--compact depth-field"><span class="field__label">最多代数</span><NSelect v-model:value="maxDepth" class="field-control" :options="depthOptions" :fallback-option="false" filterable :input-props="{ 'aria-label': '最多代数' }" size="large" /></label>
          <NButton class="button--large" type="primary" size="large" round @click="paths.submit()">检索最短路线</NButton>
        </div>
      </EggshellCard>

      <section class="results-section" aria-live="polite">
        <header class="section-heading"><div><p class="eyebrow">路线结果</p><h2>{{ hasSearched ? `${plans.length} 个最短方案` : "还没有开始检索" }}</h2></div></header>
        <NEmpty v-if="!hasSearched" class="empty-state" description="选定起点与目标，按代展开路线。" size="large" />
        <NEmpty v-else-if="!plans.length" class="empty-state" :description="emptyDescription" size="large" />
        <div v-else class="plan-list">
          <p v-if="plans.length === 20" class="notice">按最少代数排序，仅显示前 20 条。</p>
          <BreedPlanCard v-for="(plan, i) in plans" :key="i" :plan :pal-by-id :number="i + 1" />
        </div>
      </section>
    </DataState>
  </main>
</template>
