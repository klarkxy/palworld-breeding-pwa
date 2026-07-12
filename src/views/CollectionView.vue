<script setup lang="ts">
import { computed, watch } from "vue";
import { storeToRefs } from "pinia";
import { NCheckbox, NEmpty, NInput, NRadioButton, NRadioGroup } from "naive-ui";
import { useRoute } from "vue-router";
import DataState from "@/components/DataState.vue";
import PageIntro from "@/components/PageIntro.vue";
import PalIcon from "@/components/PalIcon.vue";
import { formatDex, palMatchesSearch } from "@/composables/usePalData";
import { useCollectionStore } from "@/stores/collection";
import { usePalDataStore } from "@/stores/palData";

const palData = usePalDataStore();
const collection = useCollectionStore();
const route = useRoute();
const { visiblePals, isLoading, error } = storeToRefs(palData);
const { entries, cleanedCount, query, view } = storeToRefs(collection);
const { load } = palData;
const { setOwned } = collection;

const ownedIds = computed(() => new Set(entries.value.map((entry) => entry.palId)));
const filteredPals = computed(() => visiblePals.value.filter((pal) => {
  if (view.value === "owned" && !ownedIds.value.has(pal.id)) return false;
  return palMatchesSearch(pal, query.value);
}));

watch([() => route.query, () => visiblePals.value.length], ([routeQuery, palCount]) => {
  if (palCount) collection.applyRoute(routeQuery);
}, { immediate: true });
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
        <label class="field filter-search"><span class="field__label">搜索帕鲁</span><NInput v-model:value="query" class="field-control" clearable size="large" placeholder="中文 / 拼音首字母 / English / 编号 / ID" :input-props="{ type: 'search', 'aria-label': '搜索帕鲁' }" /></label>
        <NRadioGroup v-model:value="view" class="mini-tabs" name="collection-view" aria-label="库存筛选">
          <NRadioButton class="mini-tabs__option" value="all">全部</NRadioButton>
          <NRadioButton class="mini-tabs__option" value="owned">已记录</NRadioButton>
        </NRadioGroup>
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
            <NCheckbox class="owned-toggle" :class="{ 'owned-toggle--checked': ownedIds.has(pal.id) }" :checked="ownedIds.has(pal.id)" @update:checked="setOwned(pal.id, $event)"><span class="sr-only">{{ pal.names.zh }}</span>已拥有</NCheckbox>
          </fieldset>
        </li>
      </ul>
      <NEmpty v-if="!filteredPals.length" class="empty-state" description="没有匹配的帕鲁。" />
    </DataState>
  </main>
</template>
