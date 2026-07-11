import { createRouter, createWebHashHistory } from "vue-router";

export const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: "/", redirect: "/breeding" },
    { path: "/breeding", name: "breeding", component: () => import("@/views/BreedingView.vue"), meta: { title: "配种计算" } },
    { path: "/paths", name: "paths", component: () => import("@/views/PathsView.vue"), meta: { title: "繁育路线" } },
    { path: "/collection", name: "collection", component: () => import("@/views/CollectionView.vue"), meta: { title: "我的帕鲁" } },
    { path: "/paldex", name: "paldex", component: () => import("@/views/PaldexView.vue"), meta: { title: "帕鲁图鉴" } },
    { path: "/paldex/:id", name: "paldex-detail", component: () => import("@/views/PaldexDetailView.vue"), meta: { title: "图鉴详情" } },
    { path: "/:pathMatch(.*)*", redirect: "/breeding" },
  ],
});

router.afterEach((to) => {
  document.title = `${String(to.meta.title ?? "帕鲁工具")} · 帕鲁孵化实验室`;
});
