<script setup lang="ts">
import { computed, nextTick, watch } from "vue";
import { storeToRefs } from "pinia";
import { NEmpty, NInput, NSelect } from "naive-ui";
import type { SelectOption } from "naive-ui";
import { useRoute, useRouter } from "vue-router";
import DataState from "@/components/DataState.vue";
import PageIntro from "@/components/PageIntro.vue";
import PalIcon from "@/components/PalIcon.vue";
import ShareButton from "@/components/ShareButton.vue";
import { elementIcon, elementName, formatDex, palMatchesSearch, workIcon, workName } from "@/composables/usePalData";
import type { PalRecord } from "@/core";
import { isSnapshotQuery, queriesEqual, snapshotQuery } from "@/routing/queryState";
import { useCollectionStore } from "@/stores/collection";
import { usePalDataStore } from "@/stores/palData";
import { usePaldexStore } from "@/stores/paldex";
import type { PaldexSortKey as SortKey } from "@/stores/paldex";

const router = useRouter();
const route = useRoute();
const palData = usePalDataStore();
const collection = useCollectionStore();
const paldex = usePaldexStore();
const { visiblePals, partnerSkillById, selfBreedOnlyIds, isLoading, error } = storeToRefs(palData);
const { entries, cleanedCount, view: ownership } = storeToRefs(collection);
const { query, element, work, movement, sortKey, selectedStars } = storeToRefs(paldex);
const { load } = palData;
const { setOwned } = collection;
const ownedIds = computed(() => new Set(entries.value.map((entry) => entry.palId)));

const routePalId = computed(() => {
  const value = route.params.id;
  return typeof value === "string" ? value : value?.[0] ?? "";
});

let routeHydrated = false;
let applyingRoute = false;

function currentRouteQuery(includeStars = route.name === "paldex-detail") {
  return snapshotQuery({
    q: query.value || undefined,
    element: element.value || undefined,
    work: work.value || undefined,
    movement: movement.value === "all" ? undefined : movement.value,
    sort: sortKey.value === "dex" ? undefined : sortKey.value,
    view: ownership.value === "all" ? undefined : ownership.value,
    stars: includeStars && selectedStars.value === 4 ? "4" : undefined,
  });
}

function syncRoute() {
  if (!routeHydrated || applyingRoute
    || (route.name !== "paldex" && route.name !== "paldex-detail")) return;
  const nextQuery = currentRouteQuery();
  if (!queriesEqual(route.query, nextQuery)) void router.replace({ query: nextQuery });
}

watch(
  [() => route.name, () => route.query, () => visiblePals.value.length],
  ([routeName, routeQuery]) => {
    if (routeName !== "paldex" && routeName !== "paldex-detail") return;
    const snapshot = isSnapshotQuery(routeQuery);
    if (snapshot
      && queriesEqual(routeQuery, currentRouteQuery(routeName === "paldex-detail"))
      && (routeName === "paldex-detail" || selectedStars.value === 0)) {
      routeHydrated = true;
      return;
    }
    applyingRoute = true;
    try {
      if (snapshot) {
        paldex.reset();
        ownership.value = "all";
      }
      paldex.applyRoute(routeQuery);
      if (snapshot && routeName !== "paldex-detail") selectedStars.value = 0;
      collection.applyRoute(routeQuery);
    } finally {
      applyingRoute = false;
    }
    routeHydrated = true;
    syncRoute();
  },
  { immediate: true, flush: "sync" },
);

watch(
  [query, element, work, movement, sortKey, ownership, selectedStars],
  syncRoute,
  { flush: "sync" },
);

watch(
  [() => route.name, routePalId, () => visiblePals.value.length],
  ([routeName, palId, palCount]) => {
    if (routeName !== "paldex-detail" || !palCount) return;
    if (palId && visiblePals.value.some((pal) => pal.id === palId)) return;
    void router.replace({ name: "paldex", query: currentRouteQuery(false) });
  },
  { immediate: true, flush: "post" },
);

interface SortOption extends SelectOption {
  value: SortKey;
  label: string;
  direction?: "asc" | "desc";
  get?: (pal: PalRecord) => number | undefined;
}
const isFlight = (pal: PalRecord) => pal.movement.type === "fly" || pal.movement.type === "flyAndLanding";
const usable = (value: number | undefined) => value !== undefined && value >= 0 ? value : undefined;
type SprintMode = "ground" | "fly" | "swim";
function sprintMode(pal: PalRecord): SprintMode {
  if (movement.value === "ground") return "ground";
  if (movement.value === "fly" || movement.value === "flyAndLanding") return "fly";
  if (movement.value === "swim") return "swim";
  if (pal.movement.type === "swim") return "swim";
  return isFlight(pal) ? "fly" : "ground";
}
function sprintMetric(pal: PalRecord) {
  const mode = sprintMode(pal);
  if (mode === "swim")
    return { label: "游泳冲刺参数", value: usable(pal.movement.swimDashSpeed) };
  if (mode === "fly")
    return {
      label: "飞行冲刺参数",
      value: usable(pal.movement.flySprintSpeedOverride) ?? usable(pal.movement.rideSprintSpeed),
    };
  return { label: "陆地冲刺参数", value: usable(pal.movement.rideSprintSpeed) };
}
const defaultSort: SortOption = { value: "dex", label: "图鉴编号" };
const sortOptions: SortOption[] = [
  defaultSort,
  { value: "hp", label: "生命", get: (pal) => pal.stats.hp },
  { value: "attack", label: "攻击", get: (pal) => pal.stats.attack },
  { value: "defense", label: "防御", get: (pal) => pal.stats.defense },
  { value: "stamina", label: "体力", get: (pal) => pal.stats.stamina },
  { value: "maleProbability", label: "雄性概率", get: (pal) => pal.maleProbability },
  { value: "breedingPower", label: "配种力", direction: "asc", get: (pal) => pal.breedingPower },
  { value: "slowWalkSpeed", label: "慢走参数", get: (pal) => usable(pal.movement.slowWalkSpeed) },
  { value: "walkSpeed", label: "行走参数", get: (pal) => usable(pal.movement.walkSpeed) },
  { value: "runSpeed", label: "奔跑参数", get: (pal) => usable(pal.movement.runSpeed) },
  { value: "rideSprintSpeed", label: "按种类冲刺参数", get: (pal) => sprintMetric(pal).value },
  { value: "transportSpeed", label: "搬运参数", get: (pal) => usable(pal.movement.transportSpeed) },
  { value: "swimSpeed", label: "游泳参数", get: (pal) => usable(pal.movement.swimSpeed) },
  { value: "swimDashSpeed", label: "游泳冲刺参数", get: (pal) => usable(pal.movement.swimDashSpeed) },
  { value: "flightBaseSpeed", label: "飞行奔跑基准", get: (pal) => isFlight(pal) ? usable(pal.movement.runSpeed) : undefined },
  { value: "flightBaseSprint", label: "飞行冲刺基准", get: (pal) => isFlight(pal) ? usable(pal.movement.rideSprintSpeed) : undefined },
  { value: "flySpeedOverride", label: "飞行覆盖值", get: (pal) => usable(pal.movement.flySpeedOverride) },
  { value: "flySprintSpeedOverride", label: "飞行冲刺覆盖值", get: (pal) => usable(pal.movement.flySprintSpeedOverride) },
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
const sortLabelForPal = (pal: PalRecord) =>
  sortKey.value === "rideSprintSpeed" ? sprintMetric(pal).label : selectedSort.value.label;
const resultSortLabel = computed(() => {
  if (sortKey.value !== "rideSprintSpeed") return selectedSort.value.label;
  if (movement.value === "ground") return "陆地冲刺参数";
  if (movement.value === "swim") return "游泳冲刺参数";
  if (movement.value === "fly" || movement.value === "flyAndLanding") return "飞行冲刺参数";
  return "按种类冲刺参数";
});
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
  { label: "🌈 全部属性", value: "" },
  ...elementOptions.value.map((value) => ({ label: `${elementIcon(value)} ${elementName(value)}`, value })),
]);
const workSelectOptions = computed(() => [
  { label: "🧰 全部工作", value: "" },
  ...workOptions.value.map((value) => ({ label: `${workIcon(value)} ${workName(value)}`, value })),
]);
const movementOptions = [
  { label: "全体", value: "all" },
  { label: "陆地", value: "ground" },
  { label: "飞行", value: "fly" },
  { label: "飞行兼落地", value: "flyAndLanding" },
  { label: "游泳", value: "swim" },
];
const ownershipOptions = [
  { label: "全部帕鲁", value: "all" },
  { label: "仅已拥有", value: "owned" },
];
const filteredPals = computed(() => visiblePals.value.filter((pal) => {
  if (ownership.value === "owned" && !ownedIds.value.has(pal.id)) return false;
  if (element.value && !pal.elements.includes(element.value)) return false;
  if (work.value && !(work.value in pal.workSuitability)) return false;
  if (movement.value === "ground" && pal.movement.type !== "ground" && pal.movement.type !== "flyAndLanding") return false;
  if (movement.value === "fly" && !isFlight(pal)) return false;
  if (movement.value === "flyAndLanding" && pal.movement.type !== "flyAndLanding") return false;
  if (movement.value === "swim" && pal.movement.type !== "swim") return false;
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

async function focusPaldexCard(palId = "") {
  await nextTick();
  const card = palId
    ? document.querySelector<HTMLElement>(`.paldex-card[data-pal-id="${CSS.escape(palId)}"]`)
    : undefined;
  (card ?? document.querySelector<HTMLElement>('[aria-label="搜索图鉴"]'))?.focus();
}

async function toggleOwned(palId: string, wasOwned: boolean) {
  const visibleIds = filteredPals.value.map((pal) => pal.id);
  const index = visibleIds.indexOf(palId);
  const adjacentId = visibleIds[index + 1] ?? visibleIds[index - 1] ?? "";
  setOwned(palId, !wasOwned);
  if (wasOwned && ownership.value === "owned") await focusPaldexCard(adjacentId);
}

async function closeDetail() {
  if (route.name !== "paldex-detail") return;
  const palId = routePalId.value;
  await router.replace({ name: "paldex", query: currentRouteQuery(false) });
  await focusPaldexCard(palId);
}
</script>

<template>
  <main class="page-shell">
    <PageIntro eyebrow="图鉴" title="帕鲁图鉴" description="筛选、排序，并直接标记已经拥有的帕鲁。">
      <template #actions>
        <ShareButton
          :to="{ name: 'paldex', query: currentRouteQuery(false) }"
          :disabled="!visiblePals.length"
          title="帕鲁图鉴 · 帕鲁孵化实验室"
          text="查看这份帕鲁图鉴筛选结果"
        />
      </template>
    </PageIntro>
    <DataState :is-loading :error @retry="load">
      <p v-if="cleanedCount" class="notice">数据已升级，自动移除了 {{ cleanedCount }} 条失效记录。</p>
      <section class="filter-bar filter-bar--paldex" aria-label="筛选图鉴">
        <label class="field filter-search"><span class="field__label">搜索图鉴</span><NInput v-model:value="query" class="field-control" clearable size="large" placeholder="中文 / 拼音首字母 / English / 编号 / ID" :input-props="{ type: 'search', 'aria-label': '搜索图鉴' }" /></label>
        <label class="field field--compact"><span class="field__label">属性</span><NSelect v-model:value="element" class="field-control" :options="elementSelectOptions" :fallback-option="false" filterable size="large" :input-props="{ 'aria-label': '属性' }" /></label>
        <label class="field field--compact"><span class="field__label">工作</span><NSelect v-model:value="work" class="field-control" :options="workSelectOptions" :fallback-option="false" filterable size="large" :input-props="{ 'aria-label': '工作' }" /></label>
        <label class="field field--compact filter-movement"><span class="field__label">种类</span><NSelect v-model:value="movement" class="field-control" :options="movementOptions" :fallback-option="false" :consistent-menu-width="false" size="large" :input-props="{ 'aria-label': '种类' }" /></label>
        <label class="field field--compact filter-sort"><span class="field__label">排序</span><NSelect v-model:value="sortKey" class="field-control" :options="sortOptions" :fallback-option="false" :consistent-menu-width="false" filterable size="large" :input-props="{ 'aria-label': '排序' }" /></label>
        <label class="field field--compact"><span class="field__label">拥有状态</span><NSelect v-model:value="ownership" class="field-control" :options="ownershipOptions" :fallback-option="false" size="large" :input-props="{ 'aria-label': '拥有状态' }" /></label>
      </section>
      <p class="result-note">找到 {{ filteredPals.length }} 种{{ ownership === "owned" ? "已拥有" : "" }}帕鲁 · 已拥有 {{ entries.length }} 种 · {{ work ? `${workName(work)}等级优先 · ` : "" }}{{ resultSortLabel }}</p>
      <ul class="paldex-grid">
        <li v-for="pal in filteredPals" :key="pal.id" class="paldex-item" :class="{ 'paldex-item--owned': ownedIds.has(pal.id) }">
          <RouterLink
            :to="{ name: 'paldex-detail', params: { id: pal.id }, query: currentRouteQuery(true) }"
            class="paldex-card"
            :data-pal-id="pal.id"
            :aria-label="`${pal.names.zh} ${formatDex(pal)}${ownedIds.has(pal.id) ? '，已拥有' : ''}${selfBreedOnlyIds.has(pal.id) ? '，仅可同种自交' : ''}${mountTechnologyLabel(pal) ? `，${mountMovementTypeLabel(pal)}，${mountTechnologyLabel(pal)}` : ''}，打开详细图鉴`"
            :aria-describedby="`paldex-preview-${pal.id}`"
          >
            <div class="paldex-card__art"><PalIcon :pal size="large" /></div>
            <div class="paldex-card__body">
              <div class="paldex-card__identity">
                <div><h2>{{ pal.names.zh }}</h2><p>{{ pal.names.en }}</p></div>
                <span class="dex-stamp">No. {{ formatDex(pal).slice(1) }}</span>
              </div>
              <div class="tag-row"><span v-for="item in pal.elements" :key="item" class="tag element-tag" :class="`element-tag--${item.toLowerCase()}`">{{ elementName(item) }}</span><span v-if="pal.variant" class="tag tag--coral">亚种</span><span v-if="mountTechnologyLabel(pal)" class="tag mount-type-badge">{{ mountMovementTypeLabel(pal) }}</span><span v-if="mountTechnologyLabel(pal)" class="tag mount-tech-badge">{{ mountTechnologyLabel(pal) }}</span><span v-if="selfBreedOnlyIds.has(pal.id)" class="self-breed-badge" title="配种时只能由同种帕鲁产出">仅可自交</span></div>
              <div v-if="sortKey !== 'dex'" class="paldex-card__sort-value"><span>{{ sortLabelForPal(pal) }}</span><strong>{{ formatSortValue(pal) }}</strong></div>
              <div class="paldex-card__work">
                <span class="paldex-card__work-label">工作适应性</span>
                <ul v-if="Object.keys(pal.workSuitability).length" class="paldex-card__work-list"><li v-for="(level, item) in pal.workSuitability" :key="item" :aria-label="`${workName(item)} Lv.${level}`" :title="`${workName(item)} Lv.${level}`"><span class="work-icon" aria-hidden="true">{{ workIcon(item) }}</span><strong>Lv.{{ level }}</strong></li></ul>
                <span v-else class="paldex-card__work-empty">无据点工作</span>
              </div>
            </div>
            <div :id="`paldex-preview-${pal.id}`" class="paldex-preview" role="tooltip">
              <div class="paldex-preview__head"><strong>{{ formatDex(pal) }} · {{ pal.names.zh }}</strong><span :class="{ 'self-breed-badge': selfBreedOnlyIds.has(pal.id) }">{{ selfBreedOnlyIds.has(pal.id) ? "仅可自交" : "点击查看详细" }}</span></div>
              <span class="paldex-preview__label">基础数值</span>
              <dl class="paldex-preview__stats"><div v-for="([key, label]) in quickStats" :key="key"><dt>{{ label }}</dt><dd>{{ quickStatValue(pal, key) }}</dd></div></dl>
              <span class="paldex-preview__label">工作等级</span>
              <ul v-if="Object.keys(pal.workSuitability).length" class="paldex-preview__work"><li v-for="(level, item) in pal.workSuitability" :key="item" :aria-label="`${workName(item)} Lv.${level}`" :title="`${workName(item)} Lv.${level}`"><span class="work-icon" aria-hidden="true">{{ workIcon(item) }}</span><strong>Lv.{{ level }}</strong></li></ul>
              <span v-else class="paldex-preview__empty">无据点工作</span>
            </div>
          </RouterLink>
          <button
            type="button"
            class="ownership-badge"
            :class="{ 'ownership-badge--owned': ownedIds.has(pal.id) }"
            :aria-label="ownedIds.has(pal.id) ? `取消标记${pal.names.zh}为已拥有` : `标记${pal.names.zh}为已拥有`"
            :title="ownedIds.has(pal.id) ? '取消已拥有标记' : '标记为已拥有'"
            @click="toggleOwned(pal.id, ownedIds.has(pal.id))"
          ><span aria-hidden="true">{{ ownedIds.has(pal.id) ? "✓" : "+" }}</span>{{ ownedIds.has(pal.id) ? "已拥有" : "标记拥有" }}</button>
        </li>
      </ul>
      <NEmpty v-if="!filteredPals.length" class="empty-state" description="没有匹配项。" />
    </DataState>
    <RouterView v-slot="{ Component }"><component :is="Component" :key="routePalId" @close="closeDetail" /></RouterView>
  </main>
</template>
