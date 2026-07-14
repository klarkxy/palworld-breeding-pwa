import { describe, expect, it, vi } from "vitest";
import {
  getBrowserShareCapabilities,
  isShareAbortError,
  resolveAbsoluteShareUrl,
  shareLink,
} from "@/composables/share";

describe("share URL resolution", () => {
  it("keeps the router deployment base and hash route", () => {
    const router = {
      resolve: vi.fn(() => ({ href: "/palworld-breeding-pwa/#/paldex/Anubis?state=1&stars=4" })),
    };

    expect(resolveAbsoluteShareUrl(
      router as never,
      { name: "paldex-detail", params: { id: "Anubis" } },
      "https://example.test/palworld-breeding-pwa/#/breeding",
    )).toBe("https://example.test/palworld-breeding-pwa/#/paldex/Anubis?state=1&stars=4");
  });

  it("resolves a hash-only href relative to the current app document", () => {
    const router = { resolve: () => ({ href: "#/items?state=1" }) };

    expect(resolveAbsoluteShareUrl(
      router as never,
      "/items",
      "https://example.test/tools/pal/#/breeding",
    )).toBe("https://example.test/tools/pal/#/items?state=1");
  });
});

describe("shareLink", () => {
  const payload = {
    url: "https://example.test/pal/#/paths?state=1",
    title: "繁育路线",
    text: "查看这条路线",
  };

  it("prefers the native share sheet", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);

    await expect(shareLink(payload, { share, writeText })).resolves.toEqual({
      status: "shared",
      url: payload.url,
    });
    expect(share).toHaveBeenCalledWith(payload);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("silently stops when the user cancels native sharing", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError"));
    const writeText = vi.fn().mockResolvedValue(undefined);

    await expect(shareLink(payload, { share, writeText })).resolves.toEqual({
      status: "cancelled",
      url: payload.url,
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies the URL when native sharing is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    await expect(shareLink(payload, { writeText })).resolves.toEqual({
      status: "copied",
      url: payload.url,
    });
    expect(writeText).toHaveBeenCalledWith(payload.url);
  });

  it("falls back to the clipboard after a non-cancellation share error", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("blocked", "NotAllowedError"));
    const writeText = vi.fn().mockResolvedValue(undefined);

    await expect(shareLink(payload, { share, writeText })).resolves.toMatchObject({ status: "copied" });
    expect(writeText).toHaveBeenCalledWith(payload.url);
  });

  it("returns a manual-copy result when clipboard writing fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard blocked"));

    await expect(shareLink(payload, { writeText })).resolves.toEqual({
      status: "manual",
      url: payload.url,
    });
  });

  it("omits empty optional fields from the native payload", async () => {
    const share = vi.fn().mockResolvedValue(undefined);

    await shareLink({ url: payload.url }, { share });

    expect(share).toHaveBeenCalledWith({ url: payload.url });
  });
});

describe("browser share capabilities", () => {
  it("binds browser methods to their owning objects", async () => {
    const clipboard = {
      prefix: "copied:",
      writeText(this: { prefix: string }, value: string) {
        return Promise.resolve(`${this.prefix}${value}`);
      },
    };
    const browserNavigator = {
      marker: "navigator",
      share(this: { marker: string }) {
        return this.marker === "navigator" ? Promise.resolve() : Promise.reject(new Error("unbound"));
      },
      clipboard,
    };

    const capabilities = getBrowserShareCapabilities(browserNavigator as never);
    await expect(capabilities.share?.({ url: "https://example.test" })).resolves.toBeUndefined();
    await expect(capabilities.writeText?.("url")).resolves.toBe("copied:url");
  });

  it("recognizes AbortError-shaped failures", () => {
    expect(isShareAbortError({ name: "AbortError" })).toBe(true);
    expect(isShareAbortError(new Error("other"))).toBe(false);
    expect(isShareAbortError(null)).toBe(false);
  });
});
