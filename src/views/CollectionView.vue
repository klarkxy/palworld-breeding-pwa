<script setup lang="ts">
import { computed, ref } from "vue";
import DataState from "@/components/DataState.vue";
import PageIntro from "@/components/PageIntro.vue";
import PalIcon from "@/components/PalIcon.vue";
import { useCollection } from "@/composables/useCollection";
import { formatDex, usePalData } from "@/composables/usePalData";

const { visiblePals, isLoading, error, load } = usePalData();
const { entries, cleanedCount, setSex } = useCollection();
const query = ref("");
const view = ref<"all" | "owned">("all");

const ownedById = computed(() => new Map(entries.value.map((entry) => [entry.palId, entry])));
const filteredPals = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase();
  return visiblePals.value.filter((pal) => {
    if (view.value === "owned" && !ownedById.value.has(pal.id)) return false;
    return !needle || [pal.names.zh, pal.names.en, pal.id, String(pal.dexNo)]
      .some((value) => value.toLocaleLowerCase().includes(needle));
  });
});
const sexCounts = computed(() => ({
  male: entries.value.filter((entry) => entry.male).length,
  female: entries.value.filter((entry) => entry.female).length,
}));
</script>

<template>
  <main class="page-shell">
    <PageIntro eyebrow="我的帕鲁 / Field notes" title="给库存标上性别" description="这里只记录物种和已有性别；路径规划会自动使用这份清单，不需要填写数量。" />
    <DataState :is-loading :error @retry="load">
      <p v-if="cleanedCount" class="notice">数据已升级，自动移除了 {{ cleanedCount }} 条失效记录。</p>
      <section class="collection-summary" aria-label="库存概览">
        <div><strong>{{ entries.length }}</strong><span>种帕鲁</span></div>
        <div><strong>{{ sexCounts.male }}</strong><span>雄性记录</span></div>
        <div><strong>{{ sexCounts.female }}</strong><span>雌性记录</span></div>
        <RouterLink class="button button--primary" to="/paths">用库存规划路线</RouterLink>
      </section>

      <div class="filter-bar">
        <label class="field filter-search"><span class="field__label">搜索帕鲁</span><input v-model="query" type="search" placeholder="中文、English、编号或 ID" /></label>
        <div class="mini-tabs" aria-label="库存筛选">
          <button type="button" :aria-pressed="view === 'all'" :class="{ active: view === 'all' }" @click="view = 'all'">全部</button>
          <button type="button" :aria-pressed="view === 'owned'" :class="{ active: view === 'owned' }" @click="view = 'owned'">已记录</button>
        </div>
      </div>

      <p class="result-note">显示 {{ filteredPals.length }} 种；勾选会立即保存在本机。</p>
      <ul class="collection-grid">
        <li v-for="pal in filteredPals" :key="pal.id" class="collection-card" :class="{ 'collection-card--owned': ownedById.has(pal.id) }">
          <RouterLink :to="`/paldex/${encodeURIComponent(pal.id)}`" class="collection-card__identity">
            <PalIcon :pal />
            <span><strong>{{ pal.names.zh }}</strong><small>{{ formatDex(pal) }} · {{ pal.names.en }}</small></span>
          </RouterLink>
          <fieldset>
            <legend class="sr-only">{{ pal.names.zh }} 已有性别</legend>
            <label class="sex-toggle sex-toggle--male"><input type="checkbox" :checked="ownedById.get(pal.id)?.male ?? false" @change="setSex(pal.id, 'male', ($event.target as HTMLInputElement).checked)" /><span>♂ 雄</span></label>
            <label class="sex-toggle sex-toggle--female"><input type="checkbox" :checked="ownedById.get(pal.id)?.female ?? false" @change="setSex(pal.id, 'female', ($event.target as HTMLInputElement).checked)" /><span>♀ 雌</span></label>
          </fieldset>
        </li>
      </ul>
      <div v-if="!filteredPals.length" class="empty-state"><span aria-hidden="true">⌕</span><p>没有匹配的帕鲁，换一个关键词试试。</p></div>
    </DataState>
  </main>
</template>
