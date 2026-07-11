<script setup lang="ts">
import { ref } from "vue";
import { findChains, planFromOwned } from "@/core";
import type { BreedPlan, Sex } from "@/core";
import BreedPlanCard from "@/components/BreedPlanCard.vue";
import DataState from "@/components/DataState.vue";
import EggshellCard from "@/components/EggshellCard.vue";
import PageIntro from "@/components/PageIntro.vue";
import PalSelect from "@/components/PalSelect.vue";
import { useCollection } from "@/composables/useCollection";
import { usePalData } from "@/composables/usePalData";

const { visiblePals, palById, index, isLoading, error, load } = usePalData();
const { entries } = useCollection();
const mode = ref<"single" | "owned">("single");
const start = ref("");
const startSex = ref<Sex | "">("");
const target = ref("");
const maxDepth = ref(5);
const plans = ref<BreedPlan[]>([]);
const hasSearched = ref(false);

function search() {
  hasSearched.value = true;
  if (!index.value || !target.value) {
    plans.value = [];
    return;
  }
  if (mode.value === "single") {
    if (!start.value) return void (plans.value = []);
    const chainStart = startSex.value ? { palId: start.value, sex: startSex.value } : start.value;
    plans.value = findChains(index.value, chainStart, target.value, maxDepth.value);
  } else {
    plans.value = planFromOwned(index.value, entries.value, target.value, maxDepth.value);
  }
}
</script>

<template>
  <main class="page-shell">
    <PageIntro eyebrow="路线室 / Route room" title="从现有帕鲁，走到目标" description="按最少繁育代数查路线；库存模式会把两条中间支线合成一棵完整繁育树。" />
    <DataState :is-loading :error @retry="load">
      <div class="segmented-control segmented-control--two" aria-label="选择路径模式">
        <button type="button" :class="{ active: mode === 'single' }" :aria-pressed="mode === 'single'" @click="mode = 'single'; plans = []; hasSearched = false">
          <strong>单起点路线</strong><small>每代可推荐一个配偶</small>
        </button>
        <button type="button" :class="{ active: mode === 'owned' }" :aria-pressed="mode === 'owned'" @click="mode = 'owned'; plans = []; hasSearched = false">
          <strong>从我的帕鲁规划</strong><small>完整计算所有繁育支线</small>
        </button>
      </div>

      <EggshellCard tone="coral" class="route-form">
        <div class="route-form__grid">
          <div v-if="mode === 'single'" class="parent-field">
            <PalSelect v-model="start" :pals="visiblePals" label="起点帕鲁" />
            <label class="field field--compact"><span class="field__label">已有性别</span><select v-model="startSex"><option value="">不限</option><option value="M">♂ 雄性</option><option value="F">♀ 雌性</option></select></label>
          </div>
          <div v-else class="inventory-summary">
            <strong>{{ entries.length }}</strong><span>种已记录帕鲁</span>
            <RouterLink to="/collection">整理库存 →</RouterLink>
          </div>
          <span class="route-arrow" aria-hidden="true">⟶</span>
          <PalSelect v-model="target" :pals="visiblePals" label="目标帕鲁" />
        </div>
        <div class="route-form__actions">
          <label class="field field--compact depth-field"><span class="field__label">最多代数</span><select v-model.number="maxDepth"><option v-for="depth in 8" :key="depth" :value="depth">{{ depth }} 代</option></select></label>
          <button class="button button--primary button--large" type="button" @click="search">检索最短路线</button>
        </div>
      </EggshellCard>

      <section class="results-section" aria-live="polite">
        <header class="section-heading"><div><p class="eyebrow">路线结果</p><h2>{{ hasSearched ? `${plans.length} 个最短方案` : "还没有开始检索" }}</h2></div></header>
        <div v-if="!hasSearched" class="empty-state"><span aria-hidden="true">⌇</span><p>选定起点与目标，路线图会按代展开。</p></div>
        <div v-else-if="!plans.length" class="empty-state"><span aria-hidden="true">∅</span><p>{{ mode === "owned" && !entries.length ? "先到“我的帕鲁”记录至少一雄一雌。" : "代数范围内没有路线，增加上限或更换起点。" }}</p></div>
        <div v-else class="plan-list">
          <p v-if="plans.length === 20" class="notice">结果已按最少代数、总步骤数和稳定规则顺序排序，仅显示前 20 条。</p>
          <BreedPlanCard v-for="(plan, i) in plans" :key="i" :plan :pal-by-id :number="i + 1" />
        </div>
      </section>
    </DataState>
  </main>
</template>
