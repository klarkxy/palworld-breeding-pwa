import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useRoute, useRouter, type RouteLocationRaw } from "vue-router";
import {
  getBrowserShareCapabilities,
  resolveAbsoluteShareUrl,
  shareLink,
  type ShareLinkResult,
} from "@/composables/share";

export interface UseShareOptions {
  to?: MaybeRefOrGetter<RouteLocationRaw | undefined>;
  title?: MaybeRefOrGetter<string | undefined>;
  text?: MaybeRefOrGetter<string | undefined>;
}

export function useShare(options: UseShareOptions = {}) {
  const router = useRouter();
  const route = useRoute();

  const shareUrl = computed(() => resolveAbsoluteShareUrl(
    router,
    toValue(options.to) ?? route.fullPath,
    typeof window === "undefined" ? "http://localhost/" : window.location.href,
  ));

  async function share(): Promise<ShareLinkResult> {
    return shareLink(
      {
        url: shareUrl.value,
        title: toValue(options.title),
        text: toValue(options.text),
      },
      getBrowserShareCapabilities(),
    );
  }

  return { shareUrl, share };
}
