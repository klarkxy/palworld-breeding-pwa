import type { RouteLocationRaw, Router } from "vue-router";

export interface ShareLinkPayload {
  url: string;
  title?: string;
  text?: string;
}

export interface ShareCapabilities {
  share?: (data: ShareData) => Promise<void>;
  writeText?: (text: string) => Promise<void>;
}

export type ShareLinkResult =
  | { status: "shared"; url: string }
  | { status: "copied"; url: string }
  | { status: "cancelled"; url: string }
  | { status: "manual"; url: string };

type RouteResolver = Pick<Router, "resolve">;

/**
 * Resolve through Vue Router first so hash history and Vite's deployment base
 * remain part of the generated URL.
 */
export function resolveAbsoluteShareUrl(
  router: RouteResolver,
  to: RouteLocationRaw,
  currentHref: string,
): string {
  return new URL(router.resolve(to).href, currentHref).href;
}

export function isShareAbortError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "name" in error
    && error.name === "AbortError";
}

function toShareData(payload: ShareLinkPayload): ShareData {
  return {
    url: payload.url,
    ...(payload.title ? { title: payload.title } : {}),
    ...(payload.text ? { text: payload.text } : {}),
  };
}

/**
 * Prefer the operating system share sheet, then copy the URL. A caller can
 * expose the returned URL for manual copying when both browser APIs fail.
 */
export async function shareLink(
  payload: ShareLinkPayload,
  capabilities: ShareCapabilities,
): Promise<ShareLinkResult> {
  if (capabilities.share) {
    try {
      await capabilities.share(toShareData(payload));
      return { status: "shared", url: payload.url };
    } catch (error) {
      if (isShareAbortError(error)) {
        return { status: "cancelled", url: payload.url };
      }
    }
  }

  if (capabilities.writeText) {
    try {
      await capabilities.writeText(payload.url);
      return { status: "copied", url: payload.url };
    } catch {
      // The component will expose a selectable URL for manual copying.
    }
  }

  return { status: "manual", url: payload.url };
}

export function getBrowserShareCapabilities(
  browserNavigator: Navigator | undefined = typeof navigator === "undefined" ? undefined : navigator,
): ShareCapabilities {
  if (!browserNavigator) return {};

  return {
    ...(typeof browserNavigator.share === "function"
      ? { share: browserNavigator.share.bind(browserNavigator) }
      : {}),
    ...(typeof browserNavigator.clipboard?.writeText === "function"
      ? { writeText: browserNavigator.clipboard.writeText.bind(browserNavigator.clipboard) }
      : {}),
  };
}
