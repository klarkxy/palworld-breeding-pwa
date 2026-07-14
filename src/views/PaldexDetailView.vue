<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { NButton, NCheckbox, NDrawer, NDrawerContent, NEmpty, NRadioButton, NRadioGroup } from "naive-ui";
import { useRoute, useRouter } from "vue-router";
import DataState from "@/components/DataState.vue";
import EggshellCard from "@/components/EggshellCard.vue";
import PalIcon from "@/components/PalIcon.vue";
import ShareButton from "@/components/ShareButton.vue";
import { elementName, formatDex, isSelectablePal, workName } from "@/composables/usePalData";
import type { PartnerSkillRefinementMetric } from "@/core";
import { snapshotQuery } from "@/routing/queryState";
import { useCollectionStore } from "@/stores/collection";
import { usePalDataStore } from "@/stores/palData";
import { usePaldexStore } from "@/stores/paldex";

const route = useRoute();
const router = useRouter();
const emit = defineEmits<{ close: [] }>();
const palData = usePalDataStore();
const collection = useCollectionStore();
const paldex = usePaldexStore();
const { palById, activeSkillById, partnerSkillById, selfBreedOnlyIds, isLoading, error } = storeToRefs(palData);
const { entries, view: ownership } = storeToRefs(collection);
const { query, element, work, movement, sortKey, selectedStars } = storeToRefs(paldex);
const { load } = palData;
const { setOwned } = collection;
const isOpen = ref(true);
const id = computed(() => Array.isArray(route.params.id) ? route.params.id[0] : route.params.id);
const pal = computed(() => {
  const candidate = palById.value.get(id.value ?? "");
  return candidate && isSelectablePal(candidate) ? candidate : undefined;
});
const detailShareTo = computed(() => ({
  name: "paldex-detail",
  params: { id: id.value ?? "" },
  query: snapshotQuery({
    q: query.value || undefined,
    element: element.value || undefined,
    work: work.value || undefined,
    movement: movement.value === "all" ? undefined : movement.value,
    sort: sortKey.value === "dex" ? undefined : sortKey.value,
    view: ownership.value === "all" ? undefined : ownership.value,
    stars: selectedStars.value === 4 ? "4" : undefined,
  }),
}));

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
const partnerSkillBaseDescription = computed(() => (partnerSkillDetails.value?.description ?? "")
  .replace(/\s*科技\s*\d+\s*[。.]?\s*$/u, "")
  .trim());
const refinement = computed(() => pal.value?.refinement);
const selectedRank = computed(() => {
  const data = refinement.value;
  return data ? selectedStars.value === 4 ? data.fourStar : data.zeroStar : undefined;
});
const selectedWorkSuitability = computed(() => selectedRank.value?.workSuitability ?? pal.value?.workSuitability ?? {});
const selectedMetrics = computed(() => selectedRank.value?.metrics ?? []);
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const baseMetricFor = (metric: PartnerSkillRefinementMetric) => refinement.value?.zeroStar.metrics.find((candidate) =>
  candidate.technicalId === metric.technicalId
  && candidate.label === metric.label
  && candidate.target === metric.target);
const descriptionUnitFor = (baseMetric: PartnerSkillRefinementMetric) => {
  if (baseMetric.unit) return baseMetric.unit;
  if (typeof baseMetric.value !== "number") return "";
  const absoluteToken = escapeRegExp(String(Math.abs(baseMetric.value)));
  const signedToken = baseMetric.value < 0 ? `-?${absoluteToken}` : `\\+?${absoluteToken}`;
  const pattern = new RegExp(`(^|[^0-9.+-])${signedToken}(?![0-9.])\\s*(%|％|点|倍|秒|分钟|级|次|只|个)`, "g");
  const units = new Set([...partnerSkillBaseDescription.value.matchAll(pattern)]
    .map((match) => match[2] === "％" ? "%" : match[2])
    .filter((unit): unit is string => Boolean(unit)));
  return units.size === 1 ? [...units][0] ?? "" : "";
};
const changedBaseMetrics = computed(() => {
  const currentMetrics = refinement.value?.fourStar.metrics ?? [];
  return (refinement.value?.zeroStar.metrics ?? []).filter((baseMetric) => {
    const current = currentMetrics.find((metric) =>
      metric.technicalId === baseMetric.technicalId
      && metric.label === baseMetric.label
      && metric.target === baseMetric.target);
    return current && current.value !== baseMetric.value;
  });
});
const valuePlaceholder = (unit = "") => {
  if (unit === "秒" || unit === "分钟") return "指定时间";
  if (unit === "次") return "指定次数";
  if (unit === "只" || unit === "个") return "指定数量";
  if (unit === "倍") return "对应倍率";
  if (unit === "%" || unit === "％") return "对应幅度";
  if (unit === "级") return "对应等级";
  return "对应数值";
};
const partnerSkillDescription = computed(() => {
  const baseDescription = partnerSkillBaseDescription.value;
  if (selectedStars.value === 0 || !baseDescription) return baseDescription;
  let description = baseDescription;
  let replacementCount = 0;
  for (const baseMetric of changedBaseMetrics.value) {
    if (typeof baseMetric.value !== "number") continue;
    const unit = descriptionUnitFor(baseMetric);
    const token = escapeRegExp(String(baseMetric.value));
    const signedToken = baseMetric.value >= 0 ? `\\+?${token}` : token;
    const unitPattern = unit === "%"
      ? "(?:[%％])"
      : unit
        ? `(?:${escapeRegExp(unit)})`
        : "(%|％|点|倍|秒|分钟|级|次|只|个)?";
    const spacing = unit ? "\\s*" : "";
    const pattern = new RegExp(`(^|[^0-9.+-])${signedToken}(?![0-9.])${spacing}${unitPattern}`, "g");
    description = description.replace(pattern, (_match, prefix: string, observedUnit?: string) => {
      replacementCount += 1;
      return `${prefix}${valuePlaceholder(unit || observedUnit)}`;
    });
  }
  if (!replacementCount && changedBaseMetrics.value.length === 1) {
    const numeric = [...description.matchAll(/[+-]?\d+(?:\.\d+)?\s*(%|％|点|倍|秒|分钟|级|次|只|个)?/g)];
    const only = numeric.length === 1 ? numeric[0] : undefined;
    const baseMetric = changedBaseMetrics.value[0];
    const numericValue = only?.[0] ? Number.parseFloat(only[0]) : Number.NaN;
    const matchesBaseValue = baseMetric && typeof baseMetric.value === "number"
      && Math.abs(numericValue) === Math.abs(baseMetric.value);
    const knownDerivedValue = baseMetric?.technicalId === "AvoidDurationUp_PartnerSkill";
    if (only?.[0] && (matchesBaseValue || knownDerivedValue)) {
      description = description.replace(only[0], valuePlaceholder(only[1] || baseMetric?.unit));
    }
  }
  return description;
});
const displayMetrics = computed(() => {
  const metrics = new Map<string, PartnerSkillRefinementMetric>();
  const actualKinds = new Set(selectedMetrics.value
    .filter((metric) => !metric.referenceOnly)
    .map((metric) => `${metric.technicalId ?? metric.label}\u0000${metric.target ?? ""}`));
  for (const metric of selectedMetrics.value) {
    const kind = `${metric.technicalId ?? metric.label}\u0000${metric.target ?? ""}`;
    if (metric.referenceOnly && actualKinds.has(kind)) continue;
    // WhiteTiger's Ice row is a source-table reference; its actual skill and official
    // description only apply the Dragon drop bonus.
    if (pal.value?.id === "WhiteTiger" && metric.referenceOnly && metric.technicalId === "ElementAddItemDrop_Ice") continue;
    const identity = [
      metric.sourceId ?? metric.key,
      metric.technicalId ?? metric.label,
      String(metric.value),
      metric.unit ?? "",
      metric.target ?? "",
    ].join("\u0000");
    const existing = metrics.get(identity);
    if (!existing || (existing.referenceOnly && !metric.referenceOnly)) metrics.set(identity, metric);
  }
  return [...metrics.values()];
});

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
  ToSelf: "当前帕鲁", ToTrainer: "玩家", ToSelfAndTrainer: "玩家与当前帕鲁",
  ToOtomo: "队伍帕鲁", ToBaseCampPal: "据点帕鲁", ToBuildObject: "建筑",
  ToActiveOtomo: "出战帕鲁", None: "",
};
const internalMetricLabels: Record<string, string> = {
  AirDash: "空中冲刺",
  BulletHit_StackBuff: "命中时叠加增益",
  CaptureLevelUpIfTarget_Freeze: "冻结目标捕获力增加",
  CaptureLevelUpIfTarget_IvyCling: "藤蔓目标捕获力增加",
  DefeatEnemy_ActiveSkillCoolTime_Decrease: "击败敌人后缩短技能冷却",
  DefeatEnemy_StackBuff: "击败敌人后叠加增益",
  Defuser_ExplosiveSpore: "爆炸孢子防护",
  Fishing_EnemyAddDrop: "钓鱼敌人额外掉落",
  Fishing_FailedAmountDown: "钓鱼失败损失减少",
  Fishing_GoodTalentPalProbability: "高资质帕鲁概率增加",
  Fishing_ItemAddDrop: "钓鱼物品额外掉落",
  Fishing_StartProgressAdd: "钓鱼初始进度增加",
  Fishing_SuccessAmountUp: "钓鱼成功数量增加",
  FishingSalvage_ItemDrop: "打捞物品掉落",
  PlayerElementStepAttack_Leaf: "草属性踏步攻击",
  PlayerInflictEffect_AttackBurning_ApplyExplosion: "攻击燃烧目标触发爆炸",
  PlayerInflictEffect_AttackBurning_ApplyFireVortex: "攻击燃烧目标触发火焰旋涡",
  PlayerInflictEffect_AttackElectrified_ApplySpark: "攻击触电目标触发电火花",
  PlayerInflictEffect_AttackIvyCling_ApplyExplosion: "攻击藤蔓目标触发爆炸",
  PlayerInflictEffect_AttackWet_ApplyFreeze: "攻击潮湿目标施加冻结",
  PlayerInflictEffect_MeleeHitBarrier: "近战命中生成屏障",
  PlayerInflictEffect_WeakPointHit_DamageUp: "弱点命中伤害增加",
  PlayerLowHealthBlast: "低生命值爆发",
  Player_ArrowExplosion: "箭矢爆炸",
  SyncroPassiveWhenCapture: "捕获时同步被动效果",
};
const enabledMetric = new Set(["Defuser_ExplosiveSpore", "InvalidToxicGas", "LavaDamageInvalid"]);
const elementToggle = /^Element(?:Dark|Dragon|Earth|Electricity|Fire|Ice|Leaf|Neutral|Water)$/;
const inferredMetricUnit = (metric: PartnerSkillRefinementMetric) => {
  if (metric.unit) return metric.unit;
  const baseMetric = baseMetricFor(metric);
  return baseMetric ? descriptionUnitFor(baseMetric) : "";
};
const metricLabel = (metric: PartnerSkillRefinementMetric) => {
  const workMetric = metric.label.match(/^([a-z]+)适应性增加$/);
  if (workMetric?.[1]) return `${workName(workMetric[1])}适应性增加`;
  return internalMetricLabels[metric.technicalId ?? ""] ?? metric.label.replace(/^内部效果：/, "特殊效果：");
};
const metricValue = (metric: PartnerSkillRefinementMetric) => {
  const technicalId = metric.technicalId ?? "";
  if (enabledMetric.has(technicalId) || (elementToggle.test(technicalId) && Number(metric.value) === 1)) return "生效";
  const unit = inferredMetricUnit(metric);
  const value = String(metric.value).replace(/\(w([\d.]+)\)/g, "（权重 $1）");
  return `${value}${unit === "%" ? "%" : unit ? ` ${unit}` : ""}`;
};
const metricTarget = (metric: PartnerSkillRefinementMetric) => metric.target
  ? refinementTargetNames[metric.target] ?? metric.target
  : "";
const contextTokens: Record<string, string> = {
  PalUpgradeStone: "帕鲁之魂", CopperOre: "金属矿", Chromium: "铬铁矿", Sulfur: "硫磺", Coal: "石炭",
  Wood_WorldTree: "世界树木材", Wood_Ancient: "远古木材", Wood_Fine: "优质木材", Fiber: "纤维", Wood: "木材", Money: "金币",
  MaterialOre: "矿石材料", MaterialStone: "石材", WeaponShotgun: "霰弹枪",
  WeaponMelee: "近战武器", WeaponBow: "弓", Armor: "防具", Food: "食物", Weapon: "武器",
};
const metricContext = (metric: PartnerSkillRefinementMetric) => {
  let context = metric.context ?? "";
  if (context.includes("AssaultRifle_Default1")) return "物品：全自动武器";
  if (context.includes("LaserRifle")) return "物品：能量武器";
  if (context.includes("PalUpgradeStone")) return "物品：帕鲁之魂";
  for (const [token, label] of Object.entries(contextTokens).sort((a, b) => b[0].length - a[0].length)) {
    context = context.replaceAll(token, label);
  }
  return context;
};

function openCalculator(kind: "parent" | "target") {
  if (!pal.value) return;
  router.push(kind === "parent"
    ? { path: "/breeding", query: snapshotQuery({ a: pal.value.id }) }
    : { path: "/breeding", query: snapshotQuery({ mode: "pairs", target: pal.value.id }) });
}

function closeOnEscape(event: KeyboardEvent) {
  if (event.key === "Escape") isOpen.value = false;
}

function markDrawerNonModal() {
  // Naive hardcodes aria-modal=true; this drawer intentionally leaves the Pal list interactive.
  document.querySelector<HTMLElement>(".paldex-drawer")?.setAttribute("aria-modal", "false");
}

onMounted(() => {
  window.addEventListener("keydown", closeOnEscape);
  void nextTick(() => {
    markDrawerNonModal();
    document.querySelector<HTMLButtonElement>(".paldex-drawer__close")?.focus();
  });
});
onUnmounted(() => window.removeEventListener("keydown", closeOnEscape));
</script>

<template>
  <NDrawer
    class="paldex-drawer"
    :aria-label="pal ? `${pal.names.zh}详细图鉴` : '帕鲁详细图鉴'"
    :show="isOpen"
    placement="right"
    width="var(--paldex-drawer-width)"
    :show-mask="false"
    :block-scroll="false"
    :trap-focus="false"
    :auto-focus="true"
    :close-on-esc="false"
    @update:show="isOpen = $event"
    @after-enter="markDrawerNonModal"
    @after-leave="emit('close')"
  >
    <NDrawerContent
      :title="pal ? `${pal.names.zh}详细图鉴` : '帕鲁详细图鉴'"
      :header-style="{ padding: 0 }"
      :body-content-style="{ padding: 0 }"
    >
      <template #header>
        <header class="paldex-drawer__topbar">
          <div><small>详细图鉴</small><strong>{{ pal?.names.zh ?? "帕鲁" }}</strong></div>
          <div class="paldex-drawer__actions">
            <ShareButton
              v-if="pal"
              :to="detailShareTo"
              label="分享详情"
              :title="`分享${pal.names.zh}的帕鲁详情`"
              :text="`查看${pal.names.zh}的详细图鉴`"
            />
            <NButton class="paldex-drawer__close" circle quaternary aria-label="关闭详细图鉴" @click="isOpen = false">×</NButton>
          </div>
        </header>
      </template>
    <DataState :is-loading :error @retry="load">
      <div v-if="pal" class="paldex-detail paldex-drawer__content">
        <fieldset v-if="selectedRank" class="refinement-selector">
          <legend>精炼星级</legend>
          <NRadioGroup v-model:value="selectedStars" class="mini-tabs" name="refinement-stars" aria-label="精炼星级">
            <NRadioButton class="mini-tabs__option" :value="0">0 星</NRadioButton>
            <NRadioButton class="mini-tabs__option" :value="4">4 星</NRadioButton>
          </NRadioGroup>
          <p class="refinement-selector__summary" aria-live="polite">当前 {{ selectedStars }} 星 · 伙伴技能 Lv.{{ selectedRank.partnerSkillLevel }} · 累计消耗 {{ selectedRank.consumedCopies }} 只同种帕鲁</p>
        </fieldset>
        <EggshellCard tone="sky" class="detail-hero">
          <div class="detail-hero__art"><PalIcon :pal size="large" /></div>
          <div class="detail-hero__copy">
            <p class="eyebrow">{{ formatDex(pal) }} · {{ pal.id }}</p>
            <h1>{{ pal.names.zh }}</h1><p class="detail-english">{{ pal.names.en }}</p>
            <div class="tag-row"><span v-for="item in pal.elements" :key="item" class="tag">{{ elementName(item) }}</span><span v-if="pal.variant" class="tag tag--coral">亚种</span><span v-if="selfBreedOnlyIds.has(pal.id)" class="self-breed-badge" title="配种时只能由同种帕鲁产出">仅可自交</span></div>
            <div class="detail-actions">
              <NButton type="primary" round @click="openCalculator('parent')">设为亲本 A</NButton>
              <NButton secondary round @click="openCalculator('target')">查全部父母组合</NButton>
            </div>
          </div>
          <fieldset class="detail-owned">
            <legend>拥有状态</legend>
            <NCheckbox class="owned-toggle" :class="{ 'owned-toggle--checked': isOwned }" :checked="isOwned" @update:checked="setOwned(pal.id, $event)"><span class="sr-only">{{ pal.names.zh }}</span>已拥有</NCheckbox>
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
          </EggshellCard>
          <EggshellCard class="partner-skill-card">
            <p class="eyebrow">伙伴技能 · {{ selectedStars }} 星</p>
            <h2>{{ partnerSkillDetails?.name || pal.partnerSkill || "暂无" }}</h2>
            <p v-if="partnerSkillDescription" class="muted-copy partner-skill-description">{{ partnerSkillDescription }}</p>
            <h3 v-if="displayMetrics.length" class="partner-metrics-title">{{ selectedStars }} 星具体参数</h3>
            <ul v-if="displayMetrics.length" class="level-list partner-metric-list">
              <li v-for="(metric, index) in displayMetrics" :key="`${metric.key}-${index}`">
                <span>{{ metricLabel(metric) }}<small v-if="metricContext(metric)">{{ metricContext(metric) }}</small></span>
                <strong>{{ metricValue(metric) }}<small v-if="metricTarget(metric)">{{ metricTarget(metric) }}</small></strong>
              </li>
            </ul>
            <p v-else-if="!partnerSkillDescription" class="muted-copy">当前星级没有可量化参数。</p>
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
      <NEmpty v-else class="empty-state" description="图鉴中没有这个帕鲁。" />
    </DataState>
    </NDrawerContent>
  </NDrawer>
</template>
