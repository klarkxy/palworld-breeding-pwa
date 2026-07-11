import { computed, readonly, ref, shallowRef } from "vue";
import { buildBreedingIndex } from "@/core";
import type { BreedRule, BreedingIndex, PalId, PalRecord } from "@/core";

export interface DataManifest {
  gameVersion: string;
  dataVersion: string;
  generatedAt: string;
  sources: Record<string, { repo: string; ref: string; commit: string }>;
  counts: { pals: number; rules: number; icons: number };
  checksums: { breeding: string; paldex: string };
}

interface BreedingData {
  pals: PalRecord[];
  rules: BreedRule[];
}

interface PaldexData {
  pals: PalRecord[];
}

const manifest = shallowRef<DataManifest>();
const pals = shallowRef<PalRecord[]>([]);
const rules = shallowRef<BreedRule[]>([]);
const index = shallowRef<BreedingIndex>();
const isLoading = ref(false);
const error = ref("");
let loadPromise: Promise<void> | undefined;

function dataUrl(file: string) {
  return `${import.meta.env.BASE_URL}data/${file}`;
}

async function fetchJson<T>(file: string): Promise<T> {
  const response = await fetch(dataUrl(file));
  if (!response.ok) throw new Error(`${file} 加载失败（${response.status}）`);
  return response.json() as Promise<T>;
}

export async function loadPalData() {
  if (index.value) return;
  if (loadPromise) return loadPromise;

  isLoading.value = true;
  error.value = "";
  loadPromise = (async () => {
    try {
      const [nextManifest, breeding, paldex] = await Promise.all([
        fetchJson<DataManifest>("manifest.json"),
        fetchJson<BreedingData>("breeding.json"),
        fetchJson<PaldexData>("paldex.json"),
      ]);
      manifest.value = nextManifest;
      pals.value = paldex.pals;
      rules.value = breeding.rules;
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

export function formatDex(pal: PalRecord) {
  return `#${String(pal.dexNo).padStart(3, "0")}${pal.variant ? "B" : ""}`;
}

export function palLabel(pal: PalRecord) {
  return `${pal.names.zh} · ${pal.names.en} · ${formatDex(pal)} · ${pal.id}`;
}

const elementNames: Record<string, string> = {
  dark: "暗", dragon: "龙", earth: "地", electricity: "雷", electric: "雷",
  fire: "火", grass: "草", leaf: "草", ice: "冰", neutral: "无", normal: "无", water: "水",
};
const workNames: Record<string, string> = {
  kindling: "生火", watering: "浇水", planting: "播种", generatingelectricity: "发电", generateelectricity: "发电",
  handiwork: "手工作业", gathering: "采集", lumbering: "伐木", mining: "采矿",
  medicineproduction: "制药", cooling: "冷却", transporting: "搬运", farming: "牧场",
};
const keyOf = (value: string) => value.toLocaleLowerCase().replace(/[^a-z]/g, "");

export function elementName(value: string) {
  return elementNames[keyOf(value)] ?? value;
}

export function workName(value: string) {
  return workNames[keyOf(value)] ?? value;
}

export function isSelectablePal(pal: PalRecord) {
  return pal.selectable !== false && pal.dexNo > 0 && pal.dexNo < 10_000;
}

export function usePalData() {
  const palById = computed(() => new Map<PalId, PalRecord>(pals.value.map((pal) => [pal.id, pal])));
  const visiblePals = computed(() => pals.value.filter(isSelectablePal));

  return {
    manifest: readonly(manifest),
    pals: readonly(pals),
    visiblePals,
    rules: readonly(rules),
    index: readonly(index),
    palById,
    isLoading: readonly(isLoading),
    error: readonly(error),
    load: loadPalData,
  };
}
