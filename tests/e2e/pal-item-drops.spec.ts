import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

test.describe.configure({ timeout: 90_000 });

async function openApp(page: Page, route: string) {
  await page.goto("./#" + route);
  await expect(page.locator(".data-version")).toContainText("1.0");
}

function palDrawer(page: Page, palName: string) {
  return page.getByRole("dialog").filter({
    has: page.locator(".paldex-drawer__topbar").getByText(palName, { exact: true }),
  });
}

test("帕鲁详情按形态展示掉落道具，并可往返道具详情", async ({ page }) => {
  await openApp(page, "/paldex/SheepBall?state=1&q=SheepBall");

  const drawer = palDrawer(page, "棉悠悠");
  await expect(drawer).toBeVisible();
  const drops = drawer.getByRole("region", { name: "掉落道具" });
  await expect(drops).toBeVisible();
  await expect(drops.locator(".pal-item-drops__count")).toHaveText("4 条记录");
  await expect(drops.getByRole("heading", { name: "普通 · 默认等级段", exact: true })).toBeVisible();
  await expect(drops.getByRole("heading", { name: "Alpha · 默认等级段", exact: true })).toBeVisible();

  const rows = drops.locator(".pal-item-drop");
  await expect(rows).toHaveCount(4);
  const wool = rows.filter({ hasText: "羊毛" });
  await expect(wool).toContainText(/100%[\s\S]*× 1–3/);
  await expect(wool).toContainText("× 1–3");
  await expect(wool.locator(".pal-item-drop__rarity")).toHaveText("普通");

  const mutton = rows.filter({ hasText: "棉悠悠的羊肉" });
  await expect(mutton).toContainText("仅击败掉落；捕获时不结算。");
  await expect(rows.filter({ hasText: "古代文明部件" }).locator(".pal-item-drop__rarity")).toHaveText("稀有");

  const woolLink = wool.getByRole("link", { name: "查看羊毛的道具详情" });
  await expect(woolLink).toHaveAttribute("href", "#/items/Wool?state=1");
  await woolLink.click();

  await expect.poll(() => page.evaluate(() => window.location.hash))
    .toBe("#/items/Wool?state=1");
  const itemDrawer = page.locator(".item-drawer");
  await expect(itemDrawer).toBeVisible();
  await expect(itemDrawer).toContainText("羊毛");

  await page.goBack();
  await expect.poll(() => page.evaluate(() => window.location.hash))
    .toBe("#/paldex/SheepBall?state=1&q=SheepBall");
  await expect(palDrawer(page, "棉悠悠")).toBeVisible();
  await expect(page.getByLabel("搜索图鉴")).toHaveValue("SheepBall");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(drops).toBeVisible();
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  expect(await drops.evaluate((element) =>
    element.scrollWidth <= element.clientWidth + 1)).toBe(true);

  const a11y = await new AxeBuilder({ page }).include(".pal-item-drops").analyze();
  expect(a11y.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
});

test("掉落记录较多时默认预览 12 条并可展开收起", async ({ page }) => {
  await openApp(page, "/paldex/MimicDog");

  const drops = page.getByRole("dialog").getByRole("region", { name: "掉落道具" });
  await expect(drops).toBeVisible();
  await expect(drops.locator(".pal-item-drops__count")).toHaveText("51 条记录");
  await expect(drops.locator(".pal-item-drop")).toHaveCount(12);

  const toggle = drops.locator(".pal-item-drops__toggle");
  await expect(toggle).toHaveText("展开其余 39 条掉落");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(drops.locator(".pal-item-drop")).toHaveCount(51);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  await toggle.click();
  await expect(drops.locator(".pal-item-drop")).toHaveCount(12);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("预览截断同一分组时明确显示当前数量与总数", async ({ page }) => {
  await openApp(page, "/paldex/BlackMetalDragon");

  const drops = page.getByRole("dialog").getByRole("region", { name: "掉落道具" });
  await expect(drops).toBeVisible();
  const alphaGroup = drops.getByRole("region", { name: "Alpha · 默认等级段" });
  const groupCount = alphaGroup.locator(".pal-item-drops__group-heading b");
  await expect(groupCount).toHaveText("已显示 2 / 共 3");

  await drops.locator(".pal-item-drops__toggle").click();
  await expect(groupCount).toHaveText("3");
});
