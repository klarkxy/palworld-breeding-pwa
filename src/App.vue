<script setup lang="ts">
import { watch } from "vue";
import { useRegisterSW } from "virtual:pwa-register/vue";
import { useCollection } from "@/composables/useCollection";
import { isSelectablePal, usePalData } from "@/composables/usePalData";

const { manifest, pals, load } = usePalData();
const { initialize } = useCollection();
const { needRefresh, updateServiceWorker } = useRegisterSW();
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
    <span v-if="manifest" class="data-version">数据 {{ manifest.gameVersion }}</span>
  </header>

  <div id="main-view"><RouterView v-slot="{ Component }"><Transition name="page" mode="out-in"><component :is="Component" /></Transition></RouterView></div>

  <footer class="site-footer">
    <p><strong>帕鲁孵化实验室</strong> · 数据版本 {{ manifest?.dataVersion ?? "加载中" }}</p>
    <p>非官方工具。游戏名称、图标及相关资产权利归 Pocketpair；本站不隶属于或受其背书。</p>
  </footer>

  <aside v-if="needRefresh" class="update-toast" role="status">
    <div><strong>新配种数据已就绪</strong><p>刷新后再继续计算，避免使用旧配方。</p></div>
    <button class="button button--primary" type="button" @click="updateServiceWorker(true)">立即刷新</button>
  </aside>
</template>
