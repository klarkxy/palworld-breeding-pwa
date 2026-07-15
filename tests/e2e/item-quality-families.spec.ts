import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

test.describe.configure({ timeout: 90_000 });

async function openApp(page: Page, route: string) {
  await page.goto(`./#${route}`);
  await expect(page.locator(".data-version")).toContainText("1.0");
}

async function currentItemRoute(page: Page) {
  return page.evaluate(() => {
    const [path, query = ""] = window.location.hash.slice(1).split("?");
    const params = new URLSearchParams(query);
    return {
      path,
      state: params.get("state"),
      query: params.get("q"),
    };
  });
}

function detailStat(drawer: Locator, label: string) {
  return drawer.locator(".item-detail__stats > div", { hasText: label });
}

test("金属球棒设计图按品质聚合，并以 replace 切换真实详情与掉落", async ({ page }) => {
  await openApp(page, "/items");
  await page.getByRole("searchbox", { name: "搜索道具" }).fill("金属球棒设计图");

  const familyCard = page.locator("[data-item-family-id='blueprint:family:Bat3']");
  await expect(familyCard).toHaveCount(1);
  await expect(page.locator(".item-grid > li")).toHaveCount(1);
  await expect(familyCard).toHaveAttribute("data-selected-item-id", "Blueprint_Bat3_2");

  const listQualityGroup = familyCard.getByRole("group", { name: "金属球棒设计图1品质" });
  const listQualityButtons = listQualityGroup.getByRole("button");
  await expect(listQualityButtons).toHaveCount(4);
  await expect(listQualityButtons).toHaveText(["精良", "稀有", "史诗", "传说"]);
  await expect(listQualityButtons.nth(0)).toHaveAttribute("aria-pressed", "true");

  const previewIcon = familyCard.locator(".item-icon[data-preview-item-id='Bat3_2']");
  await expect(previewIcon).toHaveCount(1);
  await expect(previewIcon.locator("img")).toHaveAttribute("src", /\/item-icons\/Bat3\.webp$/);
  await expect(previewIcon.locator("img")).not.toHaveAttribute("src", /Blueprint\.webp$/);

  await familyCard.getByRole("button", {
    name: "查看金属球棒设计图1（精良）详情",
    exact: true,
  }).click();
  await expect.poll(() => currentItemRoute(page)).toEqual({
    path: "/items/Blueprint_Bat3_2",
    state: "1",
    query: "金属球棒设计图",
  });

  const drawer = page.locator(".item-drawer");
  await expect(drawer).toBeVisible();
  await expect(detailStat(drawer, "内部 ID")).toContainText("Blueprint_Bat3_2");
  await expect(detailStat(drawer, "稀有度")).toContainText("精良 · 1");
  await expect(drawer.locator(".item-detail__description")).toContainText(/金属球棒[\s\S]*精良/);
  await expect(drawer.locator(".item-drop-sources__count")).toHaveText("5 条记录");

  const detailQualityRegion = drawer.getByRole("region", { name: "切换品质" });
  await expect(detailQualityRegion).toBeVisible();
  await detailQualityRegion.getByRole("button", {
    name: "查看金属球棒设计图4（传说）品质详情",
    exact: true,
  }).click();

  await expect.poll(() => currentItemRoute(page)).toEqual({
    path: "/items/Blueprint_Bat3_5",
    state: "1",
    query: "金属球棒设计图",
  });
  await expect(detailStat(drawer, "内部 ID")).toContainText("Blueprint_Bat3_5");
  await expect(detailStat(drawer, "稀有度")).toContainText("传说 · 4");
  await expect(drawer.locator(".item-detail__description")).toContainText(/金属球棒[\s\S]*传说/);
  await expect(drawer.locator(".item-drop-sources__count")).toHaveText("7 条记录");
  await expect(detailQualityRegion.getByRole("button", {
    name: "查看金属球棒设计图4（传说）品质详情",
    exact: true,
  })).toHaveAttribute("aria-pressed", "true");

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  expect(await detailQualityRegion.evaluate((element) =>
    element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  const a11y = await new AxeBuilder({ page }).include(".item-detail__quality").analyze();
  expect(a11y.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);

  await page.goBack();
  await expect.poll(() => currentItemRoute(page)).toEqual({
    path: "/items",
    state: "1",
    query: "金属球棒设计图",
  });
  await expect(drawer).toBeHidden();
  await expect(page.getByRole("searchbox", { name: "搜索道具" })).toHaveValue("金属球棒设计图");
});
