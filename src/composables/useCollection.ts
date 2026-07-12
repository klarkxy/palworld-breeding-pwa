import { storeToRefs } from "pinia";
import { useCollectionStore } from "@/stores/collection";

export * from "@/stores/collection";

/** Compatibility facade for existing views; new code may use the Pinia store directly. */
export function useCollection() {
  const store = useCollectionStore();
  const { entries, cleanedCount, dataVersion, ready, persistenceError, query, view } = storeToRefs(store);
  return {
    entries,
    cleanedCount,
    dataVersion,
    ready,
    persistenceError,
    query,
    view,
    initialize: store.initialize,
    sanitize: store.sanitize,
    applyRoute: store.applyRoute,
    setOwned: store.setOwned,
    remove: store.remove,
  };
}
