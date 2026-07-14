<script setup lang="ts">
import { computed, onMounted, ref, useId, watch } from "vue";
import { RouterLink } from "vue-router";
import PalIcon from "@/components/PalIcon.vue";
import { useItemDataStore } from "@/stores/itemData";
import type { ChestItemDropRecord, PalItemDropRecord } from "@/stores/itemData";
import type { PalRecord } from "@/core";
import {
  describeChestQuantity,
  describeChestChance,
  DROP_SOURCE_PREVIEW_LIMIT,
  formatChestGrade,
  formatDropPercent,
  formatDropQuantity,
  formatExpectedQuantityPerOpen,
  palDropLevelLabel,
  palDropSourceLabel,
  resolveChestSource,
  sortChestDrops,
  sortPalDrops,
} from "./itemDropSources";

defineOptions({ name: "ItemDropSources" });

const props = defineProps<{
  itemId: string;
  palById: ReadonlyMap<string, PalRecord>;
}>();

const itemData = useItemDataStore();
const instanceId = useId();
const palHeadingId = `${instanceId}-pal-drops`;
const chestHeadingId = `${instanceId}-chest-drops`;
const showAllPalDrops = ref(false);
const showAllChestDrops = ref(false);

const palDropRows = computed(() => sortPalDrops(
  itemData.palDropsByItem.get(props.itemId) ?? [],
  props.palById,
).map((drop) => ({
  drop,
  pal: drop.palId ? props.palById.get(drop.palId) : undefined,
})));

const chestDropRows = computed(() => sortChestDrops(
  itemData.chestDropsByItem.get(props.itemId) ?? [],
  itemData.chestSources,
).map((drop) => ({
  drop,
  chance: describeChestChance(drop),
  expectedQuantity: typeof drop.expectedQuantityPerOpen === "number"
    && Number.isFinite(drop.expectedQuantityPerOpen)
    ? formatExpectedQuantityPerOpen(drop.expectedQuantityPerOpen)
    : undefined,
  quantity: describeChestQuantity(drop),
  source: resolveChestSource(drop, itemData.chestSources),
})));

const visiblePalDropRows = computed(() => showAllPalDrops.value
  ? palDropRows.value
  : palDropRows.value.slice(0, DROP_SOURCE_PREVIEW_LIMIT));

const visibleChestDropRows = computed(() => showAllChestDrops.value
  ? chestDropRows.value
  : chestDropRows.value.slice(0, DROP_SOURCE_PREVIEW_LIMIT));

const totalSourceCount = computed(() => palDropRows.value.length + chestDropRows.value.length);

watch(() => props.itemId, () => {
  showAllPalDrops.value = false;
  showAllChestDrops.value = false;
});

onMounted(() => void itemData.load());

function palName(drop: PalItemDropRecord, pal?: PalRecord) {
  return pal?.names.zh || drop.palId || drop.characterId;
}

function palSecondaryName(drop: PalItemDropRecord, pal?: PalRecord) {
  return pal?.names.en || drop.characterId;
}

function palDetailPath(pal: PalRecord) {
  return `/paldex/${encodeURIComponent(pal.id)}`;
}

function palDropKey(drop: PalItemDropRecord) {
  return `${drop.rowId}:${drop.slot}:${drop.itemId}`;
}

function chestDropKey(drop: ChestItemDropRecord, index: number) {
  return `${drop.rowId ?? drop.poolId ?? drop.sourceId ?? drop.fieldName}:${drop.slot ?? 0}:${drop.itemId}:${index}`;
}
</script>

<template>
  <section class="item-drop-sources" aria-label="掉落与开箱来源">
    <header class="item-drop-sources__heading">
      <div>
        <p class="item-drop-sources__eyebrow">获取来源</p>
        <h3>掉落与开箱</h3>
      </div>
      <span v-if="itemData.isLoaded" class="item-drop-sources__count">{{ totalSourceCount }} 条记录</span>
    </header>

    <p class="item-drop-sources__intro">
      概率为游戏数据中的基础值；难度、世界设置与服务器倍率可能改变实际结果。
    </p>

    <p v-if="itemData.isLoading && !itemData.isLoaded" class="item-drop-sources__state" role="status">
      正在加载掉落数据…
    </p>
    <p v-else-if="itemData.error && !itemData.isLoaded" class="item-drop-sources__state item-drop-sources__state--error" role="alert">
      {{ itemData.error }}
    </p>

    <template v-else>
      <section v-if="palDropRows.length" class="item-drop-sources__group" :aria-labelledby="palHeadingId">
        <header class="item-drop-sources__group-heading">
          <div>
            <h4 :id="palHeadingId">帕鲁掉落</h4>
            <p>同一帕鲁在不同等级段、Alpha 或凶猛形态下会使用不同掉落表。</p>
          </div>
          <b>{{ palDropRows.length }}</b>
        </header>

        <ul class="item-drop-sources__list">
          <li v-for="row in visiblePalDropRows" :key="palDropKey(row.drop)" class="item-drop-source-card">
            <div class="item-drop-source-card__identity">
              <RouterLink
                v-if="row.pal"
                class="item-drop-source-card__pal-link"
                :to="palDetailPath(row.pal)"
                :aria-label="`查看${palName(row.drop, row.pal)}的详细图鉴`"
              >
                <PalIcon :pal="row.pal" size="small" />
                <span>
                  <strong>{{ palName(row.drop, row.pal) }}</strong>
                  <small>{{ palSecondaryName(row.drop, row.pal) }}</small>
                </span>
              </RouterLink>
              <div v-else class="item-drop-source-card__pal-link item-drop-source-card__pal-link--plain">
                <PalIcon size="small" />
                <span>
                  <strong>{{ palName(row.drop) }}</strong>
                  <small>{{ palSecondaryName(row.drop) }} · 内部记录</small>
                </span>
              </div>

              <div class="item-drop-source-card__tags" aria-label="掉落表类型与等级段">
                <span :class="`item-drop-source-card__tag item-drop-source-card__tag--${row.drop.sourceType}`">
                  {{ palDropSourceLabel(row.drop.sourceType) }}
                </span>
                <span class="item-drop-source-card__tag">{{ palDropLevelLabel(row.drop.level) }}</span>
              </div>
            </div>

            <dl class="item-drop-source-card__metrics">
              <div>
                <dt>基础概率</dt>
                <dd>{{ formatDropPercent(row.drop.baseChancePercent) }}</dd>
              </div>
              <div>
                <dt>数量</dt>
                <dd>{{ formatDropQuantity(row.drop.minQuantity, row.drop.maxQuantity) }}</dd>
              </div>
            </dl>

            <p v-if="!row.drop.captureEligible" class="item-drop-source-card__warning">
              捕获时不掉落；肉类仅在击败时结算。
            </p>
          </li>
        </ul>

        <button
          v-if="palDropRows.length > DROP_SOURCE_PREVIEW_LIMIT"
          type="button"
          class="item-drop-sources__toggle"
          :aria-expanded="showAllPalDrops"
          @click="showAllPalDrops = !showAllPalDrops"
        >
          {{ showAllPalDrops ? "收起帕鲁掉落" : `展开其余 ${palDropRows.length - DROP_SOURCE_PREVIEW_LIMIT} 条帕鲁掉落` }}
        </button>
      </section>

      <section v-if="chestDropRows.length" class="item-drop-sources__group" :aria-labelledby="chestHeadingId">
        <header class="item-drop-sources__group-heading">
          <div>
            <h4 :id="chestHeadingId">宝箱掉落</h4>
            <p>宝箱概率按品级分别计算；游戏数据未提供各品级的生成概率。</p>
          </div>
          <b>{{ chestDropRows.length }}</b>
        </header>

        <ul class="item-drop-sources__list">
          <li
            v-for="(row, index) in visibleChestDropRows"
            :key="chestDropKey(row.drop, index)"
            class="item-drop-source-card item-drop-source-card--chest"
          >
            <div class="item-drop-source-card__identity">
              <span class="item-drop-source-card__chest-icon" aria-hidden="true">🧰</span>
              <span class="item-drop-source-card__chest-name">
                <strong>{{ row.source.label }}</strong>
                <small v-if="row.source.region">{{ row.source.region }}</small>
              </span>
              <div class="item-drop-source-card__tags">
                <span v-if="row.source.kind" class="item-drop-source-card__tag">{{ row.source.kind }}</span>
                <span v-if="row.source.treasureGrade !== undefined" class="item-drop-source-card__tag item-drop-source-card__tag--grade">
                  宝箱品级 {{ formatChestGrade(row.source.treasureGrade) }}
                </span>
              </div>
            </div>

            <dl class="item-drop-source-card__metrics">
              <div :class="`item-drop-source-card__chance item-drop-source-card__chance--${row.chance.kind}`">
                <dt>{{ row.chance.label }}</dt>
                <dd>{{ row.chance.value }}</dd>
              </div>
              <div v-if="row.expectedQuantity">
                <dt>该品级每箱期望</dt>
                <dd>{{ row.expectedQuantity }}</dd>
              </div>
              <div v-if="row.quantity">
                <dt>数量</dt>
                <dd>{{ row.quantity }}</dd>
              </div>
            </dl>

            <p v-if="row.chance.kind === 'grade-conditional'" class="item-drop-source-card__conditional-note">
              此值只在宝箱品级已经确定时成立；未提供各品级生成概率，不能作为全局开箱率。
            </p>
            <p v-else-if="row.chance.kind === 'conditional' || row.chance.kind === 'weight'" class="item-drop-source-card__conditional-note">
              此值只在对应掉落池或栏位内成立，不等于整次开箱率。
            </p>
          </li>
        </ul>

        <button
          v-if="chestDropRows.length > DROP_SOURCE_PREVIEW_LIMIT"
          type="button"
          class="item-drop-sources__toggle"
          :aria-expanded="showAllChestDrops"
          @click="showAllChestDrops = !showAllChestDrops"
        >
          {{ showAllChestDrops ? "收起宝箱掉落" : `展开其余 ${chestDropRows.length - DROP_SOURCE_PREVIEW_LIMIT} 条宝箱掉落` }}
        </button>
      </section>

      <p v-if="itemData.isLoaded && !totalSourceCount" class="item-drop-sources__state">
        当前游戏快照中没有找到该道具的帕鲁或宝箱掉落记录。
      </p>
    </template>
  </section>
</template>

<style scoped>
.item-drop-sources {
  display: grid;
  gap: 1rem;
  min-width: 0;
}

.item-drop-sources__heading,
.item-drop-sources__group-heading,
.item-drop-source-card__identity {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.85rem;
}

.item-drop-sources__heading h3,
.item-drop-sources__group-heading h4,
.item-drop-sources__heading p,
.item-drop-sources__group-heading p,
.item-drop-sources__intro,
.item-drop-source-card p {
  margin: 0;
}

.item-drop-sources__heading h3 {
  color: #123b49;
  font-size: 1.35rem;
}

.item-drop-sources__eyebrow {
  color: #0082a7;
  font-size: 0.74rem;
  font-weight: 900;
  letter-spacing: 0.1em;
}

.item-drop-sources__count,
.item-drop-sources__group-heading > b {
  flex: 0 0 auto;
  border-radius: 999px;
  background: #dcf6ff;
  color: #006f91;
  font-size: 0.76rem;
  padding: 0.3rem 0.58rem;
}

.item-drop-sources__intro,
.item-drop-sources__group-heading p,
.item-drop-source-card__identity small {
  color: #5b7480;
  font-size: 0.78rem;
  line-height: 1.55;
}

.item-drop-sources__group {
  display: grid;
  gap: 0.7rem;
}

.item-drop-sources__group-heading {
  align-items: flex-start;
  border-top: 1px solid #cce8f0;
  padding-top: 0.85rem;
}

.item-drop-sources__group-heading h4 {
  color: #124758;
  font-size: 1rem;
}

.item-drop-sources__list {
  display: grid;
  gap: 0.55rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.item-drop-source-card {
  display: grid;
  gap: 0.65rem;
  min-width: 0;
  border: 1px solid #c6e5ef;
  border-radius: 1rem;
  background: #f4fcff;
  padding: 0.72rem;
}

.item-drop-source-card__identity {
  flex-wrap: wrap;
}

.item-drop-source-card__pal-link {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
  color: #123b49;
  text-decoration: none;
}

.item-drop-source-card__pal-link:not(.item-drop-source-card__pal-link--plain):hover strong,
.item-drop-source-card__pal-link:not(.item-drop-source-card__pal-link--plain):focus-visible strong {
  color: #0088ad;
  text-decoration: underline;
}

.item-drop-source-card__pal-link > span:last-child,
.item-drop-source-card__chest-name {
  display: grid;
  min-width: 0;
}

.item-drop-source-card__pal-link strong,
.item-drop-source-card__chest-name strong {
  overflow-wrap: anywhere;
}

.item-drop-source-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.item-drop-source-card__tag {
  border: 1px solid #bcdfea;
  border-radius: 999px;
  background: #fff;
  color: #3d6472;
  font-size: 0.7rem;
  font-weight: 800;
  line-height: 1;
  padding: 0.3rem 0.46rem;
  white-space: nowrap;
}

.item-drop-source-card__tag--alpha {
  border-color: #f0b7a7;
  background: #fff0eb;
  color: #a73b24;
}

.item-drop-source-card__tag--predator {
  border-color: #c9b7e8;
  background: #f5efff;
  color: #6638a1;
}

.item-drop-source-card__tag--grade {
  border-color: #efd07a;
  background: #fff7d6;
  color: #7b5b00;
}

.item-drop-source-card__metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8.25rem, 1fr));
  gap: 0.45rem;
  margin: 0;
}

.item-drop-source-card__metrics > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  min-width: 0;
  border-radius: 0.72rem;
  background: #e4f6fc;
  padding: 0.48rem 0.58rem;
}

.item-drop-source-card__metrics dt {
  color: #53717d;
  font-size: 0.72rem;
}

.item-drop-source-card__metrics dd {
  margin: 0;
  color: #006f91;
  font-size: 0.8rem;
  font-weight: 900;
  text-align: right;
}

.item-drop-source-card__chance--grade-conditional,
.item-drop-source-card__chance--conditional,
.item-drop-source-card__chance--weight {
  background: #fff4db !important;
}

.item-drop-source-card__chance--grade-conditional dd,
.item-drop-source-card__chance--conditional dd,
.item-drop-source-card__chance--weight dd {
  color: #996000;
}

.item-drop-source-card__warning,
.item-drop-source-card__conditional-note {
  border-radius: 0.65rem;
  font-size: 0.72rem;
  line-height: 1.5;
  padding: 0.38rem 0.52rem;
}

.item-drop-source-card__warning {
  background: #fff0eb;
  color: #a43d29;
}

.item-drop-source-card__conditional-note {
  background: #fff8e8;
  color: #805a0a;
}

.item-drop-source-card__chest-icon {
  display: grid;
  place-items: center;
  width: 2.35rem;
  height: 2.35rem;
  border-radius: 0.75rem;
  background: #fff3c5;
  font-size: 1.25rem;
}

.item-drop-source-card__chest-name {
  flex: 1 1 10rem;
}

.item-drop-sources__toggle {
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

.item-drop-sources__toggle:hover,
.item-drop-sources__toggle:focus-visible {
  border-color: #008eb4;
  outline: none;
  box-shadow: 0 0 0 3px rgb(0 142 180 / 14%);
}

.item-drop-sources__state {
  border-radius: 0.85rem;
  background: #edf8fb;
  color: #4f6e79;
  font-size: 0.8rem;
  line-height: 1.5;
  margin: 0;
  padding: 0.7rem 0.8rem;
}

.item-drop-sources__state--error {
  background: #fff0eb;
  color: #9c3d2b;
}

@media (max-width: 560px) {
  .item-drop-sources__heading,
  .item-drop-sources__group-heading {
    align-items: flex-start;
  }

  .item-drop-source-card__identity {
    align-items: flex-start;
  }

  .item-drop-source-card__tags {
    flex-basis: 100%;
  }

  .item-drop-source-card__metrics {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
