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
  const calculatorBox = await page.locator(".calculator-fields").boundingBox();
  const targetBox = await targetSelect.boundingBox();
  expect(targetBox!.width).toBeGreaterThan(calculatorBox!.width * .35);

  await page.getByRole("link", { name: "图鉴" }).click();
  const firstPaldexCard = page.locator(".paldex-card").first();
  await expect(firstPaldexCard).toContainText("棉悠悠");
  await expect(firstPaldexCard.locator(".dex-stamp")).toHaveText("No. 001");
  await expect(firstPaldexCard.locator(".paldex-card__work")).toContainText(/手工作业\s*Lv\.1/);
  await expect(firstPaldexCard.locator(".self-breed-badge")).toHaveCount(0);
  await expect(page.locator(".mount-tech-badge")).toHaveCount(115);
  const paldexColumns = await page.locator(".paldex-grid").evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").length);
  expect(paldexColumns).toBe(page.viewportSize()!.width < 672 ? 1 : page.viewportSize()!.width < 1_088 ? 2 : 3);
  const paldexPreview = firstPaldexCard.locator(".paldex-preview");
  await expect(paldexPreview).toContainText(/生命70[\s\S]*手工作业Lv\.1/);
  if (await page.evaluate(() => matchMedia("(hover: hover)").matches)) {
    await firstPaldexCard.hover();
    await expect(paldexPreview).toBeVisible();
  }
  await page.getByLabel("搜索图鉴").fill("cmz");
  await expect(page.locator(".paldex-card .mount-tech-badge")).toHaveText("乘骑 · 科技 Lv.6");
  await expect(page.locator(".paldex-card")).toHaveAccessibleName(/乘骑 · 科技 Lv\.6/);
  await page.getByLabel("搜索图鉴").fill("acj");
  await expect(page.locator(".paldex-card .mount-tech-badge")).toHaveText("乘骑 · 无科技条目");
  await page.getByLabel("搜索图鉴").fill("ppj");
  const selfBreedCard = page.locator(".paldex-card");
  await expect(selfBreedCard).toHaveAccessibleName(/仅可同种自交/);
  await expect(selfBreedCard.locator(".tag-row .self-breed-badge")).toHaveText("仅可自交");
  await selfBreedCard.click();
  const selfBreedDrawer = page.getByRole("dialog", { name: "皮皮鸡详细图鉴" });
  await expect(selfBreedDrawer.locator(".self-breed-badge")).toHaveText("仅可自交");
  await selfBreedDrawer.getByRole("button", { name: "关闭详细图鉴" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("搜索图鉴").fill("");
  await expect(page.getByLabel("搜索图鉴")).toHaveValue("");
  await page.getByLabel("排序").selectOption("rideSprintSpeed");
  await expect(page.locator(".paldex-card").first()).toContainText(/空涡龙[\s\S]*3300/);
  const filterBarFits = await page.locator(".filter-bar--paldex").evaluate((element) =>
    element.scrollWidth <= element.clientWidth + 1);
  expect(filterBarFits).toBe(true);
  await page.getByLabel("工作").selectOption({ label: "采矿" });
  await expect(page.locator(".paldex-card").first()).toContainText(/磐甲龙[\s\S]*No\. 184/);
  await page.getByLabel("工作").selectOption("");
  await page.getByLabel("排序").selectOption("flySpeedOverride");
  await expect(page.locator(".paldex-card").first()).toContainText(/杰诺多兰[\s\S]*1700/);
  await page.getByLabel("排序").selectOption("dex");
  await expect(page.locator(".paldex-card").first()).toContainText(/棉悠悠[\s\S]*No\. 001/);
  await page.getByLabel("搜索图鉴").fill("xsn");
  await expect(page.locator(".paldex-card")).toHaveCount(1);
  await page.locator(".paldex-card").click();
  const drawer = page.getByRole("dialog", { name: "吓丝妮详细图鉴" });
  await expect(drawer).toBeVisible();
  await expect(page.locator(".paldex-grid")).toBeVisible();
  const drawerRatio = await drawer.evaluate((element) => element.getBoundingClientRect().width / innerWidth);
  expect(drawerRatio).toBeGreaterThan(page.viewportSize()!.width < 672 ? .95 : .45);
  expect(drawerRatio).toBeLessThan(page.viewportSize()!.width < 672 ? 1.01 : .55);
  await expect(page.getByRole("heading", { name: "吓丝妮", level: 1 })).toBeVisible();
  const partnerSkill = page.locator(".partner-skill-card");
  await expect(partnerSkill.getByRole("heading", { name: "播撒欢笑的亡者" })).toBeVisible();
  await expect(partnerSkill).toContainText("攻击陷入中毒状态的敌人时");
  const refinementCard = drawer.locator(".refinement-card");
  await expect(refinementCard.getByRole("heading", { name: "0 星 / 4 星对照" })).toBeVisible();
  await expect(refinementCard).toContainText(/Lv\.1[\s\S]*Lv\.5[\s\S]*×1\.00[\s\S]*×1\.20/);
  await expect(refinementCard.locator("tr").filter({ hasText: "攻击中毒目标时施加降攻" }))
    .toContainText(/40[\s\S]*80/);
  const movementCard = drawer.locator(".movement-card");
  await expect(movementCard.getByRole("heading", { name: "移动参数" })).toBeVisible();
  await expect(movementCard).toContainText(/内部移动类型：\s*地面[\s\S]*奔跑参数/);
  const darkBall = page.locator(".skill-list li").filter({ hasText: "暗黑球" });
  await expect(darkBall).toContainText("暗 · 威力 50 · 冷却 2 秒 · Lv.1");
  await expect(darkBall).toContainText("发射以缓慢速度追击敌人的黑暗之球。");
  await drawer.getByRole("button", { name: "关闭详细图鉴" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("搜索图鉴")).toHaveValue("xsn");
  await expect(page.locator(".paldex-card")).toBeFocused();
  if (page.viewportSize()!.width >= 1_088) {
    await page.getByLabel("搜索图鉴").fill("");
    await page.locator(".paldex-card").filter({ hasText: "棉悠悠" }).click();
    await expect(page.getByRole("dialog", { name: "棉悠悠详细图鉴" })).toBeVisible();
    const activeCard = page.locator(".paldex-card").filter({ hasText: "翠叶鼠" });
    await activeCard.click({ position: { x: 20, y: 20 } });
    const activeDrawer = page.getByRole("dialog", { name: "翠叶鼠详细图鉴" });
    await expect(activeDrawer).toBeVisible();
    await activeDrawer.getByRole("button", { name: "关闭详细图鉴" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(activeCard).toBeFocused();
  }
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
  await page.getByRole("button", { name: /从库存规划/ }).click();
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
  test.setTimeout(90_000);
  for (const route of ["/breeding", "/paths", "/collection", "/paldex", "/paldex/OniGhostGirl"]) {
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
  await expect(page.getByRole("heading", { name: "配种计算" })).toBeVisible();
  const offlineSelect = page.locator(".pal-select").first();
  await offlineSelect.locator('input[type="search"]').fill("xsn");
  const offlineOption = offlineSelect.getByRole("listbox").getByRole("option", { name: /吓丝妮/ });
  await expect(offlineOption).toHaveCount(1);
  await expect(offlineOption.locator("img")).toBeVisible();
});
