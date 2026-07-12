import { storeToRefs } from "pinia";
import { usePalDataStore } from "@/stores/palData";

export * from "@/stores/palData";

/** Compatibility facade for existing views; new code may use the Pinia store directly. */
export function usePalData() {
  const store = usePalDataStore();
  return { ...storeToRefs(store), load: store.load };
}
