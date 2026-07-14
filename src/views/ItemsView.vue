<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import {
  NAlert, NButton, NDrawer, NDrawerContent, NEmpty, NInput, NInputNumber,
  NSelect, NTabPane, NTabs,
} from "naive-ui";
import { pinyin } from "pinyin-pro";
import { useRoute, useRouter } from "vue-router";
import DataState from "@/components/DataState.vue";
import EggshellCard from "@/components/EggshellCard.vue";
import ItemIcon from "@/components/ItemIcon.vue";
import PageIntro from "@/components/PageIntro.vue";
import { calculateItemPlanForView, itemCraftIssueText } from "@/composables/itemCalculatorAdapter";
import type { ItemCraftIssue } from "@/core/itemCalculator";
import { useItemDataStore } from "@/stores/itemData";
import { usePalDataStore } from "@/stores/palData";
import type { ItemRecipeRecord, ItemRecord } from "@/stores/itemData";

type PageMode = "catalog" | "calculator";
type ChoiceRequiredIssue = Extract<ItemCraftIssue, { kind: "choice-required" }>;

const route = useRoute();
const router = useRouter();
const itemData = useItemDataStore();
const palData = usePalDataStore();
const {
  items, recipes, itemById, recipeById, recipesByProduct, recipesByMaterial, isLoading, error,
} = storeToRefs(itemData);
const { palById, activeSkillById } = storeToRefs(palData);
const { load } = itemData;

const mode = ref<PageMode>("catalog");
const query = ref("");
const category = ref("");
const visibleLimit = ref(120);
const selectedItemId = ref("");
const pendingCalculatorItemId = ref("");
const targetItemId = ref("");
const quantity = ref(1);
const recipeChoices = ref<Record<string, string>>({});

const TYPE_A_LABELS: Readonly<Record<string, string>> = {
  Accessory: "饰品",
  Ammo: "弹药",
  Armor: "防具",
  Blueprint: "图纸",
  CaptureItemModifier: "捕捉模块",
  Consume: "消耗品",
  Essential: "重要道具",
  Food: "食物",
  Glider: "滑翔伞",
  Material: "材料",
  SpecialWeapon: "特殊武器",
  Weapon: "武器",
};
const TYPE_B_LABELS: Readonly<Record<string, string>> = {
  Accessory: "饰品",
  ArmorBody: "身体防具",
  ArmorHead: "头部防具",
  Blueprint: "图纸",
  CaptureItemModifier: "捕捉模块",
  ConsumeBullet: "弹药",
  ConsumeFishingBait: "钓饵",
  ConsumeGainStatusPoints: "属性点药剂",
  ConsumeOther: "其他消耗品",
  ConsumePalAwakening: "帕鲁觉醒道具",
  ConsumePalGainExp: "帕鲁经验道具",
  ConsumePalGainFriendshipPoint: "亲密度道具",
  ConsumePalLevelUp: "帕鲁升级道具",
  ConsumePalRankUp: "帕鲁升星道具",
  ConsumePalRevive: "帕鲁复活道具",
  ConsumePalTalentUp: "帕鲁潜力药剂",
  ConsumePalWorkSuitabilityUp: "工作适应性药剂",
  ConsumePassiveSkillChange: "词条道具",
  ConsumeTechnologyBook: "科技书",
  ConsumeTreasureMap: "藏宝图",
  ConsumeWazaMachine: "技能果实",
  ConsumeWorldTreeHolyWater: "世界树圣水",
  ConsumeAncientTechnologyBook: "古代科技书",
  Drug: "药品",
  Essential: "重要道具",
  Essential_BossReward: "首领证明",
  Essential_AdditionalInventory: "背包扩充",
  Essential_Lamp: "照明装备",
  Essential_PalGear: "帕鲁装备",
  Essential_PassiveSkillChange: "词条道具",
  Essential_UnlockPlayerFuture: "永久解锁道具",
  FoodDishFish: "鱼料理",
  FoodDishMeat: "肉料理",
  FoodDishVegetable: "蔬菜料理",
  FoodFish: "鱼类",
  FoodMeat: "肉类",
  FoodVegetable: "食材",
  Glider: "滑翔伞",
  MaterialIngot: "金属锭",
  MaterialJewelry: "贵重品",
  MaterialMonster: "帕鲁材料",
  MaterialOre: "矿石",
  MaterialPalEgg: "帕鲁蛋",
  MaterialProccessing: "加工材料",
  MaterialStone: "石材",
  MaterialWood: "木材",
  Medicine: "药品",
  Money: "货币",
  ReturnToBaseCamp: "回城道具",
  Shield: "护盾",
  SPWeaponCaptureBall: "特殊帕鲁球",
  WeaponAssaultRifle: "突击步枪",
  WeaponBow: "弓",
  WeaponCrossbow: "十字弓",
  WeaponFlameThrower: "火焰喷射器",
  WeaponFishingRod: "鱼竿",
  WeaponGatlingGun: "机枪",
  WeaponGrapplingGun: "抓钩枪",
  WeaponHandgun: "手枪",
  WeaponMelee: "近战武器",
  WeaponMetalDetector: "金属探测器",
  WeaponRocketLauncher: "重型武器",
  WeaponShotgun: "霰弹枪",
  WeaponThrowObject: "投掷物",
};

const MAP_OBJECT_LABELS: Readonly<Record<string, string>> = {
  Altar: "祭坛",
  AncientBlastFurnace: "古代熔炉",
  AncientWorkBench: "古代作业台",
  BlastFurnace3: "高级熔炉",
  BlastFurnace4: "大型高级熔炉",
  BreedFarm: "配种牧场",
  BuildableGoddessStatue: "力量石像",
  Crusher: "破碎机",
  Factory_Hard_01: "高级生产设施 1",
  Factory_Hard_02: "高级生产设施 2",
  Factory_Hard_03: "高级生产设施 3",
  Factory_Hard_04: "高级生产设施 4",
  HatchingPalEgg: "帕鲁蛋孵化器",
  OilPump: "原油提取设施",
  OperatingTable: "手术台",
  Trap_MineFreeze: "冰冻地雷",
  WeaponFactory_Dirty_01: "武器生产设施 1",
  WeaponFactory_Dirty_02: "武器生产设施 2",
  WeaponFactory_Dirty_03: "武器生产设施 3",
  WeaponFactory_Dirty_04: "武器生产设施 4",
  WorkBench: "作业台",
  WorkBench_SkillUnlock: "技能解锁作业台",
};

const UI_COMMON_LABELS: Readonly<Record<string, string>> = {
  ADDITIONAL_EFFECT_Poison: "中毒",
  COMMON_CONDITION_NAME_Bulimia: "暴食症",
  COMMON_CONDITION_NAME_Cold: "感冒",
  COMMON_CONDITION_NAME_DepressionSprain: "抑郁症",
  COMMON_CONDITION_NAME_Fracture: "骨折",
  COMMON_CONDITION_NAME_GastricUlcer: "胃溃疡",
  COMMON_CONDITION_NAME_Sprain: "扭伤",
  COMMON_CONDITION_NAME_Weakness: "衰弱",
  COMMON_ELEMENT_NAME_Dark: "暗",
  COMMON_ELEMENT_NAME_Dragon: "龙",
  COMMON_ELEMENT_NAME_Earth: "地",
  COMMON_ELEMENT_NAME_Electricity: "雷",
  COMMON_ELEMENT_NAME_Fire: "火",
  COMMON_ELEMENT_NAME_Ice: "冰",
  COMMON_ELEMENT_NAME_Leaf: "草",
  COMMON_ELEMENT_NAME_Normal: "无",
  COMMON_ELEMENT_NAME_Water: "水",
  COMMON_STATUS_DEFENCE: "防御",
  COMMON_STATUS_RANGE_Attack: "攻击",
  COMMON_STATUS_RANGE_ATTACK: "攻击",
  COMMON_WORK_SUITABILITY_Collection: "采集",
  COMMON_WORK_SUITABILITY_Cool: "冷却",
  COMMON_WORK_SUITABILITY_Deforest: "伐木",
  COMMON_WORK_SUITABILITY_EmitFlame: "生火",
  COMMON_WORK_SUITABILITY_GenerateElectricity: "发电",
  COMMON_WORK_SUITABILITY_Handcraft: "手工作业",
  COMMON_WORK_SUITABILITY_Mining: "采矿",
  COMMON_WORK_SUITABILITY_MonsterFarm: "牧场",
  COMMON_WORK_SUITABILITY_ProductMedicine: "制药",
  COMMON_WORK_SUITABILITY_Seeding: "播种",
  COMMON_WORK_SUITABILITY_Transport: "搬运",
  COMMON_WORK_SUITABILITY_Watering: "浇水",
  RARITY_COMMON: "普通",
  RARITY_EPIC: "史诗",
  RARITY_LEGENDARY: "传说",
  RARITY_RARE: "稀有",
  RARITY_UNCOMMON: "精良",
};

const ELEMENT_ICON_LABELS: Readonly<Record<string, string>> = {
  ElemIcon_Dark: "🌙",
  ElemIcon_Dragon: "🐉",
  ElemIcon_Electric: "⚡",
  ElemIcon_Fire: "🔥",
  ElemIcon_Grass: "🌿",
  ElemIcon_Ground: "⛰️",
  ElemIcon_Ice: "❄️",
  ElemIcon_Neutral: "⚪",
  ElemIcon_Water: "💧",
};

const RARITY_LABELS: Readonly<Record<number, string>> = {
  0: "普通",
  1: "精良",
  2: "稀有",
  3: "史诗",
  4: "传说",
  5: "特殊",
};

const queryValue = (value: unknown) => Array.isArray(value) ? value[0] : value;
const positiveInteger = (value: unknown) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
};

watch(() => route.query, (next) => {
  mode.value = queryValue(next.mode) === "calculator" ? "calculator" : "catalog";
  const target = queryValue(next.target);
  targetItemId.value = typeof target === "string" ? target.slice(0, 160) : "";
  quantity.value = positiveInteger(queryValue(next.qty));
}, { immediate: true });

watch([mode, targetItemId, quantity], ([nextMode, target, nextQuantity]) => {
  const nextQuery = nextMode === "calculator"
    ? { mode: "calculator", ...(target ? { target } : {}), qty: String(nextQuantity) }
    : {};
  const current = JSON.stringify(route.query);
  if (current !== JSON.stringify(nextQuery)) void router.replace({ query: nextQuery });
}, { flush: "post" });

watch([query, category], () => { visibleLimit.value = 120; });
watch([items, targetItemId], () => {
  if (targetItemId.value && items.value.length && !itemById.value.has(targetItemId.value))
    targetItemId.value = "";
});

void load();

const itemName = (item: ItemRecord | undefined) => item?.names.zh || item?.names.en || item?.id || "未知道具";
const itemEnglishName = (item: ItemRecord) => item.names.en && item.names.en !== item.names.zh ? item.names.en : "";
const palNamesByNormalizedId = computed(() => new Map(
  [...palById.value].map(([id, pal]) => [id.toLocaleLowerCase(), pal.names.zh]),
));
const activeSkillNamesByNormalizedId = computed(() => new Map(
  [...activeSkillById.value].map(([id, skill]) => [id.toLocaleLowerCase(), skill.names.zh]),
));
const humanizeGameId = (id: string) => id
  .replace(/^COMMON_(?:ELEMENT_NAME|STATUS|WORK_SUITABILITY|CONDITION_NAME)_/i, "")
  .replaceAll("_", " ")
  .replace(/([a-z])([A-Z])/g, "$1 $2")
  .trim();
const readableReference = (kind: string, id: string) => {
  const normalizedKind = kind.toLocaleLowerCase();
  if (normalizedKind === "itemname") {
    const referencedItem = itemById.value.get(id);
    if (referencedItem) return itemName(referencedItem);
  }
  if (normalizedKind === "charactername") {
    const name = palNamesByNormalizedId.value.get(id.toLocaleLowerCase());
    if (name) return name;
  }
  if (normalizedKind === "activeskillname") {
    const name = activeSkillNamesByNormalizedId.value.get(id.toLocaleLowerCase());
    if (name) return name;
  }
  if (normalizedKind === "mapobjectname") return MAP_OBJECT_LABELS[id] ?? humanizeGameId(id);
  if (normalizedKind === "uicommon") return UI_COMMON_LABELS[id] ?? humanizeGameId(id);
  if (normalizedKind === "img") return ELEMENT_ICON_LABELS[id] ?? "";
  return humanizeGameId(id);
};
const plainGameText = (value: string) => value
  .replace(/<([a-z][\w]*)\b[^>]*\bid=\|([^|]+)\|[^>]*\/>/gi,
    (_match, kind: string, id: string) => readableReference(kind, id))
  .replace(/<[^>]+>/g, "")
  .replace(/\r\n?/g, "\n")
  .replace(/[^\S\n]+/g, " ")
  .replace(/ *\n */g, "\n")
  .replace(/\n{3,}/g, "\n\n")
  .trim();
const itemDescription = (item: ItemRecord) => {
  const value = item.description?.zh || item.description?.en;
  return value ? plainGameText(value) : "暂无说明。";
};
const typeALabel = (value: string | undefined) => value ? TYPE_A_LABELS[value] ?? value : "未分类";
const typeBLabel = (value: string | undefined) => value ? TYPE_B_LABELS[value] : undefined;
const categoryLabel = (item: ItemRecord) => {
  const broad = typeALabel(item.typeA);
  const narrow = typeBLabel(item.typeB);
  return narrow && narrow !== broad ? `${broad} · ${narrow}` : broad;
};
const isItemFlagRecord = (flags: ItemRecord["flags"]): flags is Readonly<Record<string, unknown>> =>
  Boolean(flags) && !Array.isArray(flags);
const isCatalogItem = (item: ItemRecord) => {
  if (!isItemFlagRecord(item.flags)) return true;
  return item.flags.legalInGame !== false;
};
const pinyinInitials = (value: string) => pinyin(value, {
  pattern: "first", toneType: "none", type: "array", nonZh: "removed",
}).join("").toLocaleLowerCase();
const matchesSearch = (item: ItemRecord) => {
  const needle = query.value.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [
    item.id, item.names.zh, item.names.en, item.names.ja,
    item.description?.zh, item.description?.en, pinyinInitials(item.names.zh ?? ""),
  ].some((value) => value?.toLocaleLowerCase().includes(needle));
};

const catalogItems = computed(() => items.value.filter(isCatalogItem));
const categoryOptions = computed(() => [
  { label: "全部类别", value: "" },
  ...[...new Set(catalogItems.value.map((item) => item.typeA).filter((value): value is string => Boolean(value)))]
    .sort((a, b) => typeALabel(a).localeCompare(typeALabel(b), "zh-CN"))
    .map((value) => ({ label: typeALabel(value), value })),
]);
const filteredItems = computed(() => catalogItems.value
  .filter((item) => (!category.value || item.typeA === category.value) && matchesSearch(item))
  .sort((a, b) => (a.sortId ?? Number.MAX_SAFE_INTEGER) - (b.sortId ?? Number.MAX_SAFE_INTEGER)
    || itemName(a).localeCompare(itemName(b), "zh-CN")
    || a.id.localeCompare(b.id, "en")));
const visibleItems = computed(() => filteredItems.value.slice(0, visibleLimit.value));
const craftableCount = computed(() => catalogItems.value
  .filter((item) => recipesByProduct.value.has(item.id)).length);

const itemOptions = computed(() => catalogItems.value
  .map((item) => ({
    value: item.id,
    label: `${itemName(item)}${itemEnglishName(item) ? ` · ${itemEnglishName(item)}` : ""} · ${item.id}`,
  }))
  .sort((a, b) => a.label.localeCompare(b.label, "zh-CN")));
const selectedItem = computed(() => itemById.value.get(selectedItemId.value));
const selectedItemRecipes = computed(() => selectedItem.value
  ? recipesByProduct.value.get(selectedItem.value.id) ?? []
  : []);
const selectedItemUses = computed(() => selectedItem.value
  ? recipesByMaterial.value.get(selectedItem.value.id) ?? []
  : []);
const targetItem = computed(() => itemById.value.get(targetItemId.value));
const targetRecipes = computed(() => recipesByProduct.value.get(targetItemId.value) ?? []);
const targetRecipeChoice = computed({
  get: () => recipeChoices.value[targetItemId.value] ?? "",
  set: (value: string) => {
    recipeChoices.value = { ...recipeChoices.value, [targetItemId.value]: value };
  },
});
const targetRecipeOptions = computed(() => targetRecipes.value.map((recipe, index) => ({
  value: recipe.id,
  label: recipeChoiceLabel(recipe, index),
})));

const calculation = computed(() => targetItem.value
  ? calculateItemPlanForView({
    itemId: targetItem.value.id,
    quantity: positiveInteger(quantity.value),
    recipeChoices: recipeChoices.value,
  }, items.value, recipes.value)
  : undefined);
const plan = computed(() => calculation.value?.ok ? calculation.value.plan : undefined);
const calculationIssues = computed(() => calculation.value?.issues
  .filter((issue) => issue.kind !== "choice-required")
  .map(itemCraftIssueText) ?? []);
const recipeChoiceIssues = computed<ChoiceRequiredIssue[]>(() => calculation.value?.issues
  .filter((issue): issue is ChoiceRequiredIssue => issue.kind === "choice-required" && issue.itemId !== targetItemId.value) ?? []);

function formatNumber(value: number | undefined) {
  return value === undefined ? "—" : value.toLocaleString("zh-CN", { maximumFractionDigits: 3 });
}

function formatRarity(item: ItemRecord) {
  const value = item.rarity ?? item.rank;
  if (typeof value === "number") return RARITY_LABELS[value] ? `${RARITY_LABELS[value]} · ${value}` : formatNumber(value);
  return value || "—";
}

function materialLabel(material: { itemId: string; count?: number; quantity?: number }) {
  return `${itemName(itemById.value.get(material.itemId))} × ${formatNumber(material.count ?? material.quantity)}`;
}

function recipeChoiceLabel(recipe: ItemRecipeRecord | undefined, index: number) {
  if (!recipe) return `配方 ${index + 1}`;
  const ingredients = recipe.materials.map(materialLabel).join(" ＋ ") || "无需材料";
  return `配方 ${index + 1} · ${ingredients} → ${itemName(itemById.value.get(recipe.product.itemId))} × ${recipe.product.count}`;
}

function recipeMeta(recipe: ItemRecipeRecord) {
  const parts = [`产出 ${recipe.product.count}`];
  if (recipe.baseSeconds !== undefined) parts.push(`基准工作量 ${formatNumber(recipe.baseSeconds)}`);
  if (recipe.workAmountRaw !== undefined) parts.push(`原始值 ${formatNumber(recipe.workAmountRaw)}`);
  if (recipe.technologyUnlocks?.length) parts.push(`科技解锁 ${recipe.technologyUnlocks.length} 条`);
  return parts.join(" · ");
}

function openDetails(item: ItemRecord) {
  selectedItemId.value = item.id;
}

function calculateItem(item: ItemRecord) {
  pendingCalculatorItemId.value = item.id;
  selectedItemId.value = "";
}

function finishPendingCalculator() {
  if (!pendingCalculatorItemId.value) return;
  targetItemId.value = pendingCalculatorItemId.value;
  pendingCalculatorItemId.value = "";
  mode.value = "calculator";
}

function setRecipeChoice(itemId: string, recipeId: string) {
  recipeChoices.value = { ...recipeChoices.value, [itemId]: recipeId };
}
</script>

<template>
  <main class="page-shell page-shell--items">
    <PageIntro eyebrow="资料库" title="道具工坊" description="查询道具参数与配方，或把目标数量展开成完整的材料清单和制作步骤。" />
    <DataState :is-loading :error loading-text="正在加载道具与配方数据…" @retry="load">
      <NTabs
        v-model:value="mode"
        class="segmented-control segmented-control--two items-mode-tabs"
        type="segment"
        aria-label="选择道具功能"
        :pane-wrapper-style="{ display: 'none' }"
        :tab-style="{ flex: '1 1 0', justifyContent: 'center', minWidth: 0 }"
      >
        <NTabPane name="catalog"><template #tab><span class="mode-tab"><strong>道具图鉴</strong><small>查参数与配方</small></span></template></NTabPane>
        <NTabPane name="calculator"><template #tab><span class="mode-tab"><strong>材料计算</strong><small>展开制作需求</small></span></template></NTabPane>
      </NTabs>

      <section v-if="mode === 'catalog'" class="items-catalog" aria-label="道具图鉴">
        <dl class="item-summary" aria-label="道具数据概览">
          <div><dt>收录道具</dt><dd>{{ catalogItems.length }}</dd></div>
          <div><dt>可制作道具</dt><dd>{{ craftableCount }}</dd></div>
          <div><dt>配方记录</dt><dd>{{ recipes.length }}</dd></div>
        </dl>
        <section class="filter-bar filter-bar--items" aria-label="筛选道具">
          <label class="field filter-search">
            <span class="field__label">搜索道具</span>
            <NInput v-model:value="query" clearable size="large" placeholder="中文 / 拼音首字母 / English / 内部 ID" :input-props="{ type: 'search', 'aria-label': '搜索道具' }" />
          </label>
          <label class="field field--compact">
            <span class="field__label">类别</span>
            <NSelect v-model:value="category" :options="categoryOptions" :fallback-option="false" filterable size="large" :input-props="{ 'aria-label': '道具类别' }" />
          </label>
        </section>
        <p class="result-note" role="status" aria-live="polite">找到 {{ filteredItems.length }} 个道具 · 当前显示 {{ visibleItems.length }} 个</p>
        <ul v-if="visibleItems.length" class="item-grid">
          <li v-for="item in visibleItems" :key="item.id">
            <button type="button" class="item-card" :aria-label="`查看${itemName(item)}详情`" @click="openDetails(item)">
              <ItemIcon :item size="large" />
              <span class="item-card__body">
                <span class="item-card__identity"><strong>{{ itemName(item) }}</strong><small>{{ itemEnglishName(item) || item.id }}</small></span>
                <span class="item-card__category">{{ categoryLabel(item) }}</span>
                <span class="item-card__description">{{ itemDescription(item) }}</span>
                <span class="item-card__meta">
                  <span v-if="recipesByProduct.has(item.id)">🛠️ {{ recipesByProduct.get(item.id)?.length }} 个配方</span>
                  <span v-if="item.baseSellPrice !== undefined">💰 {{ formatNumber(item.baseSellPrice) }}</span>
                  <span v-if="item.weight !== undefined">⚖️ {{ formatNumber(item.weight) }}</span>
                </span>
              </span>
            </button>
          </li>
        </ul>
        <NEmpty v-else class="empty-state" description="没有匹配的道具。" />
        <div v-if="visibleItems.length < filteredItems.length" class="item-load-more">
          <NButton secondary round @click="visibleLimit += 120">再显示 {{ Math.min(120, filteredItems.length - visibleItems.length) }} 个</NButton>
        </div>
      </section>

      <section v-else class="item-calculator" aria-label="道具材料计算器">
        <EggshellCard tone="sky" class="item-calculator__form">
          <div class="item-calculator__fields">
            <label class="field">
              <span class="field__label">目标道具</span>
              <NSelect v-model:value="targetItemId" :options="itemOptions" :fallback-option="false" filterable size="large" placeholder="搜索并选择道具" :input-props="{ 'aria-label': '目标道具' }" />
            </label>
            <label class="field item-quantity-field">
              <span class="field__label">目标数量</span>
              <NInputNumber :value="quantity" :min="1" :max="999999999" :precision="0" size="large" aria-label="目标数量" @update:value="quantity = positiveInteger($event)" />
            </label>
            <label v-if="targetRecipes.length > 1" class="field">
              <span class="field__label">目标配方</span>
              <NSelect v-model:value="targetRecipeChoice" :options="targetRecipeOptions" :fallback-option="false" size="large" placeholder="请选择配方" :input-props="{ 'aria-label': '目标配方' }" />
            </label>
          </div>
          <p class="muted-copy">有多个配方时需要明确选择；结果会按每批产量自动向上取整。</p>
        </EggshellCard>

        <NEmpty v-if="!targetItem" class="empty-state" description="选择目标道具后，这里会显示基础材料和逐步制作清单。" />
        <template v-else>
          <section v-if="recipeChoiceIssues.length" class="item-choice-list" aria-label="选择中间材料配方">
            <label v-for="issue in recipeChoiceIssues" :key="issue.itemId" class="field">
              <span class="field__label">{{ itemName(itemById.get(issue.itemId)) }}的配方</span>
              <NSelect
                :value="recipeChoices[issue.itemId]"
                :options="issue.recipeIds.map((recipeId, index) => ({ label: recipeChoiceLabel(recipeById.get(recipeId), index), value: recipeId }))"
                :fallback-option="false"
                size="large"
                placeholder="请选择配方"
                :input-props="{ 'aria-label': `${itemName(itemById.get(issue.itemId))}的配方` }"
                @update:value="setRecipeChoice(issue.itemId, $event)"
              />
            </label>
          </section>
          <NAlert v-for="issue in calculationIssues" :key="issue" class="item-plan-issue" type="warning" :show-icon="false">{{ issue }}</NAlert>
          <template v-if="plan">
            <dl class="item-plan-summary" aria-label="计算结果概览">
              <div><dt>目标</dt><dd>{{ itemName(targetItem) }} × {{ quantity }}</dd></div>
              <div><dt>实际产出</dt><dd>{{ formatNumber(plan.producedQuantity) }}</dd></div>
              <div><dt>制作步骤</dt><dd>{{ plan.steps.length }}</dd></div>
              <div><dt>总基准工作量</dt><dd>{{ formatNumber(plan.totalWorkAmount) }}{{ plan.workAmountComplete ? "" : "（部分）" }}</dd></div>
              <div v-if="plan.saleValue !== undefined"><dt>目标售价合计</dt><dd>{{ formatNumber(plan.saleValue) }}</dd></div>
            </dl>
            <p class="muted-copy">基准工作量按游戏原始 WorkAmount ÷ 100 汇总，未计帕鲁工作速度、设施加成和世界倍率。</p>

            <div class="item-plan-layout">
              <section class="item-plan-panel" aria-labelledby="base-material-title">
                <header><p class="eyebrow">最终需求</p><h2 id="base-material-title">基础材料</h2></header>
                <ul v-if="plan.baseMaterials.length" class="item-material-list">
                  <li v-for="material in plan.baseMaterials" :key="material.itemId">
                    <ItemIcon :item="itemById.get(material.itemId)" size="small" />
                    <span><strong>{{ itemName(itemById.get(material.itemId)) }}</strong><small>{{ material.itemId }}</small></span>
                    <b>× {{ formatNumber(material.quantity) }}</b>
                  </li>
                </ul>
                <p v-else class="muted-copy">该目标本身就是基础材料，或无需额外材料。</p>
              </section>

              <section class="item-plan-panel" aria-labelledby="craft-step-title">
                <header><p class="eyebrow">由下到上</p><h2 id="craft-step-title">制作步骤</h2></header>
                <ol v-if="plan.steps.length" class="item-step-list">
                  <li v-for="(step, index) in [...plan.steps].reverse()" :key="step.recipeId">
                    <span class="item-step-list__number">{{ index + 1 }}</span>
                    <div>
                      <strong>{{ itemName(itemById.get(step.itemId)) }} × {{ formatNumber(step.producedQuantity) }}</strong>
                      <small>{{ step.batchCount }} 批 · 需要 {{ formatNumber(step.requiredQuantity) }} · 余 {{ formatNumber(step.surplusQuantity) }}</small>
                      <p>{{ step.ingredients.map(materialLabel).join(" ＋ ") || "无需材料" }}</p>
                    </div>
                  </li>
                </ol>
                <p v-else class="muted-copy">没有可展开的制作配方。</p>
              </section>
            </div>
          </template>
        </template>
      </section>
    </DataState>

    <NDrawer
      class="item-drawer"
      :show="Boolean(selectedItem)"
      placement="right"
      width="var(--item-drawer-width)"
      @update:show="!$event && (selectedItemId = '')"
      @after-leave="finishPendingCalculator"
    >
      <NDrawerContent :title="selectedItem ? `${itemName(selectedItem)} · 道具详情` : '道具详情'">
        <div v-if="selectedItem" class="item-detail">
          <header class="item-detail__hero">
            <ItemIcon :item="selectedItem" size="large" />
            <div><p class="eyebrow">{{ categoryLabel(selectedItem) }}</p><h2>{{ itemName(selectedItem) }}</h2><p>{{ itemEnglishName(selectedItem) || selectedItem.id }}</p></div>
          </header>
          <p class="item-detail__description">{{ itemDescription(selectedItem) }}</p>
          <dl class="item-detail__stats">
            <div><dt>内部 ID</dt><dd><code>{{ selectedItem.id }}</code></dd></div>
            <div><dt>基础出售价</dt><dd>{{ formatNumber(selectedItem.baseSellPrice) }}</dd></div>
            <div><dt>重量</dt><dd>{{ formatNumber(selectedItem.weight) }}</dd></div>
            <div><dt>堆叠上限</dt><dd>{{ formatNumber(selectedItem.maxStack) }}</dd></div>
            <div><dt>稀有度</dt><dd>{{ formatRarity(selectedItem) }}</dd></div>
            <div><dt>作为材料</dt><dd>{{ selectedItemUses.length }} 个配方</dd></div>
          </dl>
          <p v-if="selectedItem.baseSellPrice !== undefined" class="item-detail__sell-note">
            基础出售价来自游戏数据；实际交易价格可能受玩家词条和其他交易效果影响。
          </p>
          <NButton type="primary" round block @click="calculateItem(selectedItem)">计算此道具</NButton>
          <section class="item-detail__recipes">
            <h3>制作配方</h3>
            <article v-for="recipe in selectedItemRecipes" :key="recipe.id" class="item-recipe-card">
              <header><strong>{{ recipe.id }}</strong><small>{{ recipeMeta(recipe) }}</small></header>
              <p>{{ recipe.materials.map(materialLabel).join(" ＋ ") || "无需材料" }}</p>
            </article>
            <p v-if="!selectedItemRecipes.length" class="muted-copy">当前数据中没有该道具的制作配方。</p>
          </section>
        </div>
      </NDrawerContent>
    </NDrawer>
  </main>
</template>
