<script setup lang="ts">
import { computed, watch } from "vue";
import { storeToRefs } from "pinia";
import { NEmpty, NInput, NSelect } from "naive-ui";
import type { SelectOption } from "naive-ui";
import { useRoute, useRouter } from "vue-router";
import DataState from "@/components/DataState.vue";
import PageIntro from "@/components/PageIntro.vue";
import PalIcon from "@/components/PalIcon.vue";
import { elementName, formatDex, palMatchesSearch, workName } from "@/composables/usePalData";
import type { PalRecord } from "@/core";
import { usePalDataStore } from "@/stores/palData";
import { usePaldexStore } from "@/stores/paldex";
import type { PaldexSortKey as SortKey } from "@/stores/paldex";

const router = useRouter();
const route = useRoute();
const palData = usePalDataStore();
const paldex = usePaldexStore();
const { visiblePals, partnerSkillById, selfBreedOnlyIds, isLoading, error } = storeToRefs(palData);
const { query, element, work, variant, sortKey } = storeToRefs(paldex);
const { load } = palData;

watch([() => route.query, () => visiblePals.value.length], ([routeQuery, palCount]) => {
  if (palCount) paldex.applyRoute(routeQuery);
}, { immediate: true });
interface SortOption extends SelectOption {
  value: SortKey;
  label: string;
  direction?: "asc" | "desc";
  get?: (pal: PalRecord) => number | undefined;
}
const isFlight = (pal: PalRecord) => pal.movement.type === "fly" || pal.movement.type === "flyAndLanding";
const usable = (value: number | undefined) => value !== undefined && value >= 0 ? value : undefined;
const defaultSort: SortOption = { value: "dex", label: "图鉴编号（低→高）" };
const sortOptions: SortOption[] = [
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
const selectedSort = computed<SortOption>(() => sortOptions.find((option) => option.value === sortKey.value) ?? defaultSort);
const quickStats = [["hp", "生命"], ["attack", "攻击"], ["defense", "防御"], ["stamina", "体力"], ["runSpeed", "奔跑"]] as const;
const quickStatValue = (pal: PalRecord, key: typeof quickStats[number][0]) =>
  key === "runSpeed" ? pal.movement.runSpeed : pal.stats[key];
const formatSortValue = (pal: PalRecord) => {
  const value = selectedSort.value.get?.(pal);
  if (value === undefined) return "—";
  return selectedSort.value.value === "maleProbability" ? `${value}%` : String(value);
};
function mountTechnologyLabel(pal: PalRecord) {
  const description = pal.partnerSkillId ? partnerSkillById.value.get(pal.partnerSkillId)?.description : undefined;
  if (!description || !/可(?:骑|坐)在/.test(description)) return "";
  const level = description.match(/科技\s*(\d+)/)?.[1];
  return level ? `LV${level}` : "无科技条目";
}
const movementTypeLabels = { ground: "地面", fly: "飞行", flyAndLanding: "飞行兼落地", swim: "游泳" } as const;
const mountMovementTypeLabel = (pal: PalRecord) => pal.movement.type ? movementTypeLabels[pal.movement.type] : "乘骑";

const elementOptions = computed(() => [...new Set(visiblePals.value.flatMap((pal) => pal.elements))].sort());
const workOptions = computed(() => [...new Set(visiblePals.value.flatMap((pal) => Object.keys(pal.workSuitability)))].sort());
const elementSelectOptions = computed(() => [
  { label: "全部属性", value: "" },
  ...elementOptions.value.map((value) => ({ label: elementName(value), value })),
]);
const workSelectOptions = computed(() => [
  { label: "全部工作", value: "" },
  ...workOptions.value.map((value) => ({ label: workName(value), value })),
]);
const variantOptions = [
  { label: "本体与亚种", value: "all" },
  { label: "仅本体", value: "base" },
  { label: "仅亚种", value: "variant" },
];
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
        <label class="field filter-search"><span class="field__label">搜索图鉴</span><NInput v-model:value="query" class="field-control" clearable size="large" placeholder="中文 / 拼音首字母 / English / 编号 / ID" :input-props="{ type: 'search', 'aria-label': '搜索图鉴' }" /></label>
        <label class="field field--compact"><span class="field__label">属性</span><NSelect v-model:value="element" class="field-control" :options="elementSelectOptions" :fallback-option="false" filterable size="large" :input-props="{ 'aria-label': '属性' }" /></label>
        <label class="field field--compact"><span class="field__label">工作</span><NSelect v-model:value="work" class="field-control" :options="workSelectOptions" :fallback-option="false" filterable size="large" :input-props="{ 'aria-label': '工作' }" /></label>
        <label class="field field--compact"><span class="field__label">种类</span><NSelect v-model:value="variant" class="field-control" :options="variantOptions" :fallback-option="false" filterable size="large" :input-props="{ 'aria-label': '种类' }" /></label>
        <label class="field field--compact"><span class="field__label">排序</span><NSelect v-model:value="sortKey" class="field-control" :options="sortOptions" :fallback-option="false" filterable size="large" :input-props="{ 'aria-label': '排序' }" /></label>
      </section>
      <p class="result-note">找到 {{ filteredPals.length }} 种帕鲁 · {{ work ? `${workName(work)}等级优先 · ` : "" }}{{ selectedSort.label }}</p>
      <ul class="paldex-grid">
        <li v-for="pal in filteredPals" :key="pal.id">
          <RouterLink
            :to="`/paldex/${encodeURIComponent(pal.id)}`"
            class="paldex-card"
            :data-pal-id="pal.id"
            :aria-label="`${pal.names.zh} ${formatDex(pal)}${selfBreedOnlyIds.has(pal.id) ? '，仅可同种自交' : ''}${mountTechnologyLabel(pal) ? `，${mountMovementTypeLabel(pal)}，${mountTechnologyLabel(pal)}` : ''}，打开详细图鉴`"
            :aria-describedby="`paldex-preview-${pal.id}`"
          >
            <div class="paldex-card__art"><PalIcon :pal size="large" /></div>
            <div class="paldex-card__body">
              <div class="paldex-card__identity">
                <div><h2>{{ pal.names.zh }}</h2><p>{{ pal.names.en }}</p></div>
                <span class="dex-stamp">No. {{ formatDex(pal).slice(1) }}</span>
              </div>
              <div class="tag-row"><span v-for="item in pal.elements" :key="item" class="tag element-tag" :class="`element-tag--${item.toLowerCase()}`">{{ elementName(item) }}</span><span v-if="pal.variant" class="tag tag--coral">亚种</span><span v-if="mountTechnologyLabel(pal)" class="tag mount-type-badge">{{ mountMovementTypeLabel(pal) }}</span><span v-if="mountTechnologyLabel(pal)" class="tag mount-tech-badge">{{ mountTechnologyLabel(pal) }}</span><span v-if="selfBreedOnlyIds.has(pal.id)" class="self-breed-badge" title="配种时只能由同种帕鲁产出">仅可自交</span></div>
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
      <NEmpty v-if="!filteredPals.length" class="empty-state" description="没有匹配项。" />
    </DataState>
    <RouterView v-slot="{ Component }"><component :is="Component" :key="route.fullPath" @close="closeDetail" /></RouterView>
  </main>
</template>
