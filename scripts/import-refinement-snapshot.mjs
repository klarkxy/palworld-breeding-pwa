import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceDir = resolve(process.argv[2] ?? "");
const output = resolve(root, "scripts/vendor/palworld/refinement-v1.json");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const sha256 = async (path) => createHash("sha256").update(await readFile(path)).digest("hex");
const rowsOf = (document) => document.Rows ?? document[0]?.Rows;
const stripEnum = (value) => typeof value === "string" ? value.replace(/^.*::/, "") : value;

if (!process.argv[2]) throw new Error("Usage: node scripts/import-refinement-snapshot.mjs <local-unpack-directory>");

const files = {
  partner: resolve(sourceDir, "DT_PartnerSkillParameter-v1.0.json"),
  passive: resolve(sourceDir, "DT_PassiveSkill_Main-v1.0.json"),
  passiveCommon: resolve(sourceDir, "DT_PassiveSkill_Main_Common-v1.0.json"),
  pals: resolve(sourceDir, "DT_PalMonsterParameter_Common.json"),
  special: resolve(sourceDir, "refinement-special-v1.json"),
};
const [partnerDocument, passiveDocument, passiveCommonDocument, palDocument, db] = await Promise.all([
  readJson(files.partner), readJson(files.passive), readJson(files.passiveCommon), readJson(files.pals),
  readJson(resolve(root, "scripts/vendor/palcalc/db.json")),
]);
const partnerRows = rowsOf(partnerDocument);
const passiveRows = rowsOf(passiveDocument);
const passiveCommonRows = rowsOf(passiveCommonDocument);
const palRows = rowsOf(palDocument);
assert(Object.keys(partnerRows).length === 682, "Unexpected partner-skill row count");
assert(Object.keys(passiveRows).length === 1_905, "Unexpected passive-skill row count");
assert(Object.keys(passiveCommonRows).length === 1_905, "Unexpected common passive-skill row count");
assert(Object.keys(palRows).length === 753, "Unexpected common Pal row count");

const workKeys = {
  EmitFlame: "kindling", Watering: "watering", Seeding: "planting",
  GenerateElectricity: "generatingelectricity", Handcraft: "handiwork",
  Collection: "gathering", Deforest: "lumbering", Mining: "mining",
  ProductMedicine: "medicineproduction", Cool: "cooling", Transport: "transporting",
  MonsterFarm: "farming", OilExtraction: "oilextraction",
};
const elementNames = {
  Dark: "暗", Dragon: "龙", Earth: "地", Electricity: "雷", Fire: "火",
  Ice: "冰", Leaf: "草", Normal: "无", Water: "水",
};
const statusNames = {
  Burn: "燃烧", Darkness: "黑暗", Electrical: "触电", Freeze: "冻结",
  IvyCling: "藤蔓缠绕", Muddy: "泥泞", Poison: "中毒", Stun: "眩晕", Wetness: "潮湿",
};
const effectLabels = {
  AttackRateHPThreshold: "生命阈值攻击增幅", AttackSpeedUp: "攻击速度增加",
  AvoidDurationUp_PartnerSkill: "闪避持续时间增加", BodyPartsWeakDamage: "弱点部位伤害增加",
  BreedSpeed_InBaseCamp: "据点配种速度增加", CaptureLevel_SneakBonus: "背后捕获力增加",
  ClimbMoveSpeedRate: "攀爬速度倍率", CollectItemDrop: "采集掉落增加", CraftSpeed: "工作速度增加",
  CurveType: "效果曲线参数", DamageRateByEquippedWeapon: "指定武器伤害增加",
  DamageUp_LastBullet: "弹匣末发伤害增加", DamageUpPartnerSkillAttack: "伙伴技能伤害增加",
  DamageUpToNonBattleEnemy: "对非战斗目标伤害增加", Defense: "防御增加",
  EggAlphaConversion: "巨大蛋转化参数", EggObtainExtraEgg: "额外蛋获取参数",
  EnemySightDetectionRate: "敌人视野侦测倍率", EquipmentDurabilityRate: "装备耐久消耗倍率",
  ExplosionResist: "爆炸伤害抗性", FallDamageRate: "坠落伤害倍率",
  FarmCropGrowupSpeed: "作物生长速度增加", FarmCropHarvestNumRate: "作物收获数量倍率",
  FullStomatch_Decrease: "饱食度消耗倍率", GainItemDrop: "物品掉落增加",
  InvalidToxicGas: "毒气伤害无效", ItemCorruptionSpeedRate: "食物腐坏速度倍率",
  ItemWeightReduction: "指定物品重量减轻", JumpCount_Increase: "跳跃次数增加",
  JumpPower_Increase: "跳跃力增加", LavaDamageInvalid: "熔岩伤害无效",
  LifeDrainPower_AttackUp: "吸血蓄力攻击增幅", LifeSteal: "生命偷取", Logging: "伐木效率增加",
  LowGravity: "重力降低", MaxInventoryWeight: "负重上限增加", MeatCutAddItemDrop: "肢解掉落增加",
  Mining: "采矿效率增加", MoveSpeed: "移动速度增加", MoveSpeed_Grass: "草地移动速度增加",
  MoveSpeed_Ground: "地面移动速度增加", MoveSpeed_Snow: "雪地移动速度增加",
  PalEggHatchingSpeed: "孵蛋速度增加", PalExp_Increase: "帕鲁经验增加",
  PartnerSkillCoolTime_Decrease: "伙伴技能冷却缩短", PlayerShield_RecoverStartTimeRate: "护盾恢复等待倍率",
  PlayerInflictEffect_AttackPoisoned_ApplyAttackDown: "攻击中毒目标时施加降攻",
  RecoverHPOnHPThreshold: "生命阈值恢复", Regene_HP_Rate: "生命恢复倍率",
  Regene_Stomatch_Hungriest: "饱食度恢复倍率", ReloadSpeedUp: "装填速度增加",
  Sanity_Decrease: "SAN消耗倍率", ShieldDamageCutRate: "护盾伤害减免",
  ShotAttack: "攻击增加", SphereRecovery: "帕鲁球回收参数", SwimSpeed: "游泳速度增加",
  TemperatureResist_Cold: "耐寒增加", TemperatureResist_Heat: "耐热增加",
};

function labelEffect(type) {
  if (effectLabels[type]) return effectLabels[type];
  for (const [prefix, suffix] of [
    ["ElementAddItemDrop_", "属性敌人掉落增加"],
    ["ElementBoostWeakness_", "属性弱点伤害增加"],
    ["ElementBoost_", "属性伤害强化"],
    ["ElementResist_", "属性伤害抗性"],
  ]) {
    if (type.startsWith(prefix)) return `${elementNames[type.slice(prefix.length)] ?? type.slice(prefix.length)}${suffix}`;
  }
  if (type.startsWith("Element") && elementNames[type.slice(7)]) return `为攻击附加${elementNames[type.slice(7)]}属性`;
  if (type.startsWith("WorkSuitabilityAddRank_")) {
    const work = workKeys[type.slice("WorkSuitabilityAddRank_".length)] ?? type.slice("WorkSuitabilityAddRank_".length);
    return `${work}适应性增加`;
  }
  for (const [prefix, suffix] of [
    ["AdditionalEffect_", "异常附加"], ["ResistAdditionalEffect_", "异常抗性"],
    ["DamageRateIfDefender_", "目标伤害增加"],
  ]) {
    if (type.startsWith(prefix)) return `${statusNames[type.slice(prefix.length)] ?? type.slice(prefix.length)}${suffix}`;
  }
  return `内部效果：${type}`;
}

function valueAtRank(values, stars) {
  if (!values?.length) return undefined;
  if (values.length === 5) return values[stars === 0 ? 0 : 4];
  if (values.length === 4) return stars === 0 ? undefined : values[3];
  if (values.length === 1) return values[0];
  throw new Error(`Unexpected rank-array length: ${values.length}`);
}

function contextOf(parameters = {}) {
  const context = [];
  const item = parameters.ItemParam ?? {};
  const itemIds = (item.ItemIds ?? []).map((entry) => entry.Key).filter(Boolean);
  if (itemIds.length) context.push(`物品：${itemIds.join("、")}`);
  for (const [value, prefix] of [[item.ItemTypeA, "物品大类"], [item.ItemTypeB, "物品类型"], [item.WeaponType, "武器"]]) {
    const normalized = stripEnum(value);
    if (normalized && normalized !== "None") context.push(`${prefix}：${normalized}`);
  }
  if (item.bMeleeOnly) context.push("仅近战");
  const elements = (parameters.OtherOtomoConditionParam?.TargetElementTypes ?? []).map(stripEnum).filter((value) => value !== "None");
  if (elements.length) context.push(`目标属性：${elements.map((value) => elementNames[value] ?? value).join("、")}`);
  if (parameters.AssignOthers) context.push("同时作用于其他帕鲁");
  if (parameters.bNotAssignSelf) context.push("不作用于自身");
  return context.length ? context.join("；") : undefined;
}

function metricUnit(type) {
  if (type === "MaxInventoryWeight") return "点";
  if (type === "JumpCount_Increase") return "次";
  if (type.startsWith("WorkSuitabilityAddRank_")) return "级";
  return undefined;
}

function rankEntry(values, stars) {
  if (!values?.length) return undefined;
  if (values.length === 5) return values[stars === 0 ? 0 : 4];
  if (values.length === 1) return values[0];
  throw new Error(`Unexpected object rank-array length: ${values.length}`);
}

function passiveMetrics(row, stars) {
  const sources = [];
  for (const item of rankEntry(row.PassiveSkills, stars)?.SkillAndParametersArray ?? []) {
    sources.push({ id: item.SkillName.Key, parameters: item.Parameters, referenceOnly: false });
  }
  for (const item of rankEntry(row.TextReferencePassiveSkills, stars)?.PassiveSkillIds ?? []) {
    sources.push({ id: item.Key, parameters: undefined, referenceOnly: true });
  }
  const metrics = [];
  for (const source of sources) {
    const passive = passiveRows[source.id] ?? passiveCommonRows[source.id];
    assert(passive, `Missing passive-skill row: ${source.id}`);
    for (let index = 1; index <= 4; index += 1) {
      const type = stripEnum(passive[`EffectType${index}`]);
      if (!type || type === "no") continue;
      metrics.push({
        key: `passive:${source.id}:${index}`,
        label: labelEffect(type),
        value: passive[`EffectValue${index}`],
        ...(metricUnit(type) ? { unit: metricUnit(type) } : {}),
        target: stripEnum(passive[`TargetType${index}`]),
        technicalId: type,
        sourceId: source.id,
        ...(contextOf(source.parameters) ? { context: contextOf(source.parameters) } : {}),
        ...(source.referenceOnly ? { referenceOnly: true } : {}),
      });
    }
  }
  const seen = new Set();
  return metrics.filter((metric) => {
    const signature = JSON.stringify([metric.technicalId, metric.value, metric.target, metric.context]);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

const activeLabels = {
  None: "主效果参数", "威力": "威力", "威力倍率": "威力倍率", "技の倍率": "技能倍率",
  "技威力の倍率": "技能威力倍率", "回復量実数値": "恢复量", "開錠可能な宝箱のグレード": "可开锁宝箱等级",
  "ジャンプ力に影響": "跳跃力参数", "ハンマー殴りの技威力": "锤击威力",
};

function rankData(row, stars, workSuitability) {
  const active = row.ActiveSkill ?? {};
  const metrics = passiveMetrics(row, stars);
  const mainValue = valueAtRank(active.ActiveSkill_MainValueByRank, stars);
  const cooldown = valueAtRank(active.ActiveSkill_OverWriteCoolTimeByRank, stars);
  const duration = valueAtRank(active.ActiveSkill_OverWriteEffectTimeByRank, stars);
  if (mainValue !== undefined) metrics.unshift({
    key: "active:main", label: activeLabels[active.ActiveSkill_MainValue_Overview_EditorOnly] ?? "主效果参数",
    value: mainValue, technicalId: "ActiveSkill_MainValueByRank",
  });
  if (cooldown !== undefined) metrics.push({
    key: "active:cooldown", label: "覆盖冷却时间", value: cooldown, unit: "秒",
    technicalId: "ActiveSkill_OverWriteCoolTimeByRank",
  });
  if (duration !== undefined) metrics.push({
    key: "active:duration", label: "覆盖持续时间", value: duration, unit: "秒",
    technicalId: "ActiveSkill_OverWriteEffectTimeByRank",
  });
  return {
    stars,
    partnerSkillLevel: stars === 0 ? 1 : 5,
    consumedCopies: stars === 0 ? 0 : 48,
    statMultiplier: stars === 0 ? 1 : 1.2,
    workSuitability,
    metrics,
  };
}

function workAtFourStars(source) {
  const base = Object.fromEntries(Object.entries(source)
    .filter(([, level]) => level > 0)
    .map(([work, level]) => [work.toLocaleLowerCase(), level]));
  const ordered = Object.entries(base).sort((left, right) => right[1] - left[1]);
  const bonuses = Object.fromEntries(ordered.map(([work]) => [work, 1]));
  for (let index = 0; index < 3 && ordered.length; index += 1) {
    const work = ordered[index % ordered.length][0];
    bonuses[work] += 1;
  }
  return Object.fromEntries(Object.entries(base)
    .map(([work, level]) => [work, Math.min(10, level + bonuses[work])]));
}

const visiblePals = db.Pals.filter((pal) => pal.Id.PalDexNo > 0 && pal.Id.PalDexNo < 10_000);
assert(visiblePals.length === 288, "Unexpected selectable Pal count");
const entries = visiblePals.map((pal) => {
  const id = pal.InternalName;
  const row = partnerRows[id];
  assert(row, `Missing partner-skill parameter row: ${id}`);
  const lengths = [
    row.ActiveSkill?.ActiveSkill_MainValueByRank?.length ?? 0,
    row.ActiveSkill?.ActiveSkill_OverWriteCoolTimeByRank?.length ?? 0,
    row.ActiveSkill?.ActiveSkill_OverWriteEffectTimeByRank?.length ?? 0,
    row.PassiveSkills?.length ?? 0,
    row.TextReferencePassiveSkills?.length ?? 0,
  ];
  const hasRankedTableData = lengths.some((length) => length === 4 || length === 5);
  const hasConstantTableData = lengths.some((length) => length === 1);
  const bestWork = stripEnum(palRows[id]?.BestWorkSuitability);
  assert(bestWork, `Missing BestWorkSuitability: ${id}`);
  const zeroStarWork = Object.fromEntries(Object.entries(pal.WorkSuitability)
    .filter(([, level]) => level > 0)
    .map(([work, level]) => [work.toLocaleLowerCase(), level]));
  return {
    id,
    configuredBestWorkSuitability: workKeys[bestWork] ?? bestWork,
    sourceKind: hasRankedTableData ? "table" : hasConstantTableData ? "constant" : "blueprint",
    zeroStar: rankData(row, 0, zeroStarWork),
    fourStar: rankData(row, 4, workAtFourStars(pal.WorkSuitability)),
    ...(!hasRankedTableData && !hasConstantTableData ? {
      notes: ["此伙伴技能由角色 Blueprint、滑翔或牧场掉落表实现，通用伙伴技能参数表没有五级数值。"],
    } : {}),
  };
});
const byId = new Map(entries.map((entry) => [entry.id, entry]));
assert(JSON.stringify(byId.get("Anubis").fourStar.workSuitability)
  === JSON.stringify({ handiwork: 8, mining: 8, transporting: 6 }), "Anubis rank-5 work calculation changed");
assert(byId.get("Umihebi_Fire").fourStar.workSuitability.kindling === 10,
  "Single-work rank-5 cap calculation changed");

let specialDocument;
try {
  specialDocument = await readJson(files.special);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
if (specialDocument) {
  const specialEntries = specialDocument.entries ?? specialDocument.pals;
  assert(specialDocument.gameBuildId === "24088745", "Special refinement build ID changed");
  assert(specialDocument.globalRefinement?.rawConfig?.CharacterMaxRank === 5, "Special max-rank config changed");
  assert(specialDocument.globalRefinement?.rawConfig?.StatusCalculate_GenkaiToppa_PerAdd === 0.05,
    "Special stat multiplier changed");
  assert(specialEntries.length === 18, "Expected 18 special refinement records");
  const specialById = new Map(specialEntries.map((entry) => [entry.id, entry]));
  for (const entry of entries) {
    const special = specialById.get(entry.id);
    if (!special) continue;
    entry.sourceKind = entry.id === "LongCat" ? "constant" : "blueprint";
    entry.zeroStar.metrics = special.zeroStar?.metrics ?? [];
    entry.fourStar.metrics = special.fourStar?.metrics ?? [];
    entry.notes = special.notes ?? entry.notes;
    entry.sourceAssets = special.sourceAssets ?? [];
  }
  assert([...specialById].every(([id]) => entries.some((entry) => entry.id === id)), "Special snapshot has unknown Pal IDs");
}

const tableRanked = entries.filter((entry) => entry.sourceKind === "table");
const tableChanged = tableRanked.filter((entry) =>
  JSON.stringify(entry.zeroStar.metrics) !== JSON.stringify(entry.fourStar.metrics));
const specialCovered = entries.filter((entry) => entry.sourceKind !== "table" && entry.fourStar.metrics.length > 0);
const hashes = Object.fromEntries(await Promise.all(Object.entries(files)
  .filter(([name]) => name !== "special" || specialDocument)
  .map(async ([name, path]) => [name, await sha256(path)])));
const snapshot = {
  source: {
    gameVersion: "1.0", gameBuildId: "24088745", gamePak: "Pal-Windows.pak",
    extractedWith: "CUE4Parse 1.2.2.202607",
    assets: {
      partner: "Pal/Content/Pal/DataTable/PassiveSkill/DT_PartnerSkillParameter",
      passive: "Pal/Content/Pal/DataTable/PassiveSkill/DT_PassiveSkill_Main",
      passiveCommon: "Pal/Content/Pal/DataTable/PassiveSkill/DT_PassiveSkill_Main_Common",
      pals: "Pal/Content/Pal/DataTable/Character/DT_PalMonsterParameter_Common",
      settings: "Pal/Content/Pal/Blueprint/System/BP_PalGameSetting",
    },
    rawArtifactSha256: hashes,
    mapping: {
      repo: "PalModding/UtililityFiles", commit: "455de2110d8414f703699204f33cb6ac052a3f98",
      blob: "4ae676dd2c13a3d74d32df5a89c6f437754ffcd6",
    },
  },
  general: {
    rankStorage: { zeroStar: 1, fourStar: 5 },
    requiredCopiesByStar: [4, 8, 12, 24],
    totalConsumedCopies: 48,
    statMultiplier: { zeroStar: 1, fourStar: 1.2, perStar: 0.05 },
    workSuitability: {
      rankTwoToFour: "按基础等级降序选择前三个非零工种各 +1；不足三个工种时循环分配。",
      rankFive: "全部原生非零工种再 +1。",
      maximum: 10,
    },
  },
  counts: {
    pals: entries.length, tableRanked: tableRanked.length, tableChanged: tableChanged.length,
    tableUnchanged: tableRanked.length - tableChanged.length, specialCovered: specialCovered.length,
  },
  entries,
};
await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Wrote ${entries.length} refinement records: ${tableRanked.length} ranked-table, ${specialCovered.length} special/constant covered.`);
