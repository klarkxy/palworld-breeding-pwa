<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useTemplateRef } from "vue";
import { useRoute, useRouter } from "vue-router";
import DataState from "@/components/DataState.vue";
import EggshellCard from "@/components/EggshellCard.vue";
import PalIcon from "@/components/PalIcon.vue";
import { useCollection } from "@/composables/useCollection";
import { elementName, formatDex, isSelectablePal, usePalData, workName } from "@/composables/usePalData";
import type { PartnerSkillRefinementMetric } from "@/core";

const route = useRoute();
const router = useRouter();
const emit = defineEmits<{ close: [] }>();
const drawer = useTemplateRef<HTMLDialogElement>("drawer");
const { palById, activeSkillById, partnerSkillById, selfBreedOnlyIds, isLoading, error, load } = usePalData();
const { entries, setOwned } = useCollection();
const id = computed(() => Array.isArray(route.params.id) ? route.params.id[0] : route.params.id);
const pal = computed(() => {
  const candidate = palById.value.get(id.value ?? "");
  return candidate && isSelectablePal(candidate) ? candidate : undefined;
});
const isOwned = computed(() => entries.value.some((entry) => entry.palId === pal.value?.id));
const malePercent = computed(() => {
  const value = pal.value?.maleProbability ?? 0.5;
  return Math.round(value <= 1 ? value * 100 : value);
});
const activeSkillDetails = computed(() => (pal.value?.activeSkillRefs ?? [])
  .map((reference) => {
    const skill = activeSkillById.value.get(reference.id);
    return skill ? { skill, level: reference.level } : undefined;
  })
  .filter((value) => value !== undefined));
const partnerSkillDetails = computed(() => {
  const skillId = pal.value?.partnerSkillId;
  return skillId ? partnerSkillById.value.get(skillId) : undefined;
});
const refinement = computed(() => pal.value?.refinement);
const selectedStars = ref<0 | 4>(0);
const selectedRank = computed(() => {
  const data = refinement.value;
  return data ? selectedStars.value === 4 ? data.fourStar : data.zeroStar : undefined;
});
const selectedWorkSuitability = computed(() => selectedRank.value?.workSuitability ?? pal.value?.workSuitability ?? {});
const selectedMetrics = computed(() => selectedRank.value?.metrics ?? []);

const statLabels: Record<string, string> = { hp: "生命", attack: "攻击", defense: "防御", stamina: "体力", support: "支援" };
const statName = (value: string) => statLabels[value.toLocaleLowerCase()] ?? value;
const refinedStats = new Set(["hp", "attack", "defense"]);
const statValue = (key: string, value: number) => refinedStats.has(key.toLocaleLowerCase())
  ? Math.round(value * (selectedRank.value?.statMultiplier ?? 1))
  : value;
const movementTypeLabels = { ground: "地面", fly: "飞行", flyAndLanding: "飞行兼落地", swim: "游泳" } as const;
const movementRows = computed(() => {
  const movement = pal.value?.movement;
  if (!movement) return [];
  const rows: { label: string; value: number | undefined }[] = [
    { label: "慢走参数", value: movement.slowWalkSpeed },
    { label: "行走参数", value: movement.walkSpeed },
    { label: "奔跑参数", value: movement.runSpeed },
    { label: "乘骑冲刺参数", value: movement.rideSprintSpeed },
    { label: "搬运参数", value: movement.transportSpeed },
    { label: "游泳参数", value: movement.swimSpeed },
    { label: "游泳冲刺参数", value: movement.swimDashSpeed },
  ];
  if (movement.type === "fly" || movement.type === "flyAndLanding") {
    rows.push(
      { label: "飞行奔跑基准", value: movement.runSpeed },
      { label: "飞行冲刺基准", value: movement.rideSprintSpeed },
      { label: "飞行覆盖值", value: movement.flySpeedOverride },
      { label: "飞行冲刺覆盖值", value: movement.flySprintSpeedOverride },
    );
  }
  return rows;
});
const formatMovementValue = (value: number | undefined) => value === undefined || value < 0 ? "不可用" : value;
const refinementTargetNames: Record<string, string> = {
  ToSelf: "当前帕鲁", ToTrainer: "玩家", ToSelfAndTrainer: "玩家与当前帕鲁", None: "",
};
const metricValue = (metric: PartnerSkillRefinementMetric) => `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`;
const metricTarget = (metric: PartnerSkillRefinementMetric) => metric.target
  ? refinementTargetNames[metric.target] ?? metric.target
  : "";

function openCalculator(kind: "parent" | "target") {
  if (!pal.value) return;
  router.push(kind === "parent"
    ? { path: "/breeding", query: { mode: "forward", a: pal.value.id } }
    : { path: "/breeding", query: { mode: "pairs", target: pal.value.id } });
}

function closeOnEscape(event: KeyboardEvent) {
  if (event.key === "Escape") drawer.value?.close();
}

onMounted(() => {
  drawer.value?.show();
  window.addEventListener("keydown", closeOnEscape);
});
onUnmounted(() => window.removeEventListener("keydown", closeOnEscape));
</script>

<template>
  <dialog ref="drawer" class="paldex-drawer" :aria-label="pal ? `${pal.names.zh}详细图鉴` : '帕鲁详细图鉴'" @close="emit('close')">
    <header class="paldex-drawer__topbar">
      <div><small>详细图鉴</small><strong>{{ pal?.names.zh ?? "帕鲁" }}</strong></div>
      <form method="dialog"><button class="paldex-drawer__close" type="submit" aria-label="关闭详细图鉴">×</button></form>
    </header>
    <DataState :is-loading :error @retry="load">
      <div v-if="pal" class="paldex-detail paldex-drawer__content">
        <fieldset v-if="selectedRank" class="refinement-selector">
          <legend>精炼星级</legend>
          <div class="mini-tabs">
            <button type="button" :class="{ active: selectedStars === 0 }" :aria-pressed="selectedStars === 0" @click="selectedStars = 0">0 星</button>
            <button type="button" :class="{ active: selectedStars === 4 }" :aria-pressed="selectedStars === 4" @click="selectedStars = 4">4 星</button>
          </div>
          <p class="refinement-selector__summary" aria-live="polite">当前 {{ selectedStars }} 星 · 伙伴技能 Lv.{{ selectedRank.partnerSkillLevel }} · 累计消耗 {{ selectedRank.consumedCopies }} 只同种帕鲁</p>
        </fieldset>
        <EggshellCard tone="sky" class="detail-hero">
          <div class="detail-hero__art"><PalIcon :pal size="large" /></div>
          <div class="detail-hero__copy">
            <p class="eyebrow">{{ formatDex(pal) }} · {{ pal.id }}</p>
            <h1>{{ pal.names.zh }}</h1><p class="detail-english">{{ pal.names.en }}</p>
            <div class="tag-row"><span v-for="item in pal.elements" :key="item" class="tag">{{ elementName(item) }}</span><span v-if="pal.variant" class="tag tag--coral">亚种</span><span v-if="selfBreedOnlyIds.has(pal.id)" class="self-breed-badge" title="配种时只能由同种帕鲁产出">仅可自交</span></div>
            <div class="detail-actions">
              <button class="button button--primary" type="button" @click="openCalculator('parent')">设为亲本 A</button>
              <button class="button button--secondary" type="button" @click="openCalculator('target')">查全部父母组合</button>
            </div>
          </div>
          <fieldset class="detail-owned">
            <legend>加入我的帕鲁</legend>
            <label class="owned-toggle"><input type="checkbox" :aria-label="`${pal.names.zh}已拥有`" :checked="isOwned" @change="setOwned(pal.id, ($event.target as HTMLInputElement).checked)" /><span>已拥有</span></label>
          </fieldset>
        </EggshellCard>

        <div class="detail-grid">
          <EggshellCard class="stats-card"><p class="eyebrow">属性 · {{ selectedStars }} 星</p><h2>基础数值</h2><dl class="stat-grid"><div v-for="(value, key) in pal.stats" :key="key"><dt>{{ statName(key) }}</dt><dd>{{ statValue(key, value) }}</dd></div><div><dt>雄性概率</dt><dd>{{ malePercent }}%</dd></div><div><dt>配种力</dt><dd>{{ pal.breedingPower }}</dd></div></dl></EggshellCard>
          <EggshellCard class="work-card"><p class="eyebrow">工作 · {{ selectedStars }} 星</p><h2>据点分工</h2><ul v-if="Object.keys(selectedWorkSuitability).length" class="level-list"><li v-for="(level, work) in selectedWorkSuitability" :key="work"><span>{{ workName(work) }}</span><strong>Lv.{{ level }}</strong></li></ul><p v-else class="muted-copy">暂无数据。</p></EggshellCard>
          <EggshellCard class="movement-card">
            <p class="eyebrow">移动</p>
            <h2>移动参数</h2>
            <p class="movement-type">内部移动类型：<strong>{{ pal.movement.type ? movementTypeLabels[pal.movement.type] : "未解析" }}</strong></p>
            <dl class="stat-grid"><div v-for="row in movementRows" :key="row.label"><dt>{{ row.label }}</dt><dd>{{ formatMovementValue(row.value) }}</dd></div></dl>
            <p class="muted-copy movement-note">这些是游戏角色表与 Blueprint 基础参数，不代表该帕鲁一定可乘骑或只能以此方式移动。星级带来的移动加成列在伙伴技能参数中，不直接改写此处数值。</p>
          </EggshellCard>
          <EggshellCard class="partner-skill-card">
            <p class="eyebrow">伙伴技能 · {{ selectedStars }} 星</p>
            <h2>{{ partnerSkillDetails?.name || pal.partnerSkill || "暂无" }}</h2>
            <p v-if="selectedRank" class="partner-skill-rank">伙伴技能 Lv.{{ selectedRank.partnerSkillLevel }}</p>
            <p v-if="partnerSkillDetails && (!selectedRank || selectedStars === 0)" class="muted-copy">{{ partnerSkillDetails.description }}</p>
            <details v-else-if="partnerSkillDetails" class="partner-skill-base">
              <summary>查看 0 星基础说明</summary>
              <p class="muted-copy">{{ partnerSkillDetails.description }}</p>
            </details>
            <p v-else class="muted-copy">暂无说明。</p>
            <h3 v-if="selectedRank" class="partner-metrics-title">{{ selectedStars }} 星参数</h3>
            <ul v-if="selectedMetrics.length" class="level-list partner-metric-list">
              <li v-for="(metric, index) in selectedMetrics" :key="`${metric.key}-${index}`">
                <span>{{ metric.label }}<small v-if="metric.context">{{ metric.context }}</small></span>
                <strong>{{ metricValue(metric) }}<small v-if="metricTarget(metric)">{{ metricTarget(metric) }}</small></strong>
              </li>
            </ul>
            <p v-else-if="selectedRank" class="muted-copy">该技能在 {{ selectedStars }} 星没有可变参数。</p>
            <p v-for="note in refinement?.notes ?? []" :key="note" class="muted-copy refinement-note">{{ note }}</p>
          </EggshellCard>
          <EggshellCard>
            <p class="eyebrow">技能</p>
            <h2>主动技能</h2>
            <ul v-if="activeSkillDetails.length" class="skill-list">
              <li v-for="item in activeSkillDetails" :key="`${item.skill.id}-${item.level}`">
                <strong>{{ item.skill.names.zh }}</strong>
                <small>{{ elementName(item.skill.element) }} · 威力 {{ item.skill.power }} · 冷却 {{ item.skill.cooldownSeconds }} 秒 · Lv.{{ item.level }}</small>
                <p class="muted-copy">{{ item.skill.description?.zh || "暂无说明。" }}</p>
              </li>
            </ul>
            <ul v-else-if="pal.activeSkills.length" class="skill-list">
              <li v-for="skill in pal.activeSkills" :key="skill">{{ skill }}</li>
            </ul>
            <p v-else class="muted-copy">暂无主动技能数据。</p>
          </EggshellCard>
        </div>
      </div>
      <div v-else class="empty-state"><span aria-hidden="true">?</span><p>图鉴中没有这个帕鲁。</p></div>
    </DataState>
  </dialog>
</template>
