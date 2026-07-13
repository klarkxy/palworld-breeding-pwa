<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { NEmpty, NInput, NSelect } from "naive-ui";
import { pinyin } from "pinyin-pro";
import DataState from "@/components/DataState.vue";
import PageIntro from "@/components/PageIntro.vue";
import PalIcon from "@/components/PalIcon.vue";
import type { PalRecord, PassiveSkillRecord } from "@/core";
import { formatDex, usePalDataStore } from "@/stores/palData";

type RandomPoolFilter = "all" | "included" | "excluded";
type AcquisitionFilter = "all" | "surgery" | "item" | "none";

const palData = usePalDataStore();
const { passiveSkills, palById, isLoading, error } = storeToRefs(palData);
const { load } = palData;

const query = ref("");
const rank = ref<number | "all">("all");
const randomPool = ref<RandomPoolFilter>("all");
const acquisition = ref<AcquisitionFilter>("all");

const rankOptions = [
  { label: "全部等级", value: "all" },
  ...[5, 4, 3, 2, 1].map((value) => ({ label: `${value} 星`, value })),
  ...[-1, -2, -3].map((value) => ({ label: `负面 ${Math.abs(value)} 级`, value })),
];
const randomPoolOptions = [
  { label: "全部词条", value: "all" },
  { label: "进入随机词条池", value: "included" },
  { label: "不进入随机词条池", value: "excluded" },
];
const acquisitionOptions = [
  { label: "全部记录", value: "all" },
  { label: "可付费手术", value: "surgery" },
  { label: "有对应道具", value: "item" },
  { label: "无手术或道具", value: "none" },
];

const randomCount = computed(() => passiveSkills.value.filter((skill) => skill.randomlyAvailable).length);
const fixedCount = computed(() => passiveSkills.value.length - randomCount.value);
const surgeryCount = computed(() => passiveSkills.value.filter(supportsSurgery).length);

const searchInitials = (value: string) => pinyin(value, {
  pattern: "first", toneType: "none", type: "array", nonZh: "removed",
}).join("").toLocaleLowerCase();

function supportsSurgery(skill: PassiveSkillRecord) {
  return skill.surgeryCost > 0;
}

function hasAcquisitionData(skill: PassiveSkillRecord) {
  return supportsSurgery(skill) || Boolean(skill.surgeryItem);
}

function matchesSearch(skill: PassiveSkillRecord, rawQuery: string) {
  const needle = rawQuery.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [
    skill.id,
    skill.names.zh,
    skill.names.en,
    skill.description.zh,
    skill.description.en,
    searchInitials(skill.names.zh),
  ].some((value) => value.toLocaleLowerCase().includes(needle));
}

const filteredSkills = computed(() => passiveSkills.value
  .filter((skill) => {
    if (rank.value !== "all" && skill.rank !== rank.value) return false;
    if (randomPool.value === "included" && !skill.randomlyAvailable) return false;
    if (randomPool.value === "excluded" && skill.randomlyAvailable) return false;
    if (acquisition.value === "surgery" && !supportsSurgery(skill)) return false;
    if (acquisition.value === "item" && !skill.surgeryItem) return false;
    if (acquisition.value === "none" && hasAcquisitionData(skill)) return false;
    return matchesSearch(skill, query.value);
  })
  .sort((a, b) => b.rank - a.rank || a.names.zh.localeCompare(b.names.zh, "zh-CN")));

function rankLabel(value: number) {
  return value > 0 ? `${value} 星` : `负面 ${Math.abs(value)} 级`;
}

function guaranteedPals(skill: PassiveSkillRecord): PalRecord[] {
  return skill.guaranteedBy
    .map((palId) => palById.value.get(palId))
    .filter((pal): pal is PalRecord => Boolean(pal));
}

function formatCost(value: number) {
  return value.toLocaleString("zh-CN");
}
</script>

<template>
  <main class="page-shell">
    <PageIntro
      eyebrow="被动技能"
      title="词条图鉴"
      description="基于正式版 1.0 数据整理：系统内 1,905 条被动效果记录中，本页收录 115 条玩家可见的标准词条。"
    />
    <DataState :is-loading :error @retry="load">
      <dl class="passive-summary" aria-label="词条数据概览">
        <div><dt>正式词条</dt><dd>{{ passiveSkills.length }}</dd></div>
        <div><dt>进入随机词条池</dt><dd>{{ randomCount }}</dd></div>
        <div><dt>不进入随机词条池</dt><dd>{{ fixedCount }}</dd></div>
        <div><dt>可付费手术</dt><dd>{{ surgeryCount }}</dd></div>
      </dl>

      <section class="filter-bar filter-bar--passives" aria-label="筛选词条">
        <label class="field filter-search">
          <span class="field__label">搜索词条</span>
          <NInput
            v-model:value="query"
            class="field-control"
            clearable
            size="large"
            placeholder="中文 / 拼音首字母 / English / 效果 / 内部 ID"
            :input-props="{ type: 'search', 'aria-label': '搜索词条' }"
          />
        </label>
        <label class="field field--compact">
          <span class="field__label">等级</span>
          <NSelect v-model:value="rank" class="field-control" :options="rankOptions" :fallback-option="false" size="large" :input-props="{ 'aria-label': '等级' }" />
        </label>
        <label class="field field--compact">
          <span class="field__label">随机词条池</span>
          <NSelect v-model:value="randomPool" class="field-control" :options="randomPoolOptions" :fallback-option="false" size="large" :input-props="{ 'aria-label': '随机词条池' }" />
        </label>
        <label class="field field--compact">
          <span class="field__label">额外获取</span>
          <NSelect v-model:value="acquisition" class="field-control" :options="acquisitionOptions" :fallback-option="false" size="large" :input-props="{ 'aria-label': '额外获取' }" />
        </label>
      </section>

      <p class="passive-data-note">
        “不进入随机词条池”不代表不能从已有亲本遗传；随机权重只用于比较同一随机池中的相对抽取概率。
      </p>
      <p class="result-note" role="status" aria-live="polite">找到 {{ filteredSkills.length }} / {{ passiveSkills.length }} 条正式词条 · 按等级从高到低排列</p>

      <ul class="passive-grid">
        <li
          v-for="skill in filteredSkills"
          :key="skill.id"
          class="passive-card"
          :class="{ 'passive-card--negative': skill.rank < 0, 'passive-card--rank-five': skill.rank === 5 }"
        >
          <header class="passive-card__header">
            <div>
              <h2>{{ skill.names.zh }}</h2>
              <p>{{ skill.names.en }}</p>
            </div>
            <span class="passive-rank" :class="{ 'passive-rank--negative': skill.rank < 0 }">{{ rankLabel(skill.rank) }}</span>
          </header>

          <p class="passive-card__effect">{{ skill.description.zh }}</p>

          <div class="passive-card__facts">
            <span v-if="skill.randomlyAvailable" class="passive-fact passive-fact--random" title="同一随机池中的相对权重">
              <span aria-hidden="true">🎲</span>进入随机词条池 · 权重 {{ skill.randomWeight }}
            </span>
            <span v-else class="passive-fact passive-fact--fixed"><span aria-hidden="true">🔒</span>不进入随机词条池</span>
            <span v-if="supportsSurgery(skill)" class="passive-fact passive-fact--surgery" :title="skill.surgeryItem ?? undefined">
              <span aria-hidden="true">🧬</span>词条手术 · {{ formatCost(skill.surgeryCost) }} 金币
              <template v-if="skill.surgeryItem"> · 需指定道具</template>
            </span>
            <span v-else-if="skill.surgeryItem" class="passive-fact passive-fact--item" :title="skill.surgeryItem">
              <span aria-hidden="true">🎟️</span>有对应词条道具
            </span>
          </div>

          <section v-if="guaranteedPals(skill).length" class="passive-card__carriers" :aria-label="`${skill.names.zh}的固定携带帕鲁`">
            <h3>固定携带</h3>
            <ul>
              <li v-for="pal in guaranteedPals(skill)" :key="pal.id">
                <RouterLink :to="`/paldex/${encodeURIComponent(pal.id)}`" :aria-label="`查看${pal.names.zh}的详细图鉴`">
                  <PalIcon :pal size="small" />
                  <span><strong>{{ pal.names.zh }}</strong><small>{{ formatDex(pal) }}</small></span>
                </RouterLink>
              </li>
            </ul>
          </section>

          <footer class="passive-card__footer">
            <span>内部 ID</span><code>{{ skill.id }}</code>
          </footer>
        </li>
      </ul>
      <NEmpty v-if="!filteredSkills.length" class="empty-state" description="没有匹配的词条。" />
    </DataState>
  </main>
</template>
