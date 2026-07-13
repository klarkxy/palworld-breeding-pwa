import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";
import { pinyin } from "pinyin-pro";
import { buildBreedingIndex } from "@/core";
import type {
  ActiveSkillRecord, BreedRule, BreedingIndex, PalId, PalRecord, PartnerSkillRecord,
} from "@/core";

export interface DataManifest {
  gameVersion: string;
  dataVersion: string;
  generatedAt: string;
  sources: Record<string, Readonly<Record<string, unknown>>>;
  counts: { pals: number; rules: number; icons: number; activeSkills?: number; partnerSkills?: number };
  checksums: { breeding: string; paldex: string; skills?: string };
}

interface BreedingData { pals: PalRecord[]; rules: BreedRule[] }
interface PaldexData { pals: PalRecord[] }
interface SkillsData { activeSkills: ActiveSkillRecord[]; partnerSkills: PartnerSkillRecord[] }

export function formatDex(pal: PalRecord) {
  return `#${String(pal.dexNo).padStart(3, "0")}${pal.variant ? "B" : ""}`;
}

export function palLabel(pal: PalRecord) {
  return `${pal.names.zh} · ${pal.names.en} · ${formatDex(pal)} · ${pal.id}`;
}

export function palPinyinInitials(pal: PalRecord) {
  return pinyin(pal.names.zh, {
    pattern: "first", toneType: "none", type: "array", nonZh: "removed",
  }).join("").toLocaleLowerCase();
}

export function palMatchesSearch(pal: PalRecord, query: string) {
  const needle = query.trim().toLocaleLowerCase();
  return !needle || [pal.names.zh, pal.names.en, pal.id, String(pal.dexNo), palPinyinInitials(pal)]
    .some((value) => value.toLocaleLowerCase().includes(needle));
}

const elementNames: Record<string, string> = {
  dark: "暗", dragon: "龙", earth: "地", electricity: "雷", electric: "雷",
  fire: "火", grass: "草", leaf: "草", ice: "冰", neutral: "无", normal: "无", water: "水",
};
const elementIcons: Record<string, string> = {
  dark: "🌙", dragon: "🐉", earth: "⛰️", electricity: "⚡", electric: "⚡",
  fire: "🔥", grass: "🌿", leaf: "🌿", ice: "❄️", neutral: "⚪", normal: "⚪", water: "💧",
};
const workNames: Record<string, string> = {
  kindling: "生火", watering: "浇水", planting: "播种", generatingelectricity: "发电", generateelectricity: "发电",
  handiwork: "手工作业", gathering: "采集", lumbering: "伐木", mining: "采矿",
  medicineproduction: "制药", cooling: "冷却", transporting: "搬运", farming: "牧场", oilextraction: "采油",
};
const workIcons: Record<string, string> = {
  kindling: "🔥", watering: "💧", planting: "🌱", generatingelectricity: "⚡", generateelectricity: "⚡",
  handiwork: "🛠️", gathering: "🌾", lumbering: "🪓", mining: "⛏️",
  medicineproduction: "💊", cooling: "❄️", transporting: "📦", farming: "🐄", oilextraction: "🛢️",
};
const keyOf = (value: string) => value.toLocaleLowerCase().replace(/[^a-z]/g, "");

export function elementName(value: string) {
  return elementNames[keyOf(value)] ?? value;
}

export function elementIcon(value: string) {
  return elementIcons[keyOf(value)] ?? "✨";
}

export function workName(value: string) {
  return workNames[keyOf(value)] ?? value;
}

export function workIcon(value: string) {
  return workIcons[keyOf(value)] ?? "•";
}

export function isSelectablePal(pal: PalRecord) {
  return pal.selectable !== false && pal.dexNo > 0 && pal.dexNo < 10_000;
}

const dataUrl = (file: string) => `${import.meta.env.BASE_URL}data/${file}`;
async function fetchJson<T>(file: string): Promise<T> {
  const response = await fetch(dataUrl(file));
  if (!response.ok) throw new Error(`${file} 加载失败（${response.status}）`);
  return response.json() as Promise<T>;
}

export const usePalDataStore = defineStore("palData", () => {
  const manifest = shallowRef<DataManifest>();
  const pals = shallowRef<PalRecord[]>([]);
  const rules = shallowRef<BreedRule[]>([]);
  const activeSkills = shallowRef<ActiveSkillRecord[]>([]);
  const partnerSkills = shallowRef<PartnerSkillRecord[]>([]);
  const index = shallowRef<BreedingIndex>();
  const isLoading = ref(false);
  const error = ref("");
  let loadPromise: Promise<void> | undefined;

  const selfBreedOnlyIds = computed(() => new Set(
    [...(index.value?.rulesByChild ?? [])]
      .filter(([child, childRules]) => childRules.length > 0 &&
        childRules.every((rule) => rule.parentA === child && rule.parentB === child))
      .map(([child]) => child),
  ));
  const palById = computed(() => new Map<PalId, PalRecord>(pals.value.map((pal) => [pal.id, pal])));
  const activeSkillById = computed(() => new Map(activeSkills.value.map((skill) => [skill.id, skill])));
  const partnerSkillById = computed(() => new Map(partnerSkills.value.map((skill) => [skill.id, skill])));
  const visiblePals = computed(() => pals.value.filter(isSelectablePal));

  async function load() {
    if (index.value) return;
    if (loadPromise) return loadPromise;
    isLoading.value = true;
    error.value = "";
    loadPromise = (async () => {
      try {
        const [nextManifest, breeding, paldex, skills] = await Promise.all([
          fetchJson<DataManifest>("manifest.json"),
          fetchJson<BreedingData>("breeding.json"),
          fetchJson<PaldexData>("paldex.json"),
          fetchJson<SkillsData>("skills.json"),
        ]);
        manifest.value = nextManifest;
        pals.value = paldex.pals;
        rules.value = breeding.rules;
        activeSkills.value = skills.activeSkills;
        partnerSkills.value = skills.partnerSkills;
        const selectableIds = new Set(paldex.pals.filter(isSelectablePal).map((pal) => pal.id));
        const usableRules = breeding.rules.filter((rule) =>
          selectableIds.has(rule.parentA) && selectableIds.has(rule.parentB) && selectableIds.has(rule.child));
        index.value = buildBreedingIndex(paldex.pals, usableRules);
      } catch (reason) {
        error.value = reason instanceof Error ? reason.message : "数据加载失败";
        loadPromise = undefined;
      } finally {
        isLoading.value = false;
      }
    })();
    return loadPromise;
  }

  return {
    manifest, pals, rules, activeSkills, partnerSkills, index, selfBreedOnlyIds,
    palById, activeSkillById, partnerSkillById, visiblePals, isLoading, error, load,
  };
});
