export interface LocalStorageBinding<T> {
  persist: () => void;
  persistIfInitialReadSucceeded: () => void;
  stop: () => void;
}

interface BindLocalStorageOptions<T> {
  key: string;
  decode: (value: unknown) => T | undefined;
  snapshot: () => unknown;
  apply: (value: T | undefined) => void;
  subscribe: (persist: () => void) => () => void;
  onError: (message: string) => void;
  syncTabs?: boolean;
}

function errorMessage(key: string, action: string, reason: unknown) {
  const detail = reason instanceof Error ? reason.message : String(reason);
  return `${key} ${action}失败：${detail}`;
}

/** Binds one validated JSON snapshot to localStorage without adding a plugin dependency. */
export function bindLocalStorage<T>({
  key,
  decode,
  snapshot,
  apply,
  subscribe,
  onError,
  syncTabs = true,
}: BindLocalStorageOptions<T>): LocalStorageBinding<T> {
  if (typeof window === "undefined") {
    return {
      persist: () => undefined,
      persistIfInitialReadSucceeded: () => undefined,
      stop: () => undefined,
    };
  }

  let storage: Storage;
  try {
    storage = window.localStorage;
  } catch (reason) {
    onError(errorMessage(key, "访问", reason));
    return {
      persist: () => undefined,
      persistIfInitialReadSucceeded: () => undefined,
      stop: () => undefined,
    };
  }

  let applyingExternal = false;
  let initialReadSucceeded = true;

  function decodeRaw(raw: string, action: string) {
    try {
      const value = decode(JSON.parse(raw) as unknown);
      if (value === undefined) throw new Error("数据格式无效");
      onError("");
      return value;
    } catch (reason) {
      onError(errorMessage(key, action, reason));
      return undefined;
    }
  }

  function persist() {
    if (applyingExternal) return;
    try {
      storage.setItem(key, JSON.stringify(snapshot()));
      initialReadSucceeded = true;
      onError("");
    } catch (reason) {
      onError(errorMessage(key, "保存", reason));
    }
  }

  try {
    const raw = storage.getItem(key);
    if (raw !== null) {
      const value = decodeRaw(raw, "读取");
      if (value !== undefined) apply(value);
      else initialReadSucceeded = false;
    }
  } catch (reason) {
    initialReadSucceeded = false;
    onError(errorMessage(key, "读取", reason));
  }

  // Store subscriptions must use flush: "sync" so the guard also covers remote patches.
  const stopSubscription = subscribe(persist);
  const onStorage = (event: StorageEvent) => {
    if ((event.key !== key && event.key !== null) || (event.storageArea && event.storageArea !== storage)) return;
    const value = event.newValue === null ? undefined : decodeRaw(event.newValue, "同步");
    if (event.newValue !== null && value === undefined) return;
    applyingExternal = true;
    try {
      apply(value);
    } finally {
      applyingExternal = false;
    }
  };
  if (syncTabs) window.addEventListener("storage", onStorage);

  return {
    persist,
    persistIfInitialReadSucceeded: () => {
      if (initialReadSucceeded) persist();
    },
    stop: () => {
      stopSubscription();
      if (syncTabs) window.removeEventListener("storage", onStorage);
    },
  };
}
