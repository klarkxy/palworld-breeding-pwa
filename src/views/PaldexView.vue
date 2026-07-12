<script setup lang="ts">
import { computed, ref } from "vue";
import DataState from "@/components/DataState.vue";
import PageIntro from "@/components/PageIntro.vue";
import PalIcon from "@/components/PalIcon.vue";
import { elementName, formatDex, palMatchesSearch, usePalData, workName } from "@/composables/usePalData";

const { visiblePals, isLoading, error, load } = usePalData();
const query = ref("");
const element = ref("");
const work = ref("");
const variant = ref<"all" | "base" | "variant">("all");

const elementOptions = computed(() => [...new Set(visiblePals.value.flatMap((pal) => pal.elements))].sort());
const workOptions = computed(() => [...new Set(visiblePals.value.flatMap((pal) => Object.keys(pal.workSuitability)))].sort());
const filteredPals = computed(() => visiblePals.value.filter((pal) => {
  if (element.value && !pal.elements.includes(element.value)) return false;
  if (work.value && !(work.value in pal.workSuitability)) return false;
  if (variant.value === "base" && pal.variant) return false;
  if (variant.value === "variant" && !pal.variant) return false;
  return palMatchesSearch(pal, query.value);
}).sort((a, b) =>
  (work.value ? (b.workSuitability[work.value] ?? 0) - (a.workSuitability[work.value] ?? 0) : 0) ||
  a.dexNo - b.dexNo || Number(a.variant) - Number(b.variant) || a.id.localeCompare(b.id, "en")));
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
      </section>
      <p class="result-note">找到 {{ filteredPals.length }} 种帕鲁</p>
      <ul class="paldex-grid">
        <li v-for="pal in filteredPals" :key="pal.id">
          <RouterLink :to="`/paldex/${encodeURIComponent(pal.id)}`" class="paldex-card">
            <div class="paldex-card__art"><PalIcon :pal size="large" /><span class="dex-stamp">{{ formatDex(pal) }}</span></div>
            <div class="paldex-card__body">
              <h2>{{ pal.names.zh }}</h2><p>{{ pal.names.en }}</p>
              <div class="tag-row"><span v-for="item in pal.elements" :key="item" class="tag">{{ elementName(item) }}</span><span v-if="pal.variant" class="tag tag--coral">亚种</span></div>
            </div>
            <span class="card-arrow" aria-hidden="true">↗</span>
          </RouterLink>
        </li>
      </ul>
      <div v-if="!filteredPals.length" class="empty-state"><span aria-hidden="true">⌕</span><p>没有匹配项。</p></div>
    </DataState>
  </main>
</template>
