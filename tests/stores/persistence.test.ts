import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBreedingStore, BREEDING_STORAGE_KEY } from "../../src/stores/breeding";
import { COLLECTION_STORAGE_KEY, decodeStoredCollection, useCollectionStore } from "../../src/stores/collection";
import { decodePaldexSnapshot, PALDEX_STORAGE_KEY, usePaldexStore } from "../../src/stores/paldex";
import { decodePathsSnapshot, PATHS_STORAGE_KEY, usePathsStore } from "../../src/stores/paths";

describe("Pinia local persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  afterEach(() => vi.restoreAllMocks());

  it("migrates legacy sex entries to deduplicated species without losing valid IDs", () => {
    localStorage.setItem(COLLECTION_STORAGE_KEY, JSON.stringify({
      schema: 1,
      dataVersion: "old",
      entries: [
        { palId: "A", male: true, female: false },
        { palId: "A", male: false, female: true },
        { palId: "B", male: false, female: false },
        { palId: "removed", male: true, female: false },
      ],
    }));

    const store = useCollectionStore();
    store.initialize(new Set(["A", "B"]), "current");

    expect(store.entries).toEqual([{ palId: "A" }]);
    expect(store.cleanedCount).toBe(1);
    expect(JSON.parse(localStorage.getItem(COLLECTION_STORAGE_KEY) ?? "null")).toMatchObject({
      schema: 2,
      dataVersion: "current",
      entries: [{ palId: "A" }],
    });
    store.$dispose();
  });

  it("accepts the existing schema-2 envelope and sanitizes optional UI state", () => {
    expect(decodeStoredCollection({
      schema: 2,
      dataVersion: "v1",
      entries: [{ palId: "A" }, { palId: 3 }],
      query: "x".repeat(250),
      view: "owned",
    })).toMatchObject({
      schema: 2,
      entries: [{ palId: "A" }],
      query: "x".repeat(200),
      view: "owned",
      sourceCount: 1,
    });
  });

  it.each([
    ["unknown schema", JSON.stringify({ schema: 99, entries: [{ palId: "A" }] })],
    ["malformed JSON", "{broken"],
  ])("preserves collection data after an %s until the user changes it", (_case, raw) => {
    localStorage.setItem(COLLECTION_STORAGE_KEY, raw);
    const store = useCollectionStore();

    store.initialize(new Set(["A"]), "current");

    expect(localStorage.getItem(COLLECTION_STORAGE_KEY)).toBe(raw);
    expect(store.persistenceError).toContain("读取失败");

    store.setOwned("A", true);
    expect(store.persistenceError).toBe("");
    expect(JSON.parse(localStorage.getItem(COLLECTION_STORAGE_KEY) ?? "null")).toMatchObject({
      schema: 2,
      dataVersion: "current",
      entries: [{ palId: "A" }],
    });
    store.$dispose();

    setActivePinia(createPinia());
    const restored = useCollectionStore();
    restored.initialize(new Set(["A"]), "current");
    expect(restored.entries).toEqual([{ palId: "A" }]);
    restored.$dispose();
  });

  it("does not erase collection data when the initial storage read fails", () => {
    const raw = JSON.stringify({ schema: 2, entries: [{ palId: "A" }] });
    localStorage.setItem(COLLECTION_STORAGE_KEY, raw);
    const read = vi.spyOn(localStorage, "getItem").mockImplementationOnce(() => {
      throw new DOMException("private mode", "SecurityError");
    });
    const store = useCollectionStore();

    store.initialize(new Set(["A"]), "current");

    expect(localStorage.getItem(COLLECTION_STORAGE_KEY)).toBe(raw);
    expect(store.persistenceError).toContain("读取失败");
    store.setOwned("A", true);
    expect(store.persistenceError).toBe("");
    expect(JSON.parse(localStorage.getItem(COLLECTION_STORAGE_KEY) ?? "null")).toMatchObject({
      schema: 2,
      entries: [{ palId: "A" }],
    });
    store.$dispose();
    read.mockRestore();
  });

  it("migrates a removed mate-mode snapshot without writing it back", () => {
    const store = useBreedingStore();
    store.sanitize(new Set(["A", "B"]));
    const write = vi.spyOn(Storage.prototype, "setItem");
    window.dispatchEvent(new StorageEvent("storage", {
      key: BREEDING_STORAGE_KEY,
      storageArea: localStorage,
      newValue: JSON.stringify({
        schema: 1,
        mode: "mate",
        parentA: "A",
        parentB: "",
        target: "B",
        ownedOnly: false,
      }),
    }));

    expect(store.mode).toBe("pairs");
    expect(store.parentA).toBe("A");
    expect(store.target).toBe("B");
    expect(write).not.toHaveBeenCalled();

    window.dispatchEvent(new StorageEvent("storage", {
      key: null,
      storageArea: localStorage,
      newValue: null,
    }));
    expect(store.parentA).toBe("");

    store.$dispose();
    window.dispatchEvent(new StorageEvent("storage", {
      key: BREEDING_STORAGE_KEY,
      storageArea: localStorage,
      newValue: JSON.stringify({ schema: 1, mode: "forward", parentA: "A", parentB: "B", target: "", ownedOnly: false }),
    }));
    expect(store.parentA).toBe("");
  });

  it("keeps the app usable when localStorage rejects a write and clears the warning after recovery", () => {
    const write = vi.spyOn(localStorage, "setItem").mockImplementationOnce(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    const store = useBreedingStore();

    store.parentA = "A";

    expect(store.parentA).toBe("A");
    expect(store.persistenceError).toContain("保存失败");
    store.parentA = "B";
    expect(store.persistenceError).toBe("");
    store.$dispose();
    write.mockRestore();
  });

  it("survives malformed JSON, unknown schemas, and storage read failures", () => {
    localStorage.setItem(BREEDING_STORAGE_KEY, "{broken");
    const malformed = useBreedingStore();
    expect(malformed.parentA).toBe("");
    expect(malformed.persistenceError).toContain("读取失败");
    malformed.$dispose();

    localStorage.removeItem(BREEDING_STORAGE_KEY);
    localStorage.setItem(PALDEX_STORAGE_KEY, JSON.stringify({ schema: 99 }));
    const unknown = usePaldexStore();
    expect(unknown.sortKey).toBe("dex");
    expect(unknown.persistenceError).toContain("读取失败");
    unknown.$dispose();

    localStorage.removeItem(PALDEX_STORAGE_KEY);
    const read = vi.spyOn(Storage.prototype, "getItem").mockImplementationOnce(() => {
      throw new DOMException("private mode", "SecurityError");
    });
    const rejected = useBreedingStore();
    expect(rejected.parentA).toBe("");
    expect(rejected.persistenceError).toContain("读取失败");
    rejected.$dispose();
    read.mockRestore();
  });

  it("clamps path settings and never persists result trees", () => {
    expect(decodePathsSnapshot({
      schema: 1,
      mode: "invalid",
      start: "A",
      target: "T",
      maxDepth: 99,
      lastRun: { mode: "single", start: "A", target: "T", maxDepth: 0 },
      plans: [{ generations: 99 }],
    })).toEqual({
      schema: 1,
      mode: "single",
      start: "A",
      target: "T",
      maxDepth: 8,
      lastRun: { mode: "single", start: "A", target: "T", maxDepth: 1 },
    });

    const store = usePathsStore();
    store.start = "A";
    store.target = "T";
    store.submit();
    expect(JSON.parse(localStorage.getItem("pal-lab.paths.v1") ?? "null")).not.toHaveProperty("plans");
    store.$dispose();
  });

  it("lets legal route fields override only their saved counterparts", () => {
    const store = useBreedingStore();
    store.sanitize(new Set(["saved-a", "saved-b", "saved-target", "route-target"]));
    store.parentA = "saved-a";
    store.parentB = "saved-b";
    store.target = "saved-target";

    store.applyRoute({ mode: "mate" });
    expect(store.mode).toBe("pairs");
    store.applyRoute({ mode: "pairs", target: "route-target" });

    expect(store.mode).toBe("pairs");
    expect(store.parentA).toBe("saved-a");
    expect(store.parentB).toBe("saved-b");
    expect(store.target).toBe("route-target");

    store.applyRoute({ a: "removed" });
    expect(store.parentA).toBe("saved-a");
    store.applyRoute({ a: "", b: [""], target: "" });
    expect(store.parentA).toBe("saved-a");
    expect(store.parentB).toBe("saved-b");
    expect(store.target).toBe("route-target");
    store.$dispose();
  });

  it("validates route depth and enums without erasing unrelated saved fields", () => {
    const collection = useCollectionStore();
    collection.query = "saved";
    collection.view = "all";
    collection.applyRoute({ view: "owned" });
    expect(collection.query).toBe("saved");
    expect(collection.view).toBe("owned");
    collection.applyRoute({ view: "invalid" });
    expect(collection.view).toBe("owned");
    collection.$dispose();

    const paths = usePathsStore();
    paths.sanitize(new Set(["A", "B", "C"]));
    paths.start = "A";
    paths.target = "B";
    paths.maxDepth = 4;
    paths.submit();
    paths.applyRoute({ target: "C", depth: "99" });
    expect(paths.start).toBe("A");
    expect(paths.target).toBe("C");
    expect(paths.maxDepth).toBe(8);
    expect(paths.lastRun).toBeUndefined();
    paths.submit();
    paths.applyRoute({ mode: "invalid", depth: "invalid", start: "removed" });
    expect(paths.start).toBe("A");
    expect(paths.maxDepth).toBe(8);
    expect(paths.lastRun).toEqual({ mode: "single", start: "A", target: "C", maxDepth: 8 });
    paths.applyRoute({ start: "", target: [""], depth: "" });
    expect(paths.start).toBe("A");
    expect(paths.target).toBe("C");
    expect(paths.maxDepth).toBe(8);
    expect(paths.lastRun).toEqual({ mode: "single", start: "A", target: "C", maxDepth: 8 });
    paths.applyRoute({ depth: null });
    expect(paths.maxDepth).toBe(8);
    paths.$dispose();

    const paldex = usePaldexStore();
    paldex.sanitize(new Set(["fire"]), new Set(["mining"]));
    paldex.query = "saved";
    paldex.element = "fire";
    paldex.applyRoute({ sort: "attack", stars: "4", movement: "fly" });
    expect(paldex.query).toBe("saved");
    expect(paldex.element).toBe("fire");
    expect(paldex.sortKey).toBe("attack");
    expect(paldex.selectedStars).toBe(4);
    expect(paldex.movement).toBe("fly");
    paldex.applyRoute({ sort: "invalid", stars: "9", movement: "invalid" });
    expect(paldex.sortKey).toBe("attack");
    expect(paldex.selectedStars).toBe(4);
    expect(paldex.movement).toBe("fly");
    expect(paldex.applyRoute({ variant: "base" })).toBe(false);
    expect(paldex.movement).toBe("fly");
    expect(decodePaldexSnapshot({
      schema: 1,
      query: "legacy",
      element: "fire",
      work: "mining",
      variant: "base",
      sortKey: "attack",
      selectedStars: 4,
    })).toMatchObject({ schema: 2, query: "legacy", movement: "all" });
    paldex.$dispose();
  });

  it("revalidates later cross-tab snapshots and keeps a submitted path reproducible", () => {
    const breeding = useBreedingStore();
    breeding.sanitize(new Set(["A", "B"]));
    window.dispatchEvent(new StorageEvent("storage", {
      key: BREEDING_STORAGE_KEY,
      storageArea: localStorage,
      newValue: JSON.stringify({ schema: 1, mode: "forward", parentA: "removed", parentB: "B", target: "", ownedOnly: false }),
    }));
    expect(breeding.parentA).toBe("");
    breeding.$dispose();

    const paths = usePathsStore();
    paths.sanitize(new Set(["A", "B"]));
    paths.start = "A";
    paths.target = "B";
    paths.submit();
    paths.$dispose();

    setActivePinia(createPinia());
    const restored = usePathsStore();
    restored.sanitize(new Set(["A", "B"]));
    expect(restored.lastRun).toEqual({ mode: "single", start: "A", target: "B", maxDepth: 5 });
    restored.$dispose();
  });

  it("sanitizes later path and Paldex snapshots with the loaded data domain", () => {
    const paths = usePathsStore();
    paths.sanitize(new Set(["A", "B"]));
    window.dispatchEvent(new StorageEvent("storage", {
      key: PATHS_STORAGE_KEY,
      storageArea: localStorage,
      newValue: JSON.stringify({
        schema: 1,
        mode: "single",
        start: "removed",
        target: "B",
        maxDepth: 5,
        lastRun: { mode: "single", start: "removed", target: "B", maxDepth: 5 },
      }),
    }));
    expect(paths.start).toBe("");
    expect(paths.lastRun).toBeUndefined();
    paths.$dispose();

    const paldex = usePaldexStore();
    paldex.sanitize(new Set(["fire"]), new Set(["mining"]));
    window.dispatchEvent(new StorageEvent("storage", {
      key: PALDEX_STORAGE_KEY,
      storageArea: localStorage,
      newValue: JSON.stringify({
        schema: 2,
        query: "",
        element: "removed",
        work: "removed",
        movement: "swim",
        sortKey: "dex",
        selectedStars: 0,
      }),
    }));
    expect(paldex.element).toBe("");
    expect(paldex.work).toBe("");
    expect(paldex.movement).toBe("swim");
    paldex.$dispose();
  });
});
