import { readonly, ref, watch } from "vue";
import type { OwnedEntry, PalId } from "@/core";

const STORAGE_KEY = "pal-lab.collection.v1";
const entries = ref<OwnedEntry[]>([]);
const cleanedCount = ref(0);
let isReady = false;

interface StoredCollection {
  schema: 1 | 2;
  dataVersion: string;
  entries: unknown[];
}

function readStored(): StoredCollection | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredCollection) : undefined;
  } catch {
    return undefined;
  }
}

function persist(dataVersion: string) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ schema: 2, dataVersion, entries: entries.value } satisfies StoredCollection),
  );
}

function storedPalId(value: unknown, schema: 1 | 2): PalId | undefined {
  if (!value || typeof value !== "object") return undefined;
  const entry = value as { palId?: unknown; male?: unknown; female?: unknown };
  if (typeof entry.palId !== "string") return undefined;
  if (schema === 1 && entry.male !== true && entry.female !== true) return undefined;
  return entry.palId;
}

export function useCollection() {
  function initialize(validIds: ReadonlySet<PalId>, dataVersion: string) {
    if (isReady) return;
    const stored = readStored();
    const hasKnownSchema = stored?.schema === 1 || stored?.schema === 2;
    const schema = stored?.schema === 1 ? 1 : 2;
    const restored = hasKnownSchema && Array.isArray(stored.entries) ? stored.entries : [];
    const restoredIds = restored
      .map((entry) => storedPalId(entry, schema))
      .filter((palId): palId is PalId => Boolean(palId && validIds.has(palId)));
    entries.value = [...new Set(restoredIds)].map((palId) => ({ palId }));
    cleanedCount.value = restored.length - entries.value.length;
    isReady = true;
    watch(entries, () => persist(dataVersion));
    persist(dataVersion);
  }

  function setOwned(palId: PalId, owned: boolean) {
    entries.value = [
      ...entries.value.filter((entry) => entry.palId !== palId),
      ...(owned ? [{ palId }] : []),
    ];
  }

  function remove(palId: PalId) {
    entries.value = entries.value.filter((entry) => entry.palId !== palId);
  }

  return { entries: readonly(entries), cleanedCount: readonly(cleanedCount), initialize, setOwned, remove };
}
