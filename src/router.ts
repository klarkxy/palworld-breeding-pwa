import { createRouter, createWebHashHistory } from "vue-router";

export const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  scrollBehavior: (to, from, savedPosition) => to.path.startsWith("/paldex") && from.path.startsWith("/paldex")
    ? false
    : savedPosition ?? { top: 0 },
  routes: [
    { path: "/", redirect: "/breeding" },
    { path: "/breeding", name: "breeding", component: () => import("@/views/BreedingView.vue"), meta: { title: "配种计算" } },
    { path: "/paths", name: "paths", component: () => import("@/views/PathsView.vue"), meta: { title: "繁育路线" } },
    { path: "/passives", name: "passives", component: () => import("@/views/PassivesView.vue"), meta: { title: "词条图鉴" } },
    { path: "/items", name: "items", component: () => import("@/views/ItemsView.vue"), meta: { title: "道具工坊" } },
    {
      path: "/collection",
      redirect: (to) => ({
        path: "/paldex",
        query: { ...to.query, view: to.query.view === "owned" ? "owned" : "all" },
      }),
    },
    {
      path: "/paldex",
      name: "paldex",
      component: () => import("@/views/PaldexView.vue"),
      meta: { title: "帕鲁图鉴" },
      children: [
        { path: ":id", name: "paldex-detail", component: () => import("@/views/PaldexDetailView.vue"), meta: { title: "图鉴详情" } },
      ],
    },
    { path: "/:pathMatch(.*)*", redirect: "/breeding" },
  ],
});

router.afterEach((to) => {
  document.title = `${String(to.meta.title ?? "帕鲁工具")} · 帕鲁孵化实验室`;
});
