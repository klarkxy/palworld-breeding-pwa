export const PWA_REFRESH_FALLBACK_MS = 2_500;

interface WaitingServiceWorker extends EventTarget {
  readonly state?: string;
}

interface ServiceWorkerRegistrationLike {
  readonly waiting?: WaitingServiceWorker | null;
}

export interface ServiceWorkerContainerLike extends EventTarget {
  getRegistration?: () => Promise<ServiceWorkerRegistrationLike | undefined>;
}

export interface PwaRefreshOptions {
  update: () => Promise<void>;
  reload: () => void;
  serviceWorker?: ServiceWorkerContainerLike;
  timeoutMs?: number;
}

/** Shares one reload lock between Workbox callbacks and the manual fallback. */
export function createReloadOnce(reload: () => void) {
  let requested = false;
  return function reloadOnce() {
    if (requested) return false;
    requested = true;
    reload();
    return true;
  };
}

function currentServiceWorker(): ServiceWorkerContainerLike | undefined {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return undefined;
  return navigator.serviceWorker as unknown as ServiceWorkerContainerLike;
}

/**
 * Waits for the new worker to control this page (or at least activate) before
 * reloading. The timeout covers registration lookup and the update request:
 * only a completed update may use the reload fallback.
 */
export async function waitForServiceWorkerActivation(
  update: () => Promise<void>,
  serviceWorker = currentServiceWorker(),
  timeoutMs = PWA_REFRESH_FALLBACK_MS,
): Promise<"controllerchange" | "activated" | "timeout" | "unsupported"> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let updateCompleted = false;
    let activationResult: "controllerchange" | "activated" | undefined;
    let waiting: WaitingServiceWorker | null | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer);
      serviceWorker?.removeEventListener("controllerchange", onControllerChange);
      waiting?.removeEventListener("statechange", onWaitingStateChange);
    };
    const finish = (result: "controllerchange" | "activated" | "timeout" | "unsupported") => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const fail = (reason: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(reason instanceof Error ? reason : new Error("Service Worker 更新失败。"));
    };
    const observeActivation = (result: "controllerchange" | "activated") => {
      activationResult ??= result;
      if (updateCompleted) finish(activationResult);
    };
    function onControllerChange() {
      observeActivation("controllerchange");
    }
    function onWaitingStateChange() {
      if (waiting?.state === "activated") observeActivation("activated");
      if (waiting?.state === "redundant") fail(new Error("新的 Service Worker 无法激活。"));
    }

    timer = setTimeout(() => {
      if (updateCompleted) {
        finish(serviceWorker ? "timeout" : "unsupported");
      } else {
        fail(new Error("Service Worker 更新请求超时。"));
      }
    }, timeoutMs);
    serviceWorker?.addEventListener("controllerchange", onControllerChange);

    if (serviceWorker?.getRegistration) {
      try {
        void serviceWorker.getRegistration().then((registration) => {
          if (settled) return;
          waiting = registration?.waiting;
          waiting?.addEventListener("statechange", onWaitingStateChange);
          if (waiting?.state === "activated") observeActivation("activated");
          if (waiting?.state === "redundant") fail(new Error("新的 Service Worker 无法激活。"));
        }).catch(() => {
          // controllerchange and the total timeout remain valid fallbacks.
        });
      } catch {
        // controllerchange and the total timeout remain valid fallbacks.
      }
    }

    try {
      void Promise.resolve(update()).then(() => {
        if (settled) return;
        updateCompleted = true;
        if (!serviceWorker) {
          finish("unsupported");
        } else if (activationResult) {
          finish(activationResult);
        }
      }, fail);
    } catch (error) {
      fail(error);
    }
  });
}

/** Creates a deduplicated refresh action so rapid clicks update and reload once. */
export function createPwaRefreshAction(options: PwaRefreshOptions) {
  let running: Promise<void> | undefined;

  return function refreshPwa() {
    if (running) return running;
    const current = (async () => {
      await waitForServiceWorkerActivation(
        options.update,
        options.serviceWorker ?? currentServiceWorker(),
        options.timeoutMs,
      );
      options.reload();
    })();
    running = current;
    current.then(
      () => { if (running === current) running = undefined; },
      () => { if (running === current) running = undefined; },
    );
    return current;
  };
}
