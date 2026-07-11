import { readonly, ref, watch } from "vue";
import type { OwnedEntry, PalId } from "@/core";

const STORAGE_KEY = "pal-lab.collection.v1";
const entries = ref<OwnedEntry[]>([]);
const cleanedCount = ref(0);
let isReady = false;

interface StoredCollection {
  schema: 1;
  dataVersion: string;
  entries: OwnedEntry[];
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
    JSON.stringify({ schema: 1, dataVersion, entries: entries.value } satisfies StoredCollection),
  );
}

export function useCollection() {
  function initialize(validIds: ReadonlySet<PalId>, dataVersion: string) {
    if (isReady) return;
    const stored = readStored();
    const restored = stored?.schema === 1 && Array.isArray(stored.entries) ? stored.entries : [];
    entries.value = restored.filter((entry) =>
      entry && typeof entry.palId === "string" && validIds.has(entry.palId)
      && typeof entry.male === "boolean" && typeof entry.female === "boolean",
    );
    cleanedCount.value = restored.length - entries.value.length;
    isReady = true;
    watch(entries, () => persist(dataVersion), { deep: true });
    persist(dataVersion);
  }

  function setSex(palId: PalId, sex: "male" | "female", owned: boolean) {
    const current = entries.value.find((entry) => entry.palId === palId);
    const next = current ?? { palId, male: false, female: false };
    next[sex] = owned;
    entries.value = [
      ...entries.value.filter((entry) => entry.palId !== palId),
      ...(next.male || next.female ? [{ ...next }] : []),
    ];
  }

  function remove(palId: PalId) {
    entries.value = entries.value.filter((entry) => entry.palId !== palId);
  }

  return { entries: readonly(entries), cleanedCount: readonly(cleanedCount), initialize, setSex, remove };
}
