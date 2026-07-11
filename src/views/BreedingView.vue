<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { findMates, getChildren, getParentPairs } from "@/core";
import type { Sex } from "@/core";
import { useCollection } from "@/composables/useCollection";
import { usePalData } from "@/composables/usePalData";
import DataState from "@/components/DataState.vue";
import EggshellCard from "@/components/EggshellCard.vue";
import PageIntro from "@/components/PageIntro.vue";
import PalChip from "@/components/PalChip.vue";
import PalSelect from "@/components/PalSelect.vue";

const route = useRoute();
const { visiblePals, palById, index, isLoading, error, load } = usePalData();
const { entries } = useCollection();
const modes = [
  { id: "forward", label: "A ＋ B ＝ ?", help: "查看两个亲本会孵出谁" },
  { id: "mate", label: "A ＋ ? ＝ B", help: "为固定亲本寻找配偶" },
  { id: "pairs", label: "? ＋ ? ＝ B", help: "查看目标的全部父母组合" },
] as const;
type Mode = (typeof modes)[number]["id"];

const mode = ref<Mode>((route.query.mode as Mode) || "forward");
const parentA = ref(typeof route.query.a === "string" ? route.query.a : "");
const parentB = ref("");
const target = ref(typeof route.query.target === "string" ? route.query.target : "");
const sexA = ref<Sex | "">("");
const sexB = ref<Sex | "">("");
const ownedOnly = ref(false);

watch(() => route.query, (query) => {
  if (typeof query.a === "string") parentA.value = query.a;
  if (typeof query.target === "string") target.value = query.target;
  if (query.mode === "forward" || query.mode === "mate" || query.mode === "pairs") mode.value = query.mode;
});

const results = computed(() => {
  if (!index.value) return [];
  if (mode.value === "forward" && parentA.value && parentB.value) {
    return getChildren(index.value, parentA.value, parentB.value, {
      a: sexA.value || undefined,
      b: sexB.value || undefined,
    }).map((match) => ({
      key: `${match.ruleId}-${match.parentASex}-${match.parentBSex}`,
      a: match.parentA, aSex: match.parentASex, b: match.parentB, bSex: match.parentBSex, child: match.child,
    }));
  }
  if (mode.value === "mate" && parentA.value && target.value) {
    return findMates(index.value, parentA.value, target.value, sexA.value || undefined).map((match) => ({
      key: `${match.ruleId}-${match.parentSex}-${match.mateSex}`,
      a: match.parent, aSex: match.parentSex, b: match.mate, bSex: match.mateSex, child: match.child,
    }));
  }
  if (mode.value === "pairs" && target.value) {
    return getParentPairs(index.value, target.value, ownedOnly.value ? entries.value : undefined).map((match) => ({
      key: `${match.ruleId}-${match.parentASex}-${match.parentBSex}`,
      a: match.parentA, aSex: match.parentASex, b: match.parentB, bSex: match.parentBSex, child: match.child,
    }));
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
  [sexA.value, sexB.value] = [sexB.value, sexA.value];
}
</script>

<template>
  <main class="page-shell">
    <PageIntro eyebrow="育种台 / Breed bench" title="把配种问题，放上实验台" description="正向算子代、反查配偶，或一次看完目标帕鲁的全部父母组合。" />
    <DataState :is-loading :error @retry="load">
      <div class="segmented-control" aria-label="选择计算方式">
        <button v-for="item in modes" :key="item.id" type="button" :class="{ active: mode === item.id }" :aria-pressed="mode === item.id" @click="mode = item.id">
          <strong>{{ item.label }}</strong><small>{{ item.help }}</small>
        </button>
      </div>

      <EggshellCard tone="sky" class="calculator-shell">
        <div class="calculator-fields">
          <div v-if="mode !== 'pairs'" class="parent-field">
            <PalSelect v-model="parentA" :pals="visiblePals" label="亲本 A" />
            <label class="field field--compact">
              <span class="field__label">亲本 A 性别</span>
              <select v-model="sexA"><option value="">不限</option><option value="M">♂ 雄性</option><option value="F">♀ 雌性</option></select>
            </label>
          </div>

          <button v-if="mode === 'forward'" class="swap-button" type="button" aria-label="交换两个亲本" @click="swapParents">⇄</button>
          <span v-else-if="mode === 'mate'" class="equation-mark" aria-hidden="true">＋ ? ＝</span>
          <span v-else class="equation-mark" aria-hidden="true">? ＋ ? ＝</span>

          <div v-if="mode === 'forward'" class="parent-field">
            <PalSelect v-model="parentB" :pals="visiblePals" label="亲本 B" />
            <label class="field field--compact">
              <span class="field__label">亲本 B 性别</span>
              <select v-model="sexB"><option value="">不限</option><option value="M">♂ 雄性</option><option value="F">♀ 雌性</option></select>
            </label>
          </div>
          <PalSelect v-else v-model="target" :pals="visiblePals" label="目标子代 B" />
        </div>
        <label v-if="mode === 'pairs'" class="check-row">
          <input v-model="ownedOnly" type="checkbox" />
          只看“我的帕鲁”中现成可配的组合
        </label>
      </EggshellCard>

      <section class="results-section" aria-live="polite">
        <header class="section-heading">
          <div><p class="eyebrow">计算结果</p><h2>{{ isReady ? `${results.length} 个可行组合` : "等待选择帕鲁" }}</h2></div>
          <span v-if="isReady" class="result-count">{{ results.length }}</span>
        </header>

        <div v-if="!isReady" class="empty-state"><span aria-hidden="true">🥚</span><p>选好帕鲁后，结果会在这里破壳。</p></div>
        <div v-else-if="!results.length" class="empty-state"><span aria-hidden="true">⌁</span><p>当前条件没有可行配方，试试取消性别或库存限制。</p></div>
        <ol v-else class="recipe-list">
          <li v-for="match in results" :key="match.key" class="recipe-row">
            <PalChip :pal="palById.get(match.a)" :sex="match.aSex" />
            <span class="operator">＋</span>
            <PalChip :pal="palById.get(match.b)" :sex="match.bSex" />
            <span class="operator">＝</span>
            <PalChip :pal="palById.get(match.child)" />
          </li>
        </ol>
      </section>
    </DataState>
  </main>
</template>
