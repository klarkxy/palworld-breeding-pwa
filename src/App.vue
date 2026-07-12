<script setup lang="ts">
import { watch } from "vue";
import { useRegisterSW } from "virtual:pwa-register/vue";
import { useCollection } from "@/composables/useCollection";
import { isSelectablePal, usePalData } from "@/composables/usePalData";

const { manifest, pals, load } = usePalData();
const { initialize } = useCollection();
const { needRefresh, updateServiceWorker } = useRegisterSW();
const licenseUrl = `${import.meta.env.BASE_URL}LICENSE.txt`;
const noticesUrl = `${import.meta.env.BASE_URL}THIRD_PARTY_NOTICES.txt`;
const navigation = [
  { to: "/breeding", label: "配种", icon: "⊕" },
  { to: "/paths", label: "路线", icon: "⌁" },
  { to: "/collection", label: "我的", icon: "◇" },
  { to: "/paldex", label: "图鉴", icon: "▦" },
];

function focusMain() {
  const main = document.querySelector<HTMLElement>("#main-view main");
  if (!main) return;
  main.tabIndex = -1;
  main.focus();
}

load();
watch([manifest, pals], ([nextManifest, nextPals]) => {
  if (nextManifest && nextPals.length) {
    initialize(new Set(nextPals.filter(isSelectablePal).map((pal) => pal.id)), nextManifest.dataVersion);
  }
}, { immediate: true });
</script>

<template>
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

  <aside v-if="needRefresh" class="update-toast" role="status">
    <div><strong>新配种数据已就绪</strong><p>刷新后再继续计算，避免使用旧配方。</p></div>
    <button class="button button--primary" type="button" @click="updateServiceWorker(true)">立即刷新</button>
  </aside>
</template>
