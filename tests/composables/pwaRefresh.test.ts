import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPwaRefreshAction,
  createReloadOnce,
  waitForServiceWorkerActivation,
} from "../../src/composables/pwaRefresh";
import type { ServiceWorkerContainerLike } from "../../src/composables/pwaRefresh";

class WaitingWorkerStub extends EventTarget {
  state = "installed";
}

class ServiceWorkerContainerStub extends EventTarget implements ServiceWorkerContainerLike {
  constructor(readonly waiting: WaitingWorkerStub | null = null) {
    super();
  }

  async getRegistration() {
    return { waiting: this.waiting };
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("PWA refresh controller", () => {
  it("deduplicates rapid clicks and reloads once after controllerchange", async () => {
    const serviceWorker = new ServiceWorkerContainerStub();
    const removeListener = vi.spyOn(serviceWorker, "removeEventListener");
    const update = vi.fn(async () => undefined);
    const reload = vi.fn();
    const refresh = createPwaRefreshAction({ update, reload, serviceWorker });

    const first = refresh();
    const second = refresh();
    expect(second).toBe(first);
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(reload).not.toHaveBeenCalled();

    serviceWorker.dispatchEvent(new Event("controllerchange"));
    await first;

    expect(reload).toHaveBeenCalledTimes(1);
    expect(removeListener).toHaveBeenCalledWith("controllerchange", expect.any(Function));
  });

  it("also reloads when a waiting worker activates without taking control", async () => {
    const waiting = new WaitingWorkerStub();
    const serviceWorker = new ServiceWorkerContainerStub(waiting);
    const update = vi.fn(async () => undefined);
    const reload = vi.fn();
    const refresh = createPwaRefreshAction({ update, reload, serviceWorker });

    const result = refresh();
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    waiting.state = "activated";
    waiting.dispatchEvent(new Event("statechange"));
    await result;

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("falls back to reloading when browser lifecycle events are missed", async () => {
    vi.useFakeTimers();
    const serviceWorker = new ServiceWorkerContainerStub();
    const update = vi.fn(async () => undefined);
    const reload = vi.fn();
    const refresh = createPwaRefreshAction({
      update,
      reload,
      serviceWorker,
      timeoutMs: 25,
    });

    const result = refresh();
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(25);
    await result;

    expect(update).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("recovers after an update error so the user can retry", async () => {
    const serviceWorker = new ServiceWorkerContainerStub();
    const update = vi.fn()
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce(undefined);
    const reload = vi.fn();
    const refresh = createPwaRefreshAction({ update, reload, serviceWorker });

    await expect(refresh()).rejects.toThrow("network error");
    expect(reload).not.toHaveBeenCalled();

    const retry = refresh();
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    serviceWorker.dispatchEvent(new Event("controllerchange"));
    await retry;

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("shares one reload lock between plugin and fallback callbacks", () => {
    const reload = vi.fn();
    const reloadOnce = createReloadOnce(reload);

    expect(reloadOnce()).toBe(true);
    expect(reloadOnce()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not let a stuck registration lookup block the fallback timer", async () => {
    vi.useFakeTimers();
    const serviceWorker = new ServiceWorkerContainerStub();
    vi.spyOn(serviceWorker, "getRegistration").mockImplementation(() => new Promise(() => undefined));
    const update = vi.fn(async () => undefined);
    const reload = vi.fn();
    const refresh = createPwaRefreshAction({
      update,
      reload,
      serviceWorker,
      timeoutMs: 25,
    });

    const result = refresh();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(25);
    await result;

    expect(update).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reports a pending update request as an error instead of reloading the old worker", async () => {
    vi.useFakeTimers();
    const serviceWorker = new ServiceWorkerContainerStub();
    let rejectUpdate: ((reason: Error) => void) | undefined;
    const update = vi.fn(() => new Promise<void>((_resolve, reject) => {
      rejectUpdate = reject;
    }));
    const reload = vi.fn();
    const refresh = createPwaRefreshAction({
      update,
      reload,
      serviceWorker,
      timeoutMs: 25,
    });

    const result = refresh();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(25);
    await expect(result).rejects.toThrow("更新请求超时");
    expect(reload).not.toHaveBeenCalled();

    rejectUpdate?.(new Error("late network error"));
    await Promise.resolve();
  });

  it("rejects redundant workers and removes both lifecycle listeners", async () => {
    const waiting = new WaitingWorkerStub();
    const serviceWorker = new ServiceWorkerContainerStub(waiting);
    const removeContainerListener = vi.spyOn(serviceWorker, "removeEventListener");
    const removeWaitingListener = vi.spyOn(waiting, "removeEventListener");
    const update = vi.fn(async () => undefined);

    const result = waitForServiceWorkerActivation(update, serviceWorker, 100);
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    waiting.state = "redundant";
    waiting.dispatchEvent(new Event("statechange"));

    await expect(result).rejects.toThrow("无法激活");
    expect(removeContainerListener).toHaveBeenCalledWith("controllerchange", expect.any(Function));
    expect(removeWaitingListener).toHaveBeenCalledWith("statechange", expect.any(Function));
  });
});
