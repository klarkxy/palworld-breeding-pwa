<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import DataState from "@/components/DataState.vue";
import PageIntro from "@/components/PageIntro.vue";
import PalIcon from "@/components/PalIcon.vue";
import { elementName, formatDex, palMatchesSearch, usePalData, workName } from "@/composables/usePalData";
import type { PalRecord } from "@/core";

const router = useRouter();
const { visiblePals, selfBreedOnlyIds, isLoading, error, load } = usePalData();
const query = ref("");
const element = ref("");
const work = ref("");
const variant = ref<"all" | "base" | "variant">("all");
type SortKey = "dex" | "hp" | "attack" | "defense" | "stamina" | "maleProbability" | "breedingPower"
  | "slowWalkSpeed" | "walkSpeed" | "runSpeed" | "rideSprintSpeed" | "transportSpeed"
  | "swimSpeed" | "swimDashSpeed" | "flightBaseSpeed" | "flightBaseSprint"
  | "flySpeedOverride" | "flySprintSpeedOverride";
interface SortOption {
  value: SortKey;
  label: string;
  direction?: "asc" | "desc";
  get?: (pal: PalRecord) => number | undefined;
}
const isFlight = (pal: PalRecord) => pal.movement.type === "fly" || pal.movement.type === "flyAndLanding";
const usable = (value: number | undefined) => value !== undefined && value >= 0 ? value : undefined;
const defaultSort: SortOption = { value: "dex", label: "图鉴编号（低→高）" };
const sortOptions: readonly SortOption[] = [
  defaultSort,
  { value: "hp", label: "生命（高→低）", get: (pal) => pal.stats.hp },
  { value: "attack", label: "攻击（高→低）", get: (pal) => pal.stats.attack },
  { value: "defense", label: "防御（高→低）", get: (pal) => pal.stats.defense },
  { value: "stamina", label: "体力（高→低）", get: (pal) => pal.stats.stamina },
  { value: "maleProbability", label: "雄性概率（高→低）", get: (pal) => pal.maleProbability },
  { value: "breedingPower", label: "配种力（低→高）", direction: "asc", get: (pal) => pal.breedingPower },
  { value: "slowWalkSpeed", label: "慢走参数（高→低）", get: (pal) => usable(pal.movement.slowWalkSpeed) },
  { value: "walkSpeed", label: "行走参数（高→低）", get: (pal) => usable(pal.movement.walkSpeed) },
  { value: "runSpeed", label: "奔跑参数（高→低）", get: (pal) => usable(pal.movement.runSpeed) },
  { value: "rideSprintSpeed", label: "乘骑冲刺参数（高→低）", get: (pal) => usable(pal.movement.rideSprintSpeed) },
  { value: "transportSpeed", label: "搬运参数（高→低）", get: (pal) => usable(pal.movement.transportSpeed) },
  { value: "swimSpeed", label: "游泳参数（高→低）", get: (pal) => usable(pal.movement.swimSpeed) },
  { value: "swimDashSpeed", label: "游泳冲刺参数（高→低）", get: (pal) => usable(pal.movement.swimDashSpeed) },
  { value: "flightBaseSpeed", label: "飞行奔跑基准（高→低）", get: (pal) => isFlight(pal) ? usable(pal.movement.runSpeed) : undefined },
  { value: "flightBaseSprint", label: "飞行冲刺基准（高→低）", get: (pal) => isFlight(pal) ? usable(pal.movement.rideSprintSpeed) : undefined },
  { value: "flySpeedOverride", label: "飞行覆盖值（高→低）", get: (pal) => usable(pal.movement.flySpeedOverride) },
  { value: "flySprintSpeedOverride", label: "飞行冲刺覆盖值（高→低）", get: (pal) => usable(pal.movement.flySprintSpeedOverride) },
];
const sortKey = ref<SortKey>("dex");
const selectedSort = computed<SortOption>(() => sortOptions.find((option) => option.value === sortKey.value) ?? defaultSort);
const quickStats = [["hp", "生命"], ["attack", "攻击"], ["defense", "防御"], ["stamina", "体力"], ["runSpeed", "奔跑"]] as const;
const quickStatValue = (pal: PalRecord, key: typeof quickStats[number][0]) =>
  key === "runSpeed" ? pal.movement.runSpeed : pal.stats[key];
const formatSortValue = (pal: PalRecord) => {
  const value = selectedSort.value.get?.(pal);
  if (value === undefined) return "—";
  return selectedSort.value.value === "maleProbability" ? `${value}%` : String(value);
};

const elementOptions = computed(() => [...new Set(visiblePals.value.flatMap((pal) => pal.elements))].sort());
const workOptions = computed(() => [...new Set(visiblePals.value.flatMap((pal) => Object.keys(pal.workSuitability)))].sort());
const filteredPals = computed(() => visiblePals.value.filter((pal) => {
  if (element.value && !pal.elements.includes(element.value)) return false;
  if (work.value && !(work.value in pal.workSuitability)) return false;
  if (variant.value === "base" && pal.variant) return false;
  if (variant.value === "variant" && !pal.variant) return false;
  return palMatchesSearch(pal, query.value);
}).sort((a, b) => {
  const workDifference = work.value
    ? (b.workSuitability[work.value] ?? 0) - (a.workSuitability[work.value] ?? 0)
    : 0;
  if (workDifference) return workDifference;
  const option = selectedSort.value;
  if (option.get) {
    const aValue = option.get(a);
    const bValue = option.get(b);
    if (aValue === undefined && bValue !== undefined) return 1;
    if (aValue !== undefined && bValue === undefined) return -1;
    if (aValue !== undefined && bValue !== undefined && aValue !== bValue)
      return option.direction === "asc" ? aValue - bValue : bValue - aValue;
  }
  return a.dexNo - b.dexNo || Number(a.variant) - Number(b.variant) || a.id.localeCompare(b.id, "en");
}));

function closeDetail() {
  const palId = String(router.currentRoute.value.params.id ?? "");
  document.querySelector<HTMLElement>(`.paldex-card[data-pal-id="${CSS.escape(palId)}"]`)?.focus();
  void router.replace("/paldex");
}
</script>

<template>
  <main class="page-shell">
    <PageIntro eyebrow="图鉴" title="帕鲁图鉴" description="按名称、编号、属性或工作适应性筛选帕鲁。" />
    <DataState :is-loading :error @retry="load">
      <section class="filter-bar filter-bar--paldex" aria-label="筛选图鉴">
        <label class="field filter-search"><span class="field__label">搜索图鉴</span><input v-model="query" type="search" placeholder="中文 / 拼音首字母 / English / 编号 / ID" /></label>
        <label class="field field--compact"><span class="field__label">属性</span><select v-model="element"><option value="">全部属性</option><option v-for="item in elementOptions" :key="item" :value="item">{{ elementName(item) }}</option></select></label>
        <label class="field field--compact"><span class="field__label">工作</span><select v-model="work"><option value="">全部工作</option><option v-for="item in workOptions" :key="item" :value="item">{{ workName(item) }}</option></select></label>
        <label class="field field--compact"><span class="field__label">种类</span><select v-model="variant"><option value="all">本体与亚种</option><option value="base">仅本体</option><option value="variant">仅亚种</option></select></label>
        <label class="field field--compact"><span class="field__label">排序</span><select v-model="sortKey"><option v-for="option in sortOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
      </section>
      <p class="result-note">找到 {{ filteredPals.length }} 种帕鲁 · {{ work ? `${workName(work)}等级优先 · ` : "" }}{{ selectedSort.label }}</p>
      <ul class="paldex-grid">
        <li v-for="pal in filteredPals" :key="pal.id">
          <RouterLink
            :to="`/paldex/${encodeURIComponent(pal.id)}`"
            class="paldex-card"
            :data-pal-id="pal.id"
            :aria-label="`${pal.names.zh} ${formatDex(pal)}${selfBreedOnlyIds.has(pal.id) ? '，仅可同种自交' : ''}，打开详细图鉴`"
            :aria-describedby="`paldex-preview-${pal.id}`"
          >
            <div class="paldex-card__art"><PalIcon :pal size="large" /></div>
            <div class="paldex-card__body">
              <div class="paldex-card__identity">
                <div><h2>{{ pal.names.zh }}</h2><p>{{ pal.names.en }}</p></div>
                <span class="dex-stamp">No. {{ formatDex(pal).slice(1) }}</span>
              </div>
              <div class="tag-row"><span v-for="item in pal.elements" :key="item" class="tag element-tag" :class="`element-tag--${item.toLowerCase()}`">{{ elementName(item) }}</span><span v-if="pal.variant" class="tag tag--coral">亚种</span><span v-if="selfBreedOnlyIds.has(pal.id)" class="self-breed-badge" title="配种时只能由同种雄性与雌性帕鲁产出">仅可自交</span></div>
              <div v-if="sortKey !== 'dex'" class="paldex-card__sort-value"><span>{{ selectedSort.label.replace(/（.*$/, "") }}</span><strong>{{ formatSortValue(pal) }}</strong></div>
              <div class="paldex-card__work">
                <span class="paldex-card__work-label">工作适应性</span>
                <ul v-if="Object.keys(pal.workSuitability).length" class="paldex-card__work-list"><li v-for="(level, item) in pal.workSuitability" :key="item"><span>{{ workName(item) }}</span><strong>Lv.{{ level }}</strong></li></ul>
                <span v-else class="paldex-card__work-empty">无据点工作</span>
              </div>
            </div>
            <div :id="`paldex-preview-${pal.id}`" class="paldex-preview" role="tooltip">
              <div class="paldex-preview__head"><strong>{{ formatDex(pal) }} · {{ pal.names.zh }}</strong><span :class="{ 'self-breed-badge': selfBreedOnlyIds.has(pal.id) }">{{ selfBreedOnlyIds.has(pal.id) ? "仅可自交" : "点击查看详细" }}</span></div>
              <span class="paldex-preview__label">基础数值</span>
              <dl class="paldex-preview__stats"><div v-for="([key, label]) in quickStats" :key="key"><dt>{{ label }}</dt><dd>{{ quickStatValue(pal, key) }}</dd></div></dl>
              <span class="paldex-preview__label">工作等级</span>
              <ul v-if="Object.keys(pal.workSuitability).length" class="paldex-preview__work"><li v-for="(level, item) in pal.workSuitability" :key="item"><span>{{ workName(item) }}</span><strong>Lv.{{ level }}</strong></li></ul>
              <span v-else class="paldex-preview__empty">无据点工作</span>
            </div>
          </RouterLink>
        </li>
      </ul>
      <div v-if="!filteredPals.length" class="empty-state"><span aria-hidden="true">⌕</span><p>没有匹配项。</p></div>
    </DataState>
    <RouterView v-slot="{ Component }"><component :is="Component" @close="closeDetail" /></RouterView>
  </main>
</template>
