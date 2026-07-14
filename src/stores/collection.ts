import { defineStore } from "pinia";
import { onScopeDispose, ref, watch } from "vue";
import type { OwnedEntry, PalId } from "@/core";
import { bindLocalStorage } from "@/stores/persistence";

export const COLLECTION_STORAGE_KEY = "pal-lab.collection.v1";

export interface StoredCollection {
  schema: 1 | 2;
  dataVersion: string;
  entries: OwnedEntry[];
  query: string;
  view: "all" | "owned";
}

interface DecodedStoredCollection extends StoredCollection {
  sourceCount: number;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

export function decodeStoredCollection(value: unknown): DecodedStoredCollection | undefined {
  if (!isObject(value) || (value.schema !== 1 && value.schema !== 2) || !Array.isArray(value.entries)) return undefined;
  const schema = value.schema;
  const ids = value.entries.flatMap((raw) => {
    if (!isObject(raw) || typeof raw.palId !== "string" || !raw.palId) return [];
    if (schema === 1 && raw.male !== true && raw.female !== true) return [];
    return [raw.palId];
  });
  const uniqueIds = [...new Set(ids)];
  return {
    schema,
    dataVersion: typeof value.dataVersion === "string" ? value.dataVersion : "",
    entries: uniqueIds.map((palId) => ({ palId })),
    query: typeof value.query === "string" ? value.query.slice(0, 200) : "",
    view: value.view === "owned" ? "owned" : "all",
    sourceCount: uniqueIds.length,
  };
}

export const useCollectionStore = defineStore("collection", () => {
  const entries = ref<OwnedEntry[]>([]);
  const cleanedCount = ref(0);
  const dataVersion = ref("");
  const ready = ref(false);
  const persistenceError = ref("");
  const query = ref("");
  const view = ref<"all" | "owned">("all");
  let validIds: ReadonlySet<PalId> | undefined;
  let sourceCount = 0;

  const reportError = (message: string) => { persistenceError.value = message; };
  const normalize = (nextEntries: readonly OwnedEntry[]) => {
    const ids = nextEntries
      .map((entry) => entry.palId)
      .filter((palId) => palId && (!validIds || validIds.has(palId)));
    return [...new Set(ids)].map((palId) => ({ palId }));
  };

  const dataBinding = bindLocalStorage({
    key: COLLECTION_STORAGE_KEY,
    decode: decodeStoredCollection,
    snapshot: () => ({
      schema: 2,
      dataVersion: dataVersion.value,
      entries: entries.value,
      query: query.value,
      view: view.value,
    } satisfies StoredCollection),
    apply: (stored) => {
      sourceCount = stored?.sourceCount ?? 0;
      entries.value = normalize(stored?.entries ?? []);
      query.value = stored?.query ?? "";
      view.value = stored?.view ?? "all";
      if (stored?.dataVersion) dataVersion.value = stored.dataVersion;
      if (ready.value) cleanedCount.value = Math.max(0, sourceCount - entries.value.length);
    },
    subscribe: (persist) => watch([entries, query, view], persist, { deep: true, flush: "sync" }),
    onError: reportError,
  });
  onScopeDispose(dataBinding.stop);

  function sanitize(nextValidIds: ReadonlySet<PalId>, nextDataVersion: string) {
    validIds = new Set(nextValidIds);
    const normalizedEntries = normalize(entries.value);
    if (
      normalizedEntries.length !== entries.value.length
      || normalizedEntries.some((entry, index) => entry.palId !== entries.value[index]?.palId)
    ) entries.value = normalizedEntries;
    cleanedCount.value = Math.max(0, sourceCount - entries.value.length);
    dataVersion.value = nextDataVersion;
    ready.value = true;
    dataBinding.persistIfInitialReadSucceeded();
  }

  function initialize(nextValidIds: ReadonlySet<PalId>, nextDataVersion: string) {
    sanitize(nextValidIds, nextDataVersion);
  }

  function setOwned(palId: PalId, owned: boolean) {
    if (!palId || (validIds && !validIds.has(palId))) return;
    entries.value = [
      ...entries.value.filter((entry) => entry.palId !== palId),
      ...(owned ? [{ palId }] : []),
    ];
  }

  function remove(palId: PalId) {
    entries.value = entries.value.filter((entry) => entry.palId !== palId);
  }

  function applyRoute(routeQuery: Readonly<Record<string, unknown>>) {
    if (!("view" in routeQuery)) return false;
    if ("view" in routeQuery) {
      const routeViewValue = Array.isArray(routeQuery.view) ? routeQuery.view[0] : routeQuery.view;
      if (routeViewValue === "owned" || routeViewValue === "all") view.value = routeViewValue;
    }
    return true;
  }

  return {
    entries,
    cleanedCount,
    dataVersion,
    ready,
    persistenceError,
    query,
    view,
    initialize,
    sanitize,
    applyRoute,
    setOwned,
    remove,
  };
});
