import { defineStore } from "pinia";
import { onScopeDispose, ref, watch } from "vue";
import { bindLocalStorage } from "@/stores/persistence";

export const PALDEX_STORAGE_KEY = "pal-lab.paldex.v1";
export type PaldexVariant = "all" | "base" | "variant";
export type PaldexSortKey = "dex" | "hp" | "attack" | "defense" | "stamina" | "maleProbability" | "breedingPower"
  | "slowWalkSpeed" | "walkSpeed" | "runSpeed" | "rideSprintSpeed" | "transportSpeed"
  | "swimSpeed" | "swimDashSpeed" | "flightBaseSpeed" | "flightBaseSprint"
  | "flySpeedOverride" | "flySprintSpeedOverride";

interface PaldexSnapshot {
  schema: 1;
  query: string;
  element: string;
  work: string;
  variant: PaldexVariant;
  sortKey: PaldexSortKey;
  selectedStars: 0 | 4;
}

const sortKeys = new Set<PaldexSortKey>([
  "dex", "hp", "attack", "defense", "stamina", "maleProbability", "breedingPower",
  "slowWalkSpeed", "walkSpeed", "runSpeed", "rideSprintSpeed", "transportSpeed",
  "swimSpeed", "swimDashSpeed", "flightBaseSpeed", "flightBaseSprint",
  "flySpeedOverride", "flySprintSpeedOverride",
]);
const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const text = (value: unknown, max = 200) => typeof value === "string" ? value.slice(0, max) : "";
const variantValue = (value: unknown): PaldexVariant => value === "base" || value === "variant" ? value : "all";
const sortValue = (value: unknown): PaldexSortKey =>
  typeof value === "string" && sortKeys.has(value as PaldexSortKey) ? value as PaldexSortKey : "dex";
const queryValue = (value: unknown) => Array.isArray(value) ? value[0] : value;

export function decodePaldexSnapshot(value: unknown): PaldexSnapshot | undefined {
  if (!isObject(value) || value.schema !== 1) return undefined;
  return {
    schema: 1,
    query: text(value.query),
    element: text(value.element, 64),
    work: text(value.work, 64),
    variant: variantValue(value.variant),
    sortKey: sortValue(value.sortKey),
    selectedStars: value.selectedStars === 4 ? 4 : 0,
  };
}

export const usePaldexStore = defineStore("paldex", () => {
  const query = ref("");
  const element = ref("");
  const work = ref("");
  const variant = ref<PaldexVariant>("all");
  const sortKey = ref<PaldexSortKey>("dex");
  const selectedStars = ref<0 | 4>(0);
  const persistenceError = ref("");
  let validElements: ReadonlySet<string> | undefined;
  let validWorks: ReadonlySet<string> | undefined;

  function sanitizeCurrent() {
    if (element.value && validElements && !validElements.has(element.value)) element.value = "";
    if (work.value && validWorks && !validWorks.has(work.value)) work.value = "";
  }

  const reset = () => {
    query.value = "";
    element.value = "";
    work.value = "";
    variant.value = "all";
    sortKey.value = "dex";
    selectedStars.value = 0;
  };
  const apply = (stored: PaldexSnapshot | undefined) => {
    if (!stored) return reset();
    query.value = stored.query;
    element.value = stored.element;
    work.value = stored.work;
    variant.value = stored.variant;
    sortKey.value = stored.sortKey;
    selectedStars.value = stored.selectedStars;
    sanitizeCurrent();
  };
  const binding = bindLocalStorage({
    key: PALDEX_STORAGE_KEY,
    decode: decodePaldexSnapshot,
    snapshot: () => ({
      schema: 1,
      query: query.value,
      element: element.value,
      work: work.value,
      variant: variant.value,
      sortKey: sortKey.value,
      selectedStars: selectedStars.value,
    } satisfies PaldexSnapshot),
    apply,
    subscribe: (persist) => watch([query, element, work, variant, sortKey, selectedStars], persist, { flush: "sync" }),
    onError: (message) => { persistenceError.value = message; },
  });
  onScopeDispose(binding.stop);

  function sanitize(elements: ReadonlySet<string>, works: ReadonlySet<string>) {
    validElements = new Set(elements);
    validWorks = new Set(works);
    sanitizeCurrent();
  }

  function applyRoute(routeQuery: Readonly<Record<string, unknown>>) {
    if (!["q", "element", "work", "variant", "sort", "stars"].some((key) => key in routeQuery)) return false;
    if ("q" in routeQuery) query.value = text(queryValue(routeQuery.q));
    if ("element" in routeQuery) {
      const routeElement = text(queryValue(routeQuery.element), 64);
      if (!routeElement || !validElements || validElements.has(routeElement)) element.value = routeElement;
    }
    if ("work" in routeQuery) {
      const routeWork = text(queryValue(routeQuery.work), 64);
      if (!routeWork || !validWorks || validWorks.has(routeWork)) work.value = routeWork;
    }
    if ("variant" in routeQuery) {
      const routeVariant = queryValue(routeQuery.variant);
      if (routeVariant === "all" || routeVariant === "base" || routeVariant === "variant") variant.value = routeVariant;
    }
    if ("sort" in routeQuery) {
      const routeSort = queryValue(routeQuery.sort);
      if (typeof routeSort === "string" && sortKeys.has(routeSort as PaldexSortKey)) sortKey.value = routeSort as PaldexSortKey;
    }
    if ("stars" in routeQuery) {
      const routeStars = queryValue(routeQuery.stars);
      if (routeStars === "0" || routeStars === "4") selectedStars.value = routeStars === "4" ? 4 : 0;
    }
    sanitizeCurrent();
    return true;
  }

  return { query, element, work, variant, sortKey, selectedStars, persistenceError, applyRoute, sanitize, reset };
});
