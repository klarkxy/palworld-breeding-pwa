<script setup lang="ts">
import { computed, ref } from "vue";
import DataState from "@/components/DataState.vue";
import PageIntro from "@/components/PageIntro.vue";
import PalIcon from "@/components/PalIcon.vue";
import { useCollection } from "@/composables/useCollection";
import { formatDex, palMatchesSearch, usePalData } from "@/composables/usePalData";

const { visiblePals, isLoading, error, load } = usePalData();
const { entries, cleanedCount, setOwned } = useCollection();
const query = ref("");
const view = ref<"all" | "owned">("all");

const ownedIds = computed(() => new Set(entries.value.map((entry) => entry.palId)));
const filteredPals = computed(() => visiblePals.value.filter((pal) => {
  if (view.value === "owned" && !ownedIds.value.has(pal.id)) return false;
  return palMatchesSearch(pal, query.value);
}));
</script>

<template>
  <main class="page-shell">
    <PageIntro eyebrow="我的帕鲁" title="库存管理" description="只记录拥有的物种；路径规划会自动使用这份清单。" />
    <DataState :is-loading :error @retry="load">
      <p v-if="cleanedCount" class="notice">数据已升级，自动移除了 {{ cleanedCount }} 条失效记录。</p>
      <section class="collection-summary" aria-label="库存概览">
        <div><strong>{{ entries.length }}</strong><span>种已拥有帕鲁</span></div>
        <RouterLink class="button button--primary" to="/paths">用库存规划路线</RouterLink>
      </section>

      <div class="filter-bar">
        <label class="field filter-search"><span class="field__label">搜索帕鲁</span><input v-model="query" type="search" placeholder="中文 / 拼音首字母 / English / 编号 / ID" /></label>
        <div class="mini-tabs" aria-label="库存筛选">
          <button type="button" :aria-pressed="view === 'all'" :class="{ active: view === 'all' }" @click="view = 'all'">全部</button>
          <button type="button" :aria-pressed="view === 'owned'" :class="{ active: view === 'owned' }" @click="view = 'owned'">已记录</button>
        </div>
      </div>

      <p class="result-note">显示 {{ filteredPals.length }} 种，勾选即保存。</p>
      <ul class="collection-grid">
        <li v-for="pal in filteredPals" :key="pal.id" class="collection-card" :class="{ 'collection-card--owned': ownedIds.has(pal.id) }">
          <RouterLink :to="`/paldex/${encodeURIComponent(pal.id)}`" class="collection-card__identity">
            <PalIcon :pal />
            <span><strong>{{ pal.names.zh }}</strong><small>{{ formatDex(pal) }} · {{ pal.names.en }}</small></span>
          </RouterLink>
          <fieldset>
            <legend class="sr-only">{{ pal.names.zh }}库存状态</legend>
            <label class="owned-toggle"><input type="checkbox" :aria-label="`${pal.names.zh}已拥有`" :checked="ownedIds.has(pal.id)" @change="setOwned(pal.id, ($event.target as HTMLInputElement).checked)" /><span>已拥有</span></label>
          </fieldset>
        </li>
      </ul>
      <div v-if="!filteredPals.length" class="empty-state"><span aria-hidden="true">⌕</span><p>没有匹配的帕鲁。</p></div>
    </DataState>
  </main>
</template>
