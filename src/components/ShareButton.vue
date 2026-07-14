<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, useTemplateRef } from "vue";
import type { RouteLocationRaw } from "vue-router";
import { useShare } from "@/composables/useShare";

const props = withDefaults(defineProps<{
  to?: RouteLocationRaw;
  title?: string;
  text?: string;
  label?: string;
  disabled?: boolean;
}>(), {
  to: undefined,
  title: undefined,
  text: undefined,
  label: "分享",
  disabled: false,
});

const isSharing = ref(false);
const result = ref<"idle" | "shared" | "copied" | "manual">("idle");
const announcement = ref("");
const manualInput = useTemplateRef<HTMLInputElement>("manualInput");
const manualInputId = `share-url-${useId()}`;
let resetTimer: number | undefined;

const { shareUrl, share } = useShare({
  to: () => props.to,
  title: () => props.title ?? (typeof document === "undefined" ? undefined : document.title),
  text: () => props.text,
});

const buttonLabel = computed(() => {
  if (isSharing.value) return "正在分享…";
  if (result.value === "shared") return "已分享";
  if (result.value === "copied") return "链接已复制";
  return props.label;
});

function scheduleReset() {
  if (resetTimer !== undefined) window.clearTimeout(resetTimer);
  resetTimer = window.setTimeout(() => {
    result.value = "idle";
    announcement.value = "";
    resetTimer = undefined;
  }, 2500);
}

async function handleShare() {
  if (props.disabled || isSharing.value) return;

  if (resetTimer !== undefined) {
    window.clearTimeout(resetTimer);
    resetTimer = undefined;
  }
  result.value = "idle";
  announcement.value = "";
  isSharing.value = true;

  try {
    const outcome = await share();
    if (outcome.status === "cancelled") return;

    result.value = outcome.status;
    if (outcome.status === "shared") {
      announcement.value = "分享面板已打开。";
      scheduleReset();
    } else if (outcome.status === "copied") {
      announcement.value = "链接已复制到剪贴板。";
      scheduleReset();
    } else {
      announcement.value = "自动复制失败，请手动复制链接。";
      await nextTick();
      manualInput.value?.focus();
      manualInput.value?.select();
    }
  } finally {
    isSharing.value = false;
  }
}

function selectManualUrl(event: Event) {
  (event.currentTarget as HTMLInputElement).select();
}

onBeforeUnmount(() => {
  if (resetTimer !== undefined) window.clearTimeout(resetTimer);
});
</script>

<template>
  <div class="share-action">
    <button
      class="share-button"
      type="button"
      :disabled="disabled || isSharing"
      @click="handleShare"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18 16a3 3 0 0 0-2.4 1.2l-6.8-4a3.3 3.3 0 0 0 0-2.4l6.8-4A3 3 0 1 0 15 5a2 2 0 0 0 .1.6l-6.8 4A3 3 0 1 0 8.3 14l6.8 4a2 2 0 0 0-.1.6 3 3 0 1 0 3-2.6Z" />
      </svg>
      <span>{{ buttonLabel }}</span>
    </button>

    <span class="sr-only" role="status" aria-live="polite">{{ announcement }}</span>

    <div v-if="result === 'manual'" class="share-manual-copy">
      <label :for="manualInputId">自动复制失败，请手动复制链接</label>
      <input
        :id="manualInputId"
        ref="manualInput"
        type="url"
        :value="shareUrl"
        readonly
        spellcheck="false"
        @click="selectManualUrl"
        @focus="selectManualUrl"
      >
    </div>
  </div>
</template>
