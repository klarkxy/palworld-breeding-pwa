import { defineStore } from "pinia";
import { onScopeDispose, ref, watch } from "vue";
import type { PalId } from "@/core";
import { bindLocalStorage } from "@/stores/persistence";

export const PATHS_STORAGE_KEY = "pal-lab.paths.v1";
export type PathsMode = "single" | "owned";

export interface PathRunSnapshot {
  mode: PathsMode;
  start: PalId | "";
  target: PalId;
  maxDepth: number;
}

interface PathsSnapshot {
  schema: 1;
  mode: PathsMode;
  start: PalId | "";
  target: PalId | "";
  maxDepth: number;
  lastRun?: PathRunSnapshot;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const pathMode = (value: unknown): PathsMode => value === "owned" ? "owned" : "single";
const palId = (value: unknown): PalId | "" => typeof value === "string" ? value.slice(0, 128) : "";
const depth = (value: unknown) => Number.isFinite(Number(value))
  ? Math.min(8, Math.max(1, Math.trunc(Number(value))))
  : 5;
const queryValue = (value: unknown) => Array.isArray(value) ? value[0] : value;

function decodeRun(value: unknown): PathRunSnapshot | undefined {
  if (!isObject(value)) return undefined;
  const mode = pathMode(value.mode);
  const start = palId(value.start);
  const target = palId(value.target);
  if (!target || (mode === "single" && !start)) return undefined;
  return { mode, start, target, maxDepth: depth(value.maxDepth) };
}

export function decodePathsSnapshot(value: unknown): PathsSnapshot | undefined {
  if (!isObject(value) || value.schema !== 1) return undefined;
  return {
    schema: 1,
    mode: pathMode(value.mode),
    start: palId(value.start),
    target: palId(value.target),
    maxDepth: depth(value.maxDepth),
    lastRun: decodeRun(value.lastRun),
  };
}

export const usePathsStore = defineStore("paths", () => {
  const mode = ref<PathsMode>("single");
  const start = ref<PalId | "">("");
  const target = ref<PalId | "">("");
  const maxDepth = ref(5);
  const lastRun = ref<PathRunSnapshot>();
  const persistenceError = ref("");
  let applyingSnapshot = false;
  let validIds: ReadonlySet<PalId> | undefined;

  function sanitizeCurrent() {
    if (!validIds) return;
    if (start.value && !validIds.has(start.value)) start.value = "";
    if (target.value && !validIds.has(target.value)) target.value = "";
    const run = lastRun.value;
    if (run && (!validIds.has(run.target) || (run.mode === "single" && (!run.start || !validIds.has(run.start))))) {
      lastRun.value = undefined;
    }
  }

  const reset = () => {
    mode.value = "single";
    start.value = "";
    target.value = "";
    maxDepth.value = 5;
    lastRun.value = undefined;
  };
  const apply = (stored: PathsSnapshot | undefined) => {
    applyingSnapshot = true;
    try {
      if (!stored) return reset();
      mode.value = stored.mode;
      start.value = stored.start;
      target.value = stored.target;
      maxDepth.value = stored.maxDepth;
      lastRun.value = stored.lastRun;
      sanitizeCurrent();
    } finally {
      applyingSnapshot = false;
    }
  };
  const binding = bindLocalStorage({
    key: PATHS_STORAGE_KEY,
    decode: decodePathsSnapshot,
    snapshot: () => ({
      schema: 1,
      mode: mode.value,
      start: start.value,
      target: target.value,
      maxDepth: maxDepth.value,
      lastRun: lastRun.value,
    } satisfies PathsSnapshot),
    apply,
    subscribe: (persist) => watch([mode, start, target, maxDepth, lastRun], persist, { deep: true, flush: "sync" }),
    onError: (message) => { persistenceError.value = message; },
  });
  const stopDirtyWatch = watch([mode, start, target, maxDepth], () => {
    if (!applyingSnapshot) lastRun.value = undefined;
  }, { flush: "sync" });
  onScopeDispose(() => { binding.stop(); stopDirtyWatch(); });

  function submit() {
    if (!target.value || (mode.value === "single" && !start.value)) return void (lastRun.value = undefined);
    lastRun.value = { mode: mode.value, start: start.value, target: target.value, maxDepth: maxDepth.value };
  }

  function invalidate() {
    lastRun.value = undefined;
  }

  function applyRoute(query: Readonly<Record<string, unknown>>) {
    if (!["mode", "start", "target", "depth", "run"].some((key) => key in query)) return false;
    applyingSnapshot = true;
    try {
      let changed = false;
      const routeMode = queryValue(query.mode);
      if (routeMode === "single" || routeMode === "owned") {
        changed ||= mode.value !== routeMode;
        mode.value = routeMode;
      }
      const applyPal = (value: unknown, current: PalId | "", assign: (id: PalId | "") => void) => {
        const id = palId(queryValue(value));
        if (id && validIds?.has(id)) {
          changed ||= current !== id;
          assign(id);
        }
      };
      if ("start" in query) applyPal(query.start, start.value, (id) => { start.value = id; });
      if ("target" in query) applyPal(query.target, target.value, (id) => { target.value = id; });
      if ("depth" in query) {
        const rawDepth = queryValue(query.depth);
        const routeDepth = typeof rawDepth === "string" && rawDepth.trim() ? Number(rawDepth) : Number.NaN;
        if (Number.isFinite(routeDepth)) {
          const nextDepth = depth(routeDepth);
          changed ||= maxDepth.value !== nextDepth;
          maxDepth.value = nextDepth;
        }
      }
      if ("run" in query) {
        const routeRun = queryValue(query.run);
        if (routeRun === "0") lastRun.value = undefined;
        if (routeRun === "1" && target.value && (mode.value === "owned" || start.value)) {
          lastRun.value = { mode: mode.value, start: start.value, target: target.value, maxDepth: maxDepth.value };
        }
      } else if (changed) {
        lastRun.value = undefined;
      }
      sanitizeCurrent();
    } finally {
      applyingSnapshot = false;
    }
    return true;
  }

  function sanitize(nextValidIds: ReadonlySet<PalId>) {
    validIds = new Set(nextValidIds);
    applyingSnapshot = true;
    try {
      sanitizeCurrent();
    } finally {
      applyingSnapshot = false;
    }
  }

  return { mode, start, target, maxDepth, lastRun, persistenceError, submit, invalidate, applyRoute, sanitize, reset };
});
