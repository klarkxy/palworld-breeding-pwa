<script setup lang="ts">
import { computed, watch } from "vue";
import { storeToRefs } from "pinia";
import { NAlert, NButton, NConfigProvider, zhCN } from "naive-ui";
import type { GlobalThemeOverrides } from "naive-ui";
import { useRegisterSW } from "virtual:pwa-register/vue";
import { isSelectablePal } from "@/composables/usePalData";
import { useBreedingStore } from "@/stores/breeding";
import { useCollectionStore } from "@/stores/collection";
import { usePalDataStore } from "@/stores/palData";
import { usePaldexStore } from "@/stores/paldex";
import { usePathsStore } from "@/stores/paths";

const palData = usePalDataStore();
const collection = useCollectionStore();
const breeding = useBreedingStore();
const paths = usePathsStore();
const paldex = usePaldexStore();
const { manifest, pals } = storeToRefs(palData);
const persistenceError = computed(() => collection.persistenceError || breeding.persistenceError || paths.persistenceError || paldex.persistenceError);
const { needRefresh, updateServiceWorker } = useRegisterSW();
const licenseUrl = `${import.meta.env.BASE_URL}LICENSE.txt`;
const noticesUrl = `${import.meta.env.BASE_URL}THIRD_PARTY_NOTICES.txt`;
const navigation = [
  { to: "/breeding", label: "配种", icon: "⊕" },
  { to: "/paths", label: "路线", icon: "⌁" },
  { to: "/paldex", label: "图鉴", icon: "▦" },
  { to: "/passives", label: "词条", icon: "✦" },
  { to: "/items", label: "道具", icon: "▣" },
];
const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: "#173c4a",
    primaryColorHover: "#08708f",
    primaryColorPressed: "#075d76",
    primaryColorSuppl: "#18a8d2",
    textColorBase: "#173c4a",
    textColor1: "#173c4a",
    textColor2: "#54717b",
    borderColor: "#c8e2e9",
    borderRadius: "14px",
    fontFamily: '"Microsoft YaHei UI", "PingFang SC", system-ui, sans-serif',
    fontFamilyMono: 'Bahnschrift, "Segoe UI", sans-serif',
    fontSize: "16px",
    fontSizeMedium: "16px",
    fontSizeLarge: "16px",
    heightMedium: "48px",
    heightLarge: "48px",
  },
  Button: {
    heightMedium: "44px",
    heightLarge: "52px",
    fontSizeMedium: "16px",
    fontSizeLarge: "17px",
    borderRadiusMedium: "999px",
    borderRadiusLarge: "999px",
  },
  Input: {
    heightMedium: "48px",
    heightLarge: "48px",
    fontSizeMedium: "16px",
    fontSizeLarge: "16px",
    borderRadius: "14px",
  },
  Tabs: {
    colorSegment: "rgba(255,255,255,.58)",
    tabColorSegment: "#173c4a",
    tabTextColorSegment: "#173c4a",
    tabTextColorActiveSegment: "#ffffff",
    tabTextColorHoverSegment: "#08708f",
    tabFontSizeMedium: "16px",
    tabPaddingMediumSegment: "14px 8px",
    tabBorderRadius: "16px",
  },
  Radio: {
    buttonHeightMedium: "44px",
    fontSizeMedium: "16px",
    buttonColorActive: "#ffffff",
    buttonTextColorActive: "#08708f",
    buttonBorderColorActive: "#18a8d2",
    buttonBorderRadius: "12px",
  },
  Checkbox: {
    fontSizeMedium: "16px",
    sizeMedium: "20px",
  },
  Drawer: {
    color: "#fffdf7",
    textColor: "#173c4a",
    headerPadding: "0",
    bodyPadding: "0",
    headerBorderBottom: "1px solid #c8e2e9",
    boxShadow: "-24px 0 54px rgba(23,60,74,.28)",
  },
};

function focusMain() {
  const main = document.querySelector<HTMLElement>("#main-view main");
  if (!main) return;
  main.tabIndex = -1;
  main.focus();
}

palData.load();
watch([manifest, pals], ([nextManifest, nextPals]) => {
  if (nextManifest && nextPals.length) {
    const visible = nextPals.filter(isSelectablePal);
    const validIds = new Set(visible.map((pal) => pal.id));
    collection.initialize(validIds, nextManifest.dataVersion);
    breeding.sanitize(validIds);
    paths.sanitize(validIds);
    paldex.sanitize(
      new Set(visible.flatMap((pal) => pal.elements)),
      new Set(visible.flatMap((pal) => Object.keys(pal.workSuitability))),
    );
  }
}, { immediate: true });
</script>

<template>
  <NConfigProvider abstract :locale="zhCN" :theme-overrides="themeOverrides" preflight-style-disabled>
  <a class="skip-link" href="#main-view" @click.prevent="focusMain">跳到主要内容</a>
  <div class="app-backdrop" aria-hidden="true"><span /><span /><span /></div>
  <header class="site-header">
    <RouterLink class="brand" to="/breeding" aria-label="帕鲁孵化实验室首页">
      <span class="brand__egg" aria-hidden="true"><i /></span>
      <span><strong>帕鲁孵化实验室</strong><small>PAL HATCH LAB · 1.0</small></span>
    </RouterLink>
    <nav class="main-nav" aria-label="主要导航">
      <RouterLink v-for="item in navigation" :key="item.to" :to="item.to"><span aria-hidden="true">{{ item.icon }}</span>{{ item.label }}</RouterLink>
    </nav>
    <div class="header-actions">
      <span v-if="manifest" class="data-version">数据 {{ manifest.gameVersion }}</span>
      <a
        class="issue-link"
        href="https://github.com/klarkxy/palworld-breeding-pwa/issues/new"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="在 GitHub 提交 Issue（新窗口）"
        title="在 GitHub 提交 Issue"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.87c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.64-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.6 9.6 0 0 1 12 6.82a9.6 9.6 0 0 1 2.5.34c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.86v2.76c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" /></svg>
        <span>提 Issue</span>
      </a>
    </div>
  </header>

  <div id="main-view"><RouterView v-slot="{ Component }"><Transition name="page" mode="out-in"><component :is="Component" /></Transition></RouterView></div>

  <footer class="site-footer">
    <p><strong>帕鲁孵化实验室</strong> · 数据版本 {{ manifest?.dataVersion ?? "加载中" }}</p>
    <p>非官方工具。游戏名称、图标及相关资产权利归 Pocketpair；本站不隶属于或受其背书。</p>
    <p><a :href="licenseUrl">项目许可证（SATA-2.0）</a> · <a :href="noticesUrl">第三方许可与声明</a></p>
  </footer>

  <NAlert v-if="needRefresh" class="update-toast" type="info" title="新配种数据已就绪" :show-icon="false">
    <div class="update-toast__content"><p>刷新后再继续计算，避免使用旧配方。</p><NButton type="primary" round @click="updateServiceWorker(true)">立即刷新</NButton></div>
  </NAlert>
  <NAlert v-else-if="persistenceError" class="update-toast" type="warning" title="本次更改无法保存" :show-icon="false">
    本地数据格式异常，或浏览器拒绝了存储访问；当前页面仍可继续使用，下一次修改时会重新尝试保存。
  </NAlert>
  </NConfigProvider>
</template>
