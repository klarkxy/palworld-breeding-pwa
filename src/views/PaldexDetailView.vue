<script setup lang="ts">
import { computed, onMounted, onUnmounted, useTemplateRef } from "vue";
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
const keyedMetrics = (metrics: readonly PartnerSkillRefinementMetric[]) => {
  const occurrences = new Map<string, number>();
  return metrics.map((metric) => {
    const identity = metric.key.startsWith("passive:") ? metric.technicalId ?? metric.label : metric.key;
    const base = [identity, metric.target, metric.context].join("\0");
    const occurrence = occurrences.get(base) ?? 0;
    occurrences.set(base, occurrence + 1);
    return [`${base}\0${occurrence}`, metric] as const;
  });
};
const refinementMetricRows = computed(() => {
  const data = refinement.value;
  if (!data) return [];
  const zero = new Map(keyedMetrics(data.zeroStar.metrics));
  const four = new Map(keyedMetrics(data.fourStar.metrics));
  return [...new Set([...zero.keys(), ...four.keys()])].map((key) => ({
    key,
    label: zero.get(key)?.label ?? four.get(key)?.label ?? key,
    context: zero.get(key)?.context ?? four.get(key)?.context,
    zero: zero.get(key),
    four: four.get(key),
  }));
});
const refinementWorkRows = computed(() => {
  const data = refinement.value;
  if (!data) return [];
  const keys = new Set([
    ...Object.keys(data.zeroStar.workSuitability),
    ...Object.keys(data.fourStar.workSuitability),
  ]);
  return [...keys].map((key) => ({
    key,
    label: workName(key),
    zero: data.zeroStar.workSuitability[key],
    four: data.fourStar.workSuitability[key],
  }));
});

const statLabels: Record<string, string> = { hp: "生命", attack: "攻击", defense: "防御", stamina: "体力", support: "支援" };
const statName = (value: string) => statLabels[value.toLocaleLowerCase()] ?? value;
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
const metricValue = (metric?: PartnerSkillRefinementMetric) => metric
  ? `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`
  : "—";
const metricTarget = (metric?: PartnerSkillRefinementMetric) => metric?.target
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
          <EggshellCard><p class="eyebrow">属性</p><h2>基础数值</h2><dl class="stat-grid"><div v-for="(value, key) in pal.stats" :key="key"><dt>{{ statName(key) }}</dt><dd>{{ value }}</dd></div><div><dt>雄性概率</dt><dd>{{ malePercent }}%</dd></div><div><dt>配种力</dt><dd>{{ pal.breedingPower }}</dd></div></dl></EggshellCard>
          <EggshellCard><p class="eyebrow">工作</p><h2>据点分工</h2><ul v-if="Object.keys(pal.workSuitability).length" class="level-list"><li v-for="(level, work) in pal.workSuitability" :key="work"><span>{{ workName(work) }}</span><strong>Lv.{{ level }}</strong></li></ul><p v-else class="muted-copy">暂无数据。</p></EggshellCard>
          <EggshellCard class="movement-card">
            <p class="eyebrow">移动</p>
            <h2>移动参数</h2>
            <p class="movement-type">内部移动类型：<strong>{{ pal.movement.type ? movementTypeLabels[pal.movement.type] : "未解析" }}</strong></p>
            <dl class="stat-grid"><div v-for="row in movementRows" :key="row.label"><dt>{{ row.label }}</dt><dd>{{ formatMovementValue(row.value) }}</dd></div></dl>
            <p class="muted-copy movement-note">这些是游戏角色表与 Blueprint 参数，不代表该帕鲁一定可乘骑或只能以此方式移动。飞行覆盖值仅在 Blueprint 明确设置时显示；未设置不等于速度为零。</p>
          </EggshellCard>
          <EggshellCard class="partner-skill-card">
            <p class="eyebrow">伙伴技能</p>
            <h2>{{ partnerSkillDetails?.name || pal.partnerSkill || "暂无" }}</h2>
            <p v-if="partnerSkillDetails" class="muted-copy">{{ partnerSkillDetails.description }}</p>
            <p v-else class="muted-copy">暂无说明。</p>
          </EggshellCard>
          <EggshellCard v-if="refinement" class="refinement-card">
            <p class="eyebrow">精炼</p>
            <h2>0 星 / 4 星对照</h2>
            <div class="refinement-table-wrap" tabindex="0" aria-label="通用精炼效果表，可横向滚动">
              <table class="refinement-table">
                <caption class="sr-only">通用精炼效果</caption>
                <thead><tr><th scope="col">项目</th><th scope="col">0 星</th><th scope="col">4 星</th></tr></thead>
                <tbody>
                  <tr><th scope="row">伙伴技能等级</th><td>Lv.{{ refinement.zeroStar.partnerSkillLevel }}</td><td>Lv.{{ refinement.fourStar.partnerSkillLevel }}</td></tr>
                  <tr><th scope="row">生命 / 攻击 / 防御</th><td>×{{ refinement.zeroStar.statMultiplier.toFixed(2) }}</td><td>×{{ refinement.fourStar.statMultiplier.toFixed(2) }}</td></tr>
                  <tr><th scope="row">累计素材消耗</th><td>{{ refinement.zeroStar.consumedCopies }}</td><td>{{ refinement.fourStar.consumedCopies }}</td></tr>
                </tbody>
              </table>
            </div>
            <h3 v-if="refinementWorkRows.length" class="refinement-subtitle">工作适应性</h3>
            <div v-if="refinementWorkRows.length" class="refinement-table-wrap" tabindex="0" aria-label="工作适应性精炼表，可横向滚动">
              <table class="refinement-table">
                <caption class="sr-only">工作适应性精炼前后等级</caption>
                <thead><tr><th scope="col">工种</th><th scope="col">0 星</th><th scope="col">4 星</th></tr></thead>
                <tbody><tr v-for="row in refinementWorkRows" :key="row.key"><th scope="row">{{ row.label }}</th><td>Lv.{{ row.zero }}</td><td>Lv.{{ row.four }}</td></tr></tbody>
              </table>
            </div>
            <h3 class="refinement-subtitle">伙伴技能参数</h3>
            <div v-if="refinementMetricRows.length" class="refinement-table-wrap" tabindex="0" aria-label="伙伴技能精炼参数表，可横向滚动">
              <table class="refinement-table refinement-table--metrics">
                <caption class="sr-only">伙伴技能 0 星与 4 星参数</caption>
                <thead><tr><th scope="col">效果</th><th scope="col">0 星</th><th scope="col">4 星</th></tr></thead>
                <tbody>
                  <tr v-for="row in refinementMetricRows" :key="row.key">
                    <th scope="row"><span>{{ row.label }}</span><small v-if="row.context">{{ row.context }}</small></th>
                    <td>{{ metricValue(row.zero) }}<small v-if="metricTarget(row.zero)">{{ metricTarget(row.zero) }}</small></td>
                    <td>{{ metricValue(row.four) }}<small v-if="metricTarget(row.four)">{{ metricTarget(row.four) }}</small></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="muted-copy">该技能 0 星与 4 星没有可变数值。</p>
            <p v-for="note in refinement.notes" :key="note" class="muted-copy refinement-note">{{ note }}</p>
            <p class="muted-copy refinement-note">0 星对应内部 Rank 1，4 星对应 Rank 5。工作等级按 1.0 的逐星分配规则计算并封顶 Lv.10；未标单位的技能值是游戏内部参数，用于精确比较，不擅自换算为百分比。</p>
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
