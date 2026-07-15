<script setup lang="ts">
import { computed, onMounted, ref, useId, watch } from "vue";
import { RouterLink } from "vue-router";
import ItemIcon from "@/components/ItemIcon.vue";
import { itemRarityLabel, itemRarityTone } from "@/core/itemFamilies";
import { snapshotQuery } from "@/routing/queryState";
import { useItemDataStore } from "@/stores/itemData";
import type { ItemRecord, PalDropSourceType, PalItemDropRecord } from "@/stores/itemData";
import {
  DROP_SOURCE_PREVIEW_LIMIT,
  formatDropPercent,
  formatDropQuantity,
  palDropLevelLabel,
  palDropSourceLabel,
} from "./itemDropSources";

defineOptions({ name: "PalItemDrops" });

const props = defineProps<{ palId: string }>();
const itemData = useItemDataStore();
const headingId = useId();
const showAll = ref(false);
const sourceOrder: Readonly<Record<PalDropSourceType, number>> = {
  normal: 0,
  alpha: 1,
  predator: 2,
};

const sortedDrops = computed(() => [...(itemData.palDropsByPal.get(props.palId) ?? [])]
  .sort((left, right) => {
    const leftItem = itemData.itemById.get(left.itemId);
    const rightItem = itemData.itemById.get(right.itemId);
    return sourceOrder[left.sourceType] - sourceOrder[right.sourceType]
      || left.level - right.level
      || (leftItem?.sortId ?? Number.MAX_SAFE_INTEGER) - (rightItem?.sortId ?? Number.MAX_SAFE_INTEGER)
      || itemName(leftItem, left.itemId).localeCompare(itemName(rightItem, right.itemId), "zh-CN")
      || right.baseChancePercent - left.baseChancePercent
      || left.slot - right.slot;
  }));

const visibleDrops = computed(() => showAll.value
  ? sortedDrops.value
  : sortedDrops.value.slice(0, DROP_SOURCE_PREVIEW_LIMIT));

const totalGroupCounts = computed(() => {
  const counts = new Map<string, number>();
  for (const drop of sortedDrops.value) {
    const key = [drop.sourceType, drop.level].join(":");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
});

const visibleGroups = computed(() => {
  const groups: Array<{
    key: string;
    sourceType: PalDropSourceType;
    level: number;
    totalCount: number;
    drops: PalItemDropRecord[];
  }> = [];
  for (const drop of visibleDrops.value) {
    const key = [drop.sourceType, drop.level].join(":");
    const current = groups.at(-1);
    if (!current || current.key !== key) {
      groups.push({
        key,
        sourceType: drop.sourceType,
        level: drop.level,
        totalCount: totalGroupCounts.value.get(key) ?? 1,
        drops: [drop],
      });
    } else {
      current.drops.push(drop);
    }
  }
  return groups;
});

watch(() => props.palId, () => {
  showAll.value = false;
});

onMounted(() => void itemData.load());

function itemName(item: ItemRecord | undefined, fallbackId: string) {
  return item?.names.zh || item?.names.en || fallbackId;
}

function itemSecondaryName(item: ItemRecord | undefined, fallbackId: string) {
  if (!item) return fallbackId;
  return item.names.en ? item.names.en + " · " + item.id : item.id;
}

function isBlueprint(item: ItemRecord | undefined) {
  return item?.typeA === "Blueprint" || item?.typeB === "Blueprint";
}

function itemDetailRoute(itemId: string) {
  return {
    name: "item-detail",
    params: { itemId },
    query: snapshotQuery({}),
  };
}

function dropKey(drop: PalItemDropRecord) {
  return [drop.rowId, drop.slot, drop.itemId].join(":");
}

function groupHeadingId(index: number) {
  return headingId + "-group-" + index;
}
</script>

<template>
  <section class="pal-item-drops" :aria-labelledby="headingId">
    <header class="pal-item-drops__heading">
      <div>
        <p class="eyebrow">战利品</p>
        <h2 :id="headingId">掉落道具</h2>
      </div>
      <span v-if="itemData.isLoaded" class="pal-item-drops__count">{{ sortedDrops.length }} 条记录</span>
    </header>

    <p class="pal-item-drops__intro">
      概率为游戏基础值；世界设置和服务器倍率可能改变实际结果。
    </p>

    <p v-if="itemData.isLoading && !itemData.isLoaded" class="pal-item-drops__state" role="status">
      正在加载掉落数据…
    </p>
    <p v-else-if="itemData.error && !itemData.isLoaded" class="pal-item-drops__state pal-item-drops__state--error" role="alert">
      {{ itemData.error }}
    </p>

    <template v-else>
      <section
        v-for="(group, groupIndex) in visibleGroups"
        :key="group.key"
        class="pal-item-drops__group"
        :aria-labelledby="groupHeadingId(groupIndex)"
      >
        <header class="pal-item-drops__group-heading">
          <h3 :id="groupHeadingId(groupIndex)">
            {{ palDropSourceLabel(group.sourceType) }} · {{ palDropLevelLabel(group.level) }}
          </h3>
          <b>
            {{ group.drops.length < group.totalCount ? "已显示 " + group.drops.length + " / 共 " + group.totalCount : group.totalCount }}
          </b>
        </header>

        <ul class="pal-item-drops__list">
          <li v-for="drop in group.drops" :key="dropKey(drop)" class="pal-item-drop">
            <div class="pal-item-drop__identity">
              <RouterLink
                v-if="itemData.itemById.get(drop.itemId)"
                class="pal-item-drop__link"
                :to="itemDetailRoute(drop.itemId)"
                :aria-label="'查看' + itemName(itemData.itemById.get(drop.itemId), drop.itemId) + '的道具详情'"
              >
                <ItemIcon
                  :item="itemData.itemById.get(drop.itemId)"
                  :preview-item="itemData.itemIconPreviewById.get(drop.itemId)"
                  :badge="isBlueprint(itemData.itemById.get(drop.itemId)) ? '图纸' : undefined"
                  size="small"
                />
                <span>
                  <strong>{{ itemName(itemData.itemById.get(drop.itemId), drop.itemId) }}</strong>
                  <small>{{ itemSecondaryName(itemData.itemById.get(drop.itemId), drop.itemId) }}</small>
                </span>
              </RouterLink>
              <div v-else class="pal-item-drop__link pal-item-drop__link--plain">
                <ItemIcon size="small" />
                <span>
                  <strong>{{ drop.itemId }}</strong>
                  <small>内部道具记录</small>
                </span>
              </div>

              <span
                class="pal-item-drop__rarity"
                :class="'pal-item-drop__rarity--' + itemRarityTone(itemData.itemById.get(drop.itemId))"
              >
                {{ itemRarityLabel(itemData.itemById.get(drop.itemId)) }}
              </span>
            </div>

            <dl class="pal-item-drop__metrics">
              <div>
                <dt>基础概率</dt>
                <dd>{{ formatDropPercent(drop.baseChancePercent) }}</dd>
              </div>
              <div>
                <dt>数量</dt>
                <dd>{{ formatDropQuantity(drop.minQuantity, drop.maxQuantity) }}</dd>
              </div>
            </dl>

            <p v-if="!drop.captureEligible" class="pal-item-drop__warning">
              仅击败掉落；捕获时不结算。
            </p>
          </li>
        </ul>
      </section>

      <button
        v-if="sortedDrops.length > DROP_SOURCE_PREVIEW_LIMIT"
        type="button"
        class="pal-item-drops__toggle"
        :aria-expanded="showAll"
        @click="showAll = !showAll"
      >
        {{ showAll ? "收起掉落道具" : "展开其余 " + (sortedDrops.length - DROP_SOURCE_PREVIEW_LIMIT) + " 条掉落" }}
      </button>

      <p v-if="itemData.isLoaded && !sortedDrops.length" class="pal-item-drops__state">
        当前游戏快照中没有找到这个帕鲁的掉落道具。
      </p>
    </template>
  </section>
</template>

<style scoped>
.pal-item-drops {
  display: grid;
  gap: 0.85rem;
  min-width: 0;
}

.pal-item-drops__heading,
.pal-item-drops__group-heading,
.pal-item-drop__identity {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.pal-item-drops__heading h2,
.pal-item-drops__heading p,
.pal-item-drops__group-heading h3,
.pal-item-drops__intro,
.pal-item-drop__warning {
  margin: 0;
}

.pal-item-drops__count,
.pal-item-drops__group-heading b {
  flex: 0 0 auto;
  border-radius: 999px;
  background: #dcf6ff;
  color: #006f91;
  font-size: 0.74rem;
  padding: 0.3rem 0.55rem;
}

.pal-item-drops__intro {
  color: #5b7480;
  font-size: 0.78rem;
  line-height: 1.55;
}

.pal-item-drops__group {
  display: grid;
  gap: 0.55rem;
  min-width: 0;
  border-top: 1px solid #cce8f0;
  padding-top: 0.7rem;
}

.pal-item-drops__group-heading h3 {
  color: #124758;
  font-size: 0.9rem;
}

.pal-item-drops__list {
  display: grid;
  gap: 0.55rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.pal-item-drop {
  display: grid;
  gap: 0.6rem;
  min-width: 0;
  border: 1px solid #c6e5ef;
  border-radius: 0.95rem;
  background: #f4fcff;
  padding: 0.68rem;
}

.pal-item-drop__identity {
  flex-wrap: wrap;
}

.pal-item-drop__link {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
  color: #123b49;
  text-decoration: none;
}

.pal-item-drop__link > span:last-child {
  display: grid;
  min-width: 0;
}

.pal-item-drop__link strong,
.pal-item-drop__link small {
  overflow-wrap: anywhere;
}

.pal-item-drop__link small {
  color: #5b7480;
  font-size: 0.72rem;
}

.pal-item-drop__link:not(.pal-item-drop__link--plain):hover strong,
.pal-item-drop__link:not(.pal-item-drop__link--plain):focus-visible strong {
  color: #0088ad;
  text-decoration: underline;
}

.pal-item-drop__rarity {
  border: 1px solid #c8d8de;
  border-radius: 999px;
  background: #fff;
  color: #526b75;
  font-size: 0.68rem;
  font-weight: 900;
  padding: 0.28rem 0.45rem;
  white-space: nowrap;
}

.pal-item-drop__rarity--uncommon { border-color: #8ed7a4; background: #effcf3; color: #26743d; }
.pal-item-drop__rarity--rare { border-color: #82ccec; background: #edf9ff; color: #176b91; }
.pal-item-drop__rarity--epic { border-color: #c8a9ee; background: #f8f0ff; color: #7040a3; }
.pal-item-drop__rarity--legendary { border-color: #efbe6e; background: #fff7df; color: #8b5900; }
.pal-item-drop__rarity--special { border-color: #ef9eb8; background: #fff0f5; color: #9f3457; }

.pal-item-drop__metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.45rem;
  margin: 0;
}

.pal-item-drop__metrics > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.45rem;
  min-width: 0;
  border-radius: 0.68rem;
  background: #e4f6fc;
  padding: 0.45rem 0.55rem;
}

.pal-item-drop__metrics dt {
  color: #53717d;
  font-size: 0.7rem;
}

.pal-item-drop__metrics dd {
  margin: 0;
  color: #006f91;
  font-size: 0.78rem;
  font-weight: 900;
  text-align: right;
}

.pal-item-drop__warning {
  border-radius: 0.65rem;
  background: #fff0eb;
  color: #a43d29;
  font-size: 0.72rem;
  line-height: 1.5;
  padding: 0.38rem 0.52rem;
}

.pal-item-drops__toggle {
  justify-self: start;
  border: 1px solid #a9d9e8;
  border-radius: 999px;
  background: #fff;
  color: #007a9c;
  cursor: pointer;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 850;
  padding: 0.48rem 0.75rem;
}

.pal-item-drops__toggle:hover,
.pal-item-drops__toggle:focus-visible {
  border-color: #008eb4;
  outline: none;
  box-shadow: 0 0 0 3px rgb(0 142 180 / 14%);
}

.pal-item-drops__state {
  border-radius: 0.85rem;
  background: #edf8fb;
  color: #4f6e79;
  font-size: 0.8rem;
  line-height: 1.5;
  margin: 0;
  padding: 0.7rem 0.8rem;
}

.pal-item-drops__state--error {
  background: #fff0eb;
  color: #9c3d2b;
}

@media (max-width: 560px) {
  .pal-item-drops__heading,
  .pal-item-drops__group-heading,
  .pal-item-drop__identity {
    align-items: flex-start;
  }

  .pal-item-drop__rarity {
    margin-left: 2.9rem;
  }

  .pal-item-drop__metrics {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
