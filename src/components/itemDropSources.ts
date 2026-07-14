import type {
  ChestDropSourceRecord,
  ChestItemDropRecord,
  PalDropSourceType,
  PalItemDropRecord,
} from "@/stores/itemData";
import type { PalRecord } from "@/core";

export const DROP_SOURCE_PREVIEW_LIMIT = 12;

const numberFormatter = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 4,
});

const palSourceOrder: Readonly<Record<PalDropSourceType, number>> = {
  normal: 0,
  alpha: 1,
  predator: 2,
};

const palSourceLabels: Readonly<Record<PalDropSourceType, string>> = {
  normal: "普通",
  alpha: "Alpha",
  predator: "凶猛",
};

const chestKindLabels: Readonly<Record<string, string>> = {
  field: "野外宝箱",
  enemycamp: "敌对据点宝箱",
  dungeon: "地牢宝箱",
  oilrig: "油田宝箱",
  treasuremap: "藏宝图宝箱",
  visible: "场景掉落宝箱",
  elemental: "元素宝箱",
  supply: "补给箱",
  raid: "讨伐宝箱",
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (isFiniteNumber(value)) return String(value);
  }
  return undefined;
}

export function formatDropPercent(value: number) {
  return `${numberFormatter.format(value)}%`;
}

export function formatDropQuantity(minQuantity: number, maxQuantity: number) {
  return minQuantity === maxQuantity
    ? `× ${numberFormatter.format(minQuantity)}`
    : `× ${numberFormatter.format(minQuantity)}–${numberFormatter.format(maxQuantity)}`;
}

export function formatExpectedQuantityPerOpen(value: number) {
  return `× ${numberFormatter.format(value)}`;
}

export function describeChestQuantity(drop: ChestItemDropRecord) {
  return isFiniteNumber(drop.minQuantity) && isFiniteNumber(drop.maxQuantity)
    ? formatDropQuantity(drop.minQuantity, drop.maxQuantity)
    : undefined;
}

export function formatChestGrade(value: number | string) {
  const match = typeof value === "string" ? /^grade\s*(.+)$/i.exec(value.trim()) : undefined;
  return match?.[1] || String(value);
}

export function palDropSourceLabel(sourceType: PalDropSourceType) {
  return palSourceLabels[sourceType];
}

export function palDropLevelLabel(level: number) {
  return level > 0 ? `Lv.${numberFormatter.format(level)} 等级段` : "默认等级段";
}

export interface ChestChancePresentation {
  kind: "grade-conditional" | "per-open" | "conditional" | "weight" | "unknown";
  label: string;
  value: string;
}

/**
 * Pool summaries are conditional on the chest grade already being known. Keep
 * that basis visible even when a compatibility field is named "per open".
 * Legacy records without any grade context retain their original wording.
 */
export function describeChestChance(drop: ChestItemDropRecord): ChestChancePresentation {
  const combinedChance = [
    drop.conditionalOnGradeChancePercent,
    drop.chanceAtLeastOnePercent,
    drop.perOpenChancePercent,
    drop.chancePercent,
  ].find(isFiniteNumber);
  const probabilityBasis = drop.probabilityBasis?.toLocaleLowerCase().replace(/[^a-z]/g, "");
  const hasGradeContext = drop.conditionalOnGrade === true
    || drop.gradeDistributionKnown === false
    || probabilityBasis === "conditionalongrade"
    || isFiniteNumber(drop.conditionalOnGradeChancePercent)
    || isFiniteNumber(drop.chanceAtLeastOnePercent)
    || drop.treasureBoxGrade !== undefined
    || drop.treasureGrade !== undefined;

  if (isFiniteNumber(combinedChance)) {
    return hasGradeContext
      ? {
          kind: "grade-conditional",
          label: "该品级开启概率",
          value: formatDropPercent(combinedChance),
        }
      : { kind: "per-open", label: "每次开启概率", value: formatDropPercent(combinedChance) };
  }
  if (isFiniteNumber(drop.slotProbabilityPercent)) {
    const weight = isFiniteNumber(drop.weight) ? ` · 权重 ${numberFormatter.format(drop.weight)}` : "";
    return {
      kind: "conditional",
      label: "条件概率",
      value: `${formatDropPercent(drop.slotProbabilityPercent)}${weight}`,
    };
  }
  if (isFiniteNumber(drop.weight)) {
    return { kind: "weight", label: "条件权重", value: numberFormatter.format(drop.weight) };
  }
  return { kind: "unknown", label: "掉落概率", value: "尚未解析" };
}

export interface ChestSourcePresentation {
  label: string;
  region?: string;
  kind?: string;
  treasureGrade?: number | string;
}

function sourceIdentifier(source: ChestDropSourceRecord) {
  return firstText(source.sourceId, source.id, source.poolId);
}

export function resolveChestSource(
  drop: ChestItemDropRecord,
  sources: readonly ChestDropSourceRecord[],
): ChestSourcePresentation {
  const sourceIds = [drop.sourceId, drop.poolId].filter((value): value is string => Boolean(value));
  const source = sources.find((candidate) => sourceIds.includes(sourceIdentifier(candidate) ?? ""))
    ?? (drop.fieldName
      ? sources.find((candidate) => candidate.fieldName === drop.fieldName)
      : undefined);
  const kind = firstText(drop.sourceKind, source?.sourceKind);
  const normalizedKind = kind?.toLocaleLowerCase().replace(/[^a-z]/g, "");
  return {
    label: firstText(
      drop.labelZh,
      drop.sourceLabel,
      source?.labelZh,
      source?.sourceLabel,
      source?.label,
      source?.name,
      drop.sourceId,
      drop.fieldName,
    ) ?? "未命名宝箱",
    region: firstText(drop.region, source?.region),
    kind: normalizedKind ? chestKindLabels[normalizedKind] ?? kind : undefined,
    treasureGrade: drop.treasureBoxGrade
      ?? drop.treasureGrade
      ?? source?.treasureBoxGrade
      ?? source?.treasureGrade,
  };
}

export function sortPalDrops(
  drops: readonly PalItemDropRecord[],
  palById: ReadonlyMap<string, PalRecord>,
) {
  return [...drops].sort((left, right) => {
    const leftName = (left.palId && palById.get(left.palId)?.names.zh)
      || left.palId || left.characterId;
    const rightName = (right.palId && palById.get(right.palId)?.names.zh)
      || right.palId || right.characterId;
    return leftName.localeCompare(rightName, "zh-CN")
      || palSourceOrder[left.sourceType] - palSourceOrder[right.sourceType]
      || left.level - right.level
      || right.baseChancePercent - left.baseChancePercent
      || left.slot - right.slot;
  });
}

export function sortChestDrops(
  drops: readonly ChestItemDropRecord[],
  sources: readonly ChestDropSourceRecord[],
) {
  return [...drops].sort((left, right) => {
    const leftSource = resolveChestSource(left, sources);
    const rightSource = resolveChestSource(right, sources);
    const leftChance = left.conditionalOnGradeChancePercent
      ?? left.chanceAtLeastOnePercent
      ?? left.perOpenChancePercent
      ?? left.chancePercent
      ?? -1;
    const rightChance = right.conditionalOnGradeChancePercent
      ?? right.chanceAtLeastOnePercent
      ?? right.perOpenChancePercent
      ?? right.chancePercent
      ?? -1;
    return (leftSource.region ?? "").localeCompare(rightSource.region ?? "", "zh-CN")
      || leftSource.label.localeCompare(rightSource.label, "zh-CN")
      || String(leftSource.treasureGrade ?? "").localeCompare(String(rightSource.treasureGrade ?? ""), "zh-CN")
      || rightChance - leftChance
      || (left.slot ?? 0) - (right.slot ?? 0);
  });
}
