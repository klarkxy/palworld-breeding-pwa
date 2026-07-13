import { defineStore } from "pinia";
import { onScopeDispose, ref, watch } from "vue";
import type { PalId } from "@/core";
import { bindLocalStorage } from "@/stores/persistence";

export const BREEDING_STORAGE_KEY = "pal-lab.breeding.v1";
export type BreedingMode = "forward" | "pairs";

interface BreedingSnapshot {
  schema: 1;
  mode: BreedingMode;
  parentA: PalId | "";
  parentB: PalId | "";
  target: PalId | "";
  ownedOnly: boolean;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const palId = (value: unknown): PalId | "" => typeof value === "string" ? value.slice(0, 128) : "";
// The old mate finder is now covered by route planning. Keep old snapshots useful by
// opening the broader parent-pair lookup instead of leaving them on a removed tab.
const breedingMode = (value: unknown): BreedingMode =>
  value === "mate" || value === "pairs" ? "pairs" : "forward";
const queryValue = (value: unknown) => Array.isArray(value) ? value[0] : value;

export function decodeBreedingSnapshot(value: unknown): BreedingSnapshot | undefined {
  if (!isObject(value) || value.schema !== 1) return undefined;
  return {
    schema: 1,
    mode: breedingMode(value.mode),
    parentA: palId(value.parentA),
    parentB: palId(value.parentB),
    target: palId(value.target),
    ownedOnly: value.ownedOnly === true,
  };
}

export const useBreedingStore = defineStore("breeding", () => {
  const mode = ref<BreedingMode>("forward");
  const parentA = ref<PalId | "">("");
  const parentB = ref<PalId | "">("");
  const target = ref<PalId | "">("");
  const ownedOnly = ref(false);
  const persistenceError = ref("");
  let validIds: ReadonlySet<PalId> | undefined;

  function sanitizeCurrent() {
    if (!validIds) return;
    if (parentA.value && !validIds.has(parentA.value)) parentA.value = "";
    if (parentB.value && !validIds.has(parentB.value)) parentB.value = "";
    if (target.value && !validIds.has(target.value)) target.value = "";
  }

  const reset = () => {
    mode.value = "forward";
    parentA.value = "";
    parentB.value = "";
    target.value = "";
    ownedOnly.value = false;
  };
  const apply = (stored: BreedingSnapshot | undefined) => {
    if (!stored) return reset();
    mode.value = stored.mode;
    parentA.value = stored.parentA;
    parentB.value = stored.parentB;
    target.value = stored.target;
    ownedOnly.value = stored.ownedOnly;
    sanitizeCurrent();
  };
  const binding = bindLocalStorage({
    key: BREEDING_STORAGE_KEY,
    decode: decodeBreedingSnapshot,
    snapshot: () => ({
      schema: 1,
      mode: mode.value,
      parentA: parentA.value,
      parentB: parentB.value,
      target: target.value,
      ownedOnly: ownedOnly.value,
    } satisfies BreedingSnapshot),
    apply,
    subscribe: (persist) => watch([mode, parentA, parentB, target, ownedOnly], persist, { flush: "sync" }),
    onError: (message) => { persistenceError.value = message; },
  });
  onScopeDispose(binding.stop);

  function sanitize(nextValidIds: ReadonlySet<PalId>) {
    validIds = new Set(nextValidIds);
    sanitizeCurrent();
  }

  function applyRoute(query: Readonly<Record<string, unknown>>) {
    if (!["mode", "a", "b", "target", "owned"].some((key) => key in query)) return false;
    const routeMode = queryValue(query.mode);
    if (routeMode === "forward") mode.value = "forward";
    if (routeMode === "mate" || routeMode === "pairs") mode.value = "pairs";
    const applyPal = (value: unknown, assign: (id: PalId | "") => void) => {
      const id = palId(queryValue(value));
      if (id && validIds?.has(id)) assign(id);
    };
    if ("a" in query) applyPal(query.a, (id) => { parentA.value = id; });
    if ("b" in query) applyPal(query.b, (id) => { parentB.value = id; });
    if ("target" in query) applyPal(query.target, (id) => { target.value = id; });
    if ("owned" in query) {
      const routeOwned = queryValue(query.owned);
      if (routeOwned === "0" || routeOwned === "1") ownedOnly.value = routeOwned === "1";
    }
    sanitizeCurrent();
    return true;
  }

  return { mode, parentA, parentB, target, ownedOnly, persistenceError, applyRoute, sanitize, reset };
});
