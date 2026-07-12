import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function openApp(page: Page, route: string) {
  await page.goto(`./#${route}`);
  await expect(page.locator(".data-version")).toContainText("1.0");
}

async function choose(page: Page, label: string, palId: string) {
  const input = page.locator(".pal-select").filter({ hasText: label }).locator('input[type="search"]');
  await input.fill(palId);
  await input.press("Tab");
}

test("@subpath 三类配种查询和图鉴入口可用", async ({ page }) => {
  await openApp(page, "/breeding");
  const parentASelect = page.locator(".pal-select").filter({ hasText: "亲本 A" });
  const parentAInput = parentASelect.locator('input[type="search"]');
  await parentAInput.fill("xsn");
  const xsnOption = parentASelect.getByRole("listbox").getByRole("option", { name: /吓丝妮/ });
  await expect(xsnOption).toHaveCount(1);
  await expect(xsnOption.locator("img")).toHaveAttribute("src", /icons\/OniGhostGirl\.png$/);
  await xsnOption.click();
  await expect(parentASelect.locator(".pal-select__selected-icon img")).toBeVisible();
  await parentAInput.click();
  await expect(parentASelect.getByRole("listbox")).toBeVisible();
  await parentAInput.press("Escape");

  const parentBInput = page.locator(".pal-select").filter({ hasText: "亲本 B" }).locator('input[type="search"]');
  await parentBInput.fill("hxx");
  await parentBInput.press("ArrowDown");
  await parentBInput.press("Enter");
  await expect(parentBInput).toHaveValue(/壶小象/);
  await expect(page.locator(".recipe-row").first()).toContainText("球犰");

  await page.getByRole("button", { name: /A ＋ \? ＝ B/ }).click();
  await choose(page, "亲本 A", "OniGhostGirl");
  const targetSelect = page.locator(".pal-select").filter({ hasText: "目标子代 B" });
  await targetSelect.locator('input[type="search"]').fill("qq");
  await expect(targetSelect.getByRole("listbox").getByRole("option")).toHaveCount(2);
  await targetSelect.locator('input[type="search"]').press("Tab");
  await expect(targetSelect.getByRole("button", { name: "清除选择" })).toHaveCount(0);
  await choose(page, "目标子代 B", "SmallArmadillo");
  await expect(page.locator(".recipe-row").first()).toContainText("壶小象");

  await page.getByRole("button", { name: /\? ＋ \? ＝ B/ }).click();
  await expect(page.locator(".recipe-row").first()).toBeVisible();

  await page.getByRole("link", { name: "图鉴" }).click();
  await page.getByLabel("搜索图鉴").fill("xsn");
  await expect(page.locator(".paldex-card")).toHaveCount(1);
  await page.locator(".paldex-card").click();
  await expect(page.getByRole("heading", { name: "吓丝妮", level: 1 })).toBeVisible();
});

test("我的帕鲁刷新后保留，并可完成库存路线", async ({ page }) => {
  await openApp(page, "/collection");
  await page.getByLabel("搜索帕鲁").fill("xsn");
  await expect(page.locator(".collection-card")).toHaveCount(1);
  await page.getByLabel("搜索帕鲁").fill("");
  const oni = page.locator(".collection-card").filter({ hasText: "吓丝妮" });
  const ganesha = page.locator(".collection-card").filter({ hasText: "壶小象" });
  await oni.getByLabel("♂ 雄").focus();
  await oni.getByLabel("♂ 雄").press("Space");
  await ganesha.getByLabel("♀ 雌").focus();
  await ganesha.getByLabel("♀ 雌").press("Space");
  await page.reload();
  await expect(page.locator(".data-version")).toContainText("1.0");
  await expect(page.locator(".collection-card").filter({ hasText: "吓丝妮" }).getByLabel("♂ 雄")).toBeChecked();
  await expect(page.locator(".collection-card").filter({ hasText: "壶小象" }).getByLabel("♀ 雌")).toBeChecked();

  await page.getByRole("link", { name: "路线", exact: true }).click();
  await page.getByRole("button", { name: /从我的帕鲁规划/ }).click();
  await choose(page, "目标帕鲁", "SmallArmadillo");
  const elapsed = await page.getByRole("button", { name: "检索最短路线" }).evaluate((element) => {
    const started = performance.now();
    (element as HTMLButtonElement).click();
    return performance.now() - started;
  });
  await expect(page.locator(".plan-card").first()).toContainText("1 代 · 1 次配种");
  expect(elapsed).toBeLessThan(1_000);
});

test("核心页面无严重无障碍问题", async ({ page }) => {
  test.setTimeout(60_000);
  for (const route of ["/breeding", "/paths", "/collection", "/paldex"]) {
    await openApp(page, route);
    if (route === "/breeding") await page.locator(".pal-select input").first().focus();
    await page.waitForTimeout(200);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")))
      .toEqual([]);
  }
});

test("@subpath 安装后断网仍能打开计算器和本地数据", async ({ page, context }) => {
  await openApp(page, "/breeding");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "把配种问题，放上实验台" })).toBeVisible();
  const offlineSelect = page.locator(".pal-select").first();
  await offlineSelect.locator('input[type="search"]').fill("xsn");
  const offlineOption = offlineSelect.getByRole("listbox").getByRole("option", { name: /吓丝妮/ });
  await expect(offlineOption).toHaveCount(1);
  await expect(offlineOption.locator("img")).toBeVisible();
});
