import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function openApp(page: Page, route: string) {
  await page.goto(`./#${route}`);
  await expect(page.locator(".data-version")).toContainText("1.0");
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function choose(page: Page, label: string, palId: string) {
  const input = page.getByRole("combobox", { name: label, exact: true });
  const field = page.locator(".pal-select").filter({ has: input });
  await input.click();
  await input.fill(palId);
  const option = page.locator(".n-base-select-menu:visible .n-base-select-option").filter({ hasText: new RegExp(`${escapeRegExp(palId)}\\s*$`) });
  await expect(option).toHaveCount(1);
  await option.click();
  await expect(field).toContainText(palId);
}

async function selectOption(page: Page, label: string, optionLabel: string) {
  await expect(page.locator(".n-base-select-menu:visible")).toHaveCount(0);
  const field = page.locator("label.field").filter({ has: page.locator(".field__label").getByText(label, { exact: true }) });
  await field.locator(".n-base-selection").click();
  const menu = page.locator(".n-base-select-menu:visible").last();
  const list = menu.locator(".n-virtual-list");
  const option = menu.locator(".n-base-select-option").filter({ hasText: new RegExp(`^\\s*${escapeRegExp(optionLabel)}\\s*$`) });
  await expect(menu).toBeVisible();
  await list.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  for (let pageIndex = 0; pageIndex < 20; pageIndex += 1) {
    if (await option.count()) {
      await option.first().click();
      await expect(page.locator(".n-base-select-menu:visible")).toHaveCount(0);
      return;
    }
    await list.evaluate((element) => {
      element.scrollTop += element.clientHeight;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await page.waitForTimeout(50);
  }
  throw new Error(`${label} 中没有选项：${optionLabel}`);
}

async function selectTab(page: Page, label: string | RegExp) {
  await page.locator(".segmented-control .n-tabs-tab").filter({ hasText: label }).click();
}

function palDrawer(page: Page, palName: string) {
  return page.getByRole("dialog").filter({ has: page.locator(".paldex-drawer__topbar").getByText(palName, { exact: true }) });
}

test("PalSelect 支持中文、英文、编号、内部 ID、输入法和清除", async ({ page }) => {
  await openApp(page, "/breeding");
  const input = page.getByRole("combobox", { name: "亲本 A", exact: true });
  const option = page.locator(".n-base-select-menu:visible .n-base-select-option").filter({ hasText: /吓丝妮.*Bakemi.*OniGhostGirl/ });
  for (const query of ["吓丝妮", "Bakemi", "168", "OniGhostGirl"]) {
    await input.fill(query);
    await expect(option).toHaveCount(1);
    await expect(option.locator("img")).toBeVisible();
  }

  await input.fill("");
  const visibleOptions = page.locator(".n-base-select-menu:visible .n-base-select-option");
  expect(await visibleOptions.count()).toBeGreaterThan(1);
  await expect(page.locator(".pal-select__menu:visible")).toHaveAttribute("tabindex", "0");
  await expect(page.locator(".pal-select__menu:visible .n-base-select-option[tabindex]")).toHaveCount(0);
  await input.dispatchEvent("compositionstart");
  await input.fill("吓丝妮");
  await input.dispatchEvent("compositionend");
  await expect(option).toHaveCount(1);
  await input.press("ArrowDown");
  await input.press("Enter");
  const field = page.locator(".pal-select").filter({ has: input });
  await expect(field).toContainText("OniGhostGirl");
  await field.locator(".n-base-clear").click();
  await expect(field.locator(".pal-select__selected-icon")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("pal-lab.breeding.v1") ?? "null")?.parentA ?? "")).toBe("");
});

test("@subpath 三类配种查询和图鉴入口可用", async ({ page }) => {
  test.setTimeout(90_000);
  await openApp(page, "/breeding");
  await expect(page.locator(".pal-select__filters")).toHaveCount(0);
  await expect(page.getByText(/亲本 [AB] 性别|已有性别/)).toHaveCount(0);
  const parentASelect = page.locator(".pal-select").filter({ hasText: "亲本 A" });
  const parentAInput = page.getByRole("combobox", { name: "亲本 A", exact: true });
  await parentAInput.fill("xsn");
  const xsnOption = page.locator(".n-base-select-menu:visible .n-base-select-option").filter({ hasText: /吓丝妮.*OniGhostGirl/ });
  await expect(xsnOption).toHaveCount(1);
  await expect(xsnOption.locator("img")).toHaveAttribute("src", /icons\/OniGhostGirl\.png$/);
  await xsnOption.click();
  await expect(parentASelect.locator(".pal-select__selected-icon img")).toBeVisible();
  await parentAInput.click();
  await expect(page.locator(".n-base-select-menu:visible")).toBeVisible();
  await parentAInput.press("Escape");

  const parentBSelect = page.locator(".pal-select").filter({ hasText: "亲本 B" });
  const parentBInput = page.getByRole("combobox", { name: "亲本 B", exact: true });
  await parentBInput.fill("hxx");
  await parentBInput.press("ArrowDown");
  await parentBInput.press("Enter");
  await expect(parentBSelect).toContainText("壶小象");
  const firstRecipe = page.locator(".recipe-row").first();
  await expect(page.locator(".recipe-row")).toHaveCount(1);
  await expect(firstRecipe).toContainText("球犰");
  await expect(firstRecipe).not.toContainText(/[♂♀]|雄性|雌性/);

  await selectTab(page, /A ＋ \? ＝ B/);
  await choose(page, "亲本 A", "OniGhostGirl");
  const targetSelect = page.locator(".pal-select").filter({ hasText: "目标子代 B" });
  const targetInput = page.getByRole("combobox", { name: "目标子代 B", exact: true });
  await targetInput.fill("qq");
  await expect(page.locator(".n-base-select-menu:visible .n-base-select-option")).toHaveCount(2);
  await targetInput.press("Tab");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("pal-lab.breeding.v1") ?? "null")?.target ?? "")).toBe("");
  await choose(page, "目标子代 B", "SmallArmadillo");
  await expect(page.locator(".recipe-row").first()).toContainText("壶小象");

  await selectTab(page, /\? ＋ \? ＝ B/);
  await expect(page.locator(".recipe-row").first()).toBeVisible();
  const calculatorBox = await page.locator(".calculator-fields").boundingBox();
  const targetBox = await targetSelect.boundingBox();
  expect(targetBox!.width).toBeGreaterThan(calculatorBox!.width * .35);

  await page.getByRole("link", { name: "图鉴", exact: true }).click();
  await expect(page.getByRole("heading", { name: "帕鲁图鉴", level: 1 })).toBeVisible();
  await expect.poll(() => page.locator("html").evaluate((element) => getComputedStyle(element).fontSize)).toBe("18px");
  const firstPaldexCard = page.locator(".paldex-card").first();
  await expect(firstPaldexCard).toContainText("棉悠悠");
  await expect(firstPaldexCard.locator(".dex-stamp")).toHaveText("No. 001");
  await expect(firstPaldexCard.locator(".paldex-card__work")).toContainText(/手工作业\s*Lv\.1/);
  await expect(firstPaldexCard.locator(".self-breed-badge")).toHaveCount(0);
  await expect(page.locator(".mount-tech-badge")).toHaveCount(115);
  await expect(page.locator(".mount-type-badge")).toHaveCount(115);
  const paldexColumns = await page.locator(".paldex-grid").evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").length);
  expect(paldexColumns).toBe(page.viewportSize()!.width < 672 ? 1 : page.viewportSize()!.width < 1_088 ? 2 : 3);
  const paldexPreview = firstPaldexCard.locator(".paldex-preview");
  await expect(paldexPreview).toContainText(/生命70[\s\S]*手工作业Lv\.1/);
  if (await page.evaluate(() => matchMedia("(hover: hover)").matches)) {
    await firstPaldexCard.hover();
    await expect(paldexPreview).toBeVisible();
  }
  await page.getByLabel("搜索图鉴").fill("cmz");
  await expect(page.locator(".paldex-card .mount-type-badge")).toHaveText("地面");
  await expect(page.locator(".paldex-card .mount-tech-badge")).toHaveText("LV6");
  await expect(page.locator(".paldex-card")).toHaveAccessibleName(/地面，LV6/);
  await page.getByLabel("搜索图鉴").fill("IceHorse");
  const frostallionCard = page.locator(".paldex-card").filter({ has: page.getByRole("heading", { name: "唤冬兽", exact: true }) });
  await expect(frostallionCard.locator(".mount-type-badge")).toHaveText("飞行兼落地");
  await expect(frostallionCard.locator(".mount-tech-badge")).toHaveText("LV62");
  await page.getByLabel("搜索图鉴").fill("acj");
  await expect(page.locator(".paldex-card .mount-tech-badge")).toHaveText("无科技条目");
  await page.getByLabel("搜索图鉴").fill("ppj");
  const selfBreedCard = page.locator(".paldex-card");
  await expect(selfBreedCard).toHaveAccessibleName(/仅可同种自交/);
  await expect(selfBreedCard.locator(".tag-row .self-breed-badge")).toHaveText("仅可自交");
  await selfBreedCard.click();
  const selfBreedDrawer = palDrawer(page, "皮皮鸡");
  await expect(selfBreedDrawer.locator(".self-breed-badge")).toHaveText("仅可自交");
  await selfBreedDrawer.getByRole("button", { name: "关闭详细图鉴" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("搜索图鉴").fill("");
  await expect(page.getByLabel("搜索图鉴")).toHaveValue("");
  await selectOption(page, "排序", "乘骑冲刺参数（高→低）");
  await expect(page.locator(".paldex-card").first()).toContainText(/空涡龙[\s\S]*3300/);
  const filterBarFits = await page.locator(".filter-bar--paldex").evaluate((element) =>
    element.scrollWidth <= element.clientWidth + 1);
  expect(filterBarFits).toBe(true);
  await selectOption(page, "工作", "采矿");
  await expect(page.locator(".paldex-card").first()).toContainText(/磐甲龙[\s\S]*No\. 184/);
  await selectOption(page, "工作", "全部工作");
  await selectOption(page, "排序", "飞行覆盖值（高→低）");
  await expect(page.locator(".paldex-card").first()).toContainText(/杰诺多兰[\s\S]*1700/);
  await selectOption(page, "排序", "图鉴编号（低→高）");
  await expect(page.locator(".paldex-card").first()).toContainText(/棉悠悠[\s\S]*No\. 001/);
  await page.getByLabel("搜索图鉴").fill("xsn");
  await expect(page.locator(".paldex-card")).toHaveCount(1);
  await page.locator(".paldex-card").click();
  const drawer = palDrawer(page, "吓丝妮");
  await expect(drawer).toBeVisible();
  await expect(page.locator(".paldex-grid")).toBeVisible();
  const drawerRatio = await drawer.evaluate((element) => element.getBoundingClientRect().width / innerWidth);
  expect(drawerRatio).toBeGreaterThan(page.viewportSize()!.width < 672 ? .95 : .45);
  expect(drawerRatio).toBeLessThan(page.viewportSize()!.width < 672 ? 1.01 : .55);
  await expect(page.getByRole("heading", { name: "吓丝妮", level: 1 })).toBeVisible();
  const refinementSelector = drawer.locator(".refinement-selector");
  const zeroStarButton = refinementSelector.getByRole("radio", { name: "0 星", exact: true });
  const fourStarButton = refinementSelector.getByRole("radio", { name: "4 星", exact: true });
  await expect(zeroStarButton).toBeChecked();
  await expect(fourStarButton).not.toBeChecked();
  const [selectorBox, heroBox] = await Promise.all([refinementSelector.boundingBox(), drawer.locator(".detail-hero").boundingBox()]);
  expect(selectorBox!.y + selectorBox!.height).toBeLessThanOrEqual(heroBox!.y);
  await expect(drawer.locator(".refinement-card")).toHaveCount(0);
  await expect(drawer.getByRole("heading", { name: "0 星 / 4 星对照" })).toHaveCount(0);
  const statsCard = drawer.locator(".stats-card");
  const workCard = drawer.locator(".work-card");
  await expect(statsCard.locator(".stat-grid > div").filter({ hasText: "生命" })).toHaveText("生命70");
  await expect(statsCard.locator(".stat-grid > div").filter({ hasText: "攻击" })).toHaveText("攻击85");
  await expect(statsCard.locator(".stat-grid > div").filter({ hasText: "防御" })).toHaveText("防御80");
  await expect(statsCard.locator(".stat-grid > div").filter({ hasText: "体力" })).toHaveText("体力100");
  await expect(workCard).toContainText(/手工作业\s*Lv\.3[\s\S]*制药\s*Lv\.4[\s\S]*搬运\s*Lv\.2/);
  const partnerSkill = page.locator(".partner-skill-card");
  await expect(partnerSkill.getByRole("heading", { name: "播撒欢笑的亡者" })).toBeVisible();
  await expect(partnerSkill).toContainText("攻击陷入中毒状态的敌人时");
  await expect(partnerSkill.locator(".partner-skill-rank")).toHaveText("伙伴技能 Lv.1");
  await expect(partnerSkill.locator(".partner-metric-list li")).toHaveText(/攻击中毒目标时施加降攻\s*40\s*玩家/);

  await refinementSelector.getByText("4 星", { exact: true }).click();
  await expect(zeroStarButton).not.toBeChecked();
  await expect(fourStarButton).toBeChecked();
  await expect(statsCard.locator(".stat-grid > div").filter({ hasText: "生命" })).toHaveText("生命84");
  await expect(statsCard.locator(".stat-grid > div").filter({ hasText: "攻击" })).toHaveText("攻击102");
  await expect(statsCard.locator(".stat-grid > div").filter({ hasText: "防御" })).toHaveText("防御96");
  await expect(statsCard.locator(".stat-grid > div").filter({ hasText: "体力" })).toHaveText("体力100");
  await expect(workCard).toContainText(/手工作业\s*Lv\.5[\s\S]*制药\s*Lv\.6[\s\S]*搬运\s*Lv\.4/);
  await expect(partnerSkill.locator(".partner-skill-rank")).toHaveText("伙伴技能 Lv.5");
  await expect(partnerSkill.locator(".partner-metric-list li")).toHaveText(/攻击中毒目标时施加降攻\s*80\s*玩家/);
  await expect(partnerSkill.getByText("查看 0 星基础说明", { exact: true })).toBeVisible();
  await expect(partnerSkill.getByText(/攻击力降低40%/)).toBeHidden();
  const movementCard = drawer.locator(".movement-card");
  await expect(movementCard.getByRole("heading", { name: "移动参数" })).toBeVisible();
  await expect(movementCard).toContainText(/内部移动类型：\s*地面[\s\S]*奔跑参数/);
  const darkBall = page.locator(".skill-list li").filter({ hasText: "暗黑球" });
  await expect(darkBall).toContainText("暗 · 威力 50 · 冷却 2 秒 · Lv.1");
  await expect(darkBall).toContainText("发射以缓慢速度追击敌人的黑暗之球。");
  await zeroStarButton.press("Space");
  await expect(zeroStarButton).toBeChecked();
  await expect(statsCard.locator(".stat-grid > div").filter({ hasText: "生命" })).toHaveText("生命70");
  await drawer.getByRole("button", { name: "关闭详细图鉴" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("搜索图鉴")).toHaveValue("xsn");
  await expect(page.locator(".paldex-card")).toBeFocused();
  if (page.viewportSize()!.width >= 1_088) {
    await page.getByLabel("搜索图鉴").fill("");
    await page.locator(".paldex-card").filter({ hasText: "棉悠悠" }).click();
    await expect(palDrawer(page, "棉悠悠")).toBeVisible();
    const activeCard = page.locator(".paldex-card").filter({ hasText: "翠叶鼠" });
    await activeCard.click({ position: { x: 20, y: 20 } });
    const activeDrawer = palDrawer(page, "翠叶鼠");
    await expect(activeDrawer).toBeVisible();
    await page.waitForTimeout(350);
    await activeDrawer.getByRole("button", { name: "关闭详细图鉴" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(activeCard).toBeFocused();
  }
});

test("我的帕鲁刷新后保留，并可完成库存路线", async ({ page }) => {
  await openApp(page, "/collection");
  await page.evaluate(() => localStorage.setItem("pal-lab.collection.v1", JSON.stringify({
    schema: 1,
    dataVersion: "legacy",
    entries: [
      { palId: "OniGhostGirl", male: true, female: false },
      { palId: "Ganesha", male: false, female: true },
    ],
  })));
  await page.reload();
  await expect(page.locator(".data-version")).toContainText("1.0");
  await page.getByLabel("搜索帕鲁").fill("xsn");
  await expect(page.locator(".collection-card")).toHaveCount(1);
  const oni = page.locator(".collection-card").filter({ hasText: "吓丝妮" });
  await expect(oni.getByRole("checkbox")).toHaveCount(1);
  await expect(oni.getByLabel("吓丝妮已拥有")).toBeChecked();
  await page.getByLabel("搜索帕鲁").fill("");
  const ganesha = page.locator(".collection-card").filter({ hasText: "壶小象" });
  await expect(ganesha.getByRole("checkbox")).toHaveCount(1);
  await expect(ganesha.getByLabel("壶小象已拥有")).toBeChecked();
  await expect(page.getByText(/雄性记录|雌性记录|已有性别/)).toHaveCount(0);

  const migrated = await page.evaluate(() => JSON.parse(localStorage.getItem("pal-lab.collection.v1") ?? "null") as {
    schema: number;
    entries: Record<string, unknown>[];
  });
  expect(migrated.schema).toBe(2);
  expect(migrated.entries).toEqual([{ palId: "OniGhostGirl" }, { palId: "Ganesha" }]);
  expect(migrated.entries.every((entry) => Object.keys(entry).length === 1)).toBe(true);

  await page.reload();
  await expect(page.locator(".data-version")).toContainText("1.0");
  await expect(page.locator(".collection-card").filter({ hasText: "吓丝妮" }).getByLabel("吓丝妮已拥有")).toBeChecked();
  await expect(page.locator(".collection-card").filter({ hasText: "壶小象" }).getByLabel("壶小象已拥有")).toBeChecked();

  await page.getByRole("link", { name: "路线", exact: true }).click();
  await expect(page.getByText("已有性别")).toHaveCount(0);
  await expect(page.locator(".pal-select__filters")).toHaveCount(0);
  await selectTab(page, "从库存规划");
  await choose(page, "目标帕鲁", "SmallArmadillo");
  const elapsed = await page.getByRole("button", { name: "检索最短路线" }).evaluate((element) => {
    const started = performance.now();
    (element as HTMLButtonElement).click();
    return performance.now() - started;
  });
  const firstPlan = page.locator(".plan-card").first();
  await expect(firstPlan).toContainText("1 代 · 1 次配种");
  await expect(firstPlan).not.toContainText(/[♂♀]|雄性|雌性/);
  expect(elapsed).toBeLessThan(1_000);
});

test("表单跨路由、刷新和新页面恢复，路线结果按条件重新计算", async ({ page, context }) => {
  test.setTimeout(90_000);
  await openApp(page, "/breeding");
  await choose(page, "亲本 A", "OniGhostGirl");
  await choose(page, "亲本 B", "Ganesha");
  await expect(page.locator(".recipe-row").first()).toContainText("球犰");

  await page.getByRole("link", { name: "路线", exact: true }).click();
  await choose(page, "起点帕鲁", "OniGhostGirl");
  await choose(page, "目标帕鲁", "SmallArmadillo");
  await selectOption(page, "最多代数", "6 代");
  await page.getByRole("button", { name: "检索最短路线" }).click();
  await expect(page.locator(".plan-card").first()).toBeVisible();
  const persistedPaths = await page.evaluate(() => JSON.parse(localStorage.getItem("pal-lab.paths.v1") ?? "null") as Record<string, unknown>);
  expect(persistedPaths).not.toHaveProperty("plans");
  expect(persistedPaths.lastRun).toMatchObject({ mode: "single", start: "OniGhostGirl", target: "SmallArmadillo", maxDepth: 6 });

  await page.getByRole("link", { name: "图鉴", exact: true }).click();
  await page.getByLabel("搜索图鉴").fill("xsn");
  await selectOption(page, "排序", "攻击（高→低）");
  await page.locator(".paldex-card").click();
  const drawer = palDrawer(page, "吓丝妮");
  await drawer.getByText("4 星", { exact: true }).click();
  await drawer.getByRole("button", { name: "关闭详细图鉴" }).click();
  await expect(drawer).toHaveCount(0);

  await page.getByRole("link", { name: "配种", exact: true }).click();
  await expect(page.locator(".pal-select").filter({ hasText: "亲本 A" })).toContainText("OniGhostGirl");
  await expect(page.locator(".pal-select").filter({ hasText: "亲本 B" })).toContainText("Ganesha");
  await expect(page.locator(".recipe-row").first()).toContainText("球犰");
  await page.reload();
  await expect(page.locator(".data-version")).toContainText("1.0");
  await expect(page.locator(".pal-select").filter({ hasText: "亲本 A" })).toContainText("OniGhostGirl");
  await expect(page.locator(".pal-select").filter({ hasText: "亲本 B" })).toContainText("Ganesha");

  const restored = await context.newPage();
  await openApp(restored, "/paths");
  await expect(restored.locator(".pal-select").filter({ hasText: "起点帕鲁" })).toContainText("OniGhostGirl");
  await expect(restored.locator(".pal-select").filter({ hasText: "目标帕鲁" })).toContainText("SmallArmadillo");
  await expect(restored.locator(".depth-field")).toContainText("6 代");
  await expect(restored.locator(".plan-card").first()).toBeVisible();
  await restored.getByRole("link", { name: "图鉴", exact: true }).click();
  await expect(restored.getByLabel("搜索图鉴")).toHaveValue("xsn");
  await expect(restored.locator(".field").filter({ hasText: "排序" })).toContainText("攻击（高→低）");
  await restored.locator(".paldex-card").click();
  await expect(palDrawer(restored, "吓丝妮").getByRole("radio", { name: "4 星", exact: true })).toBeChecked();
  await restored.close();
});

test("我的帕鲁在同源页面间实时同步", async ({ page, context }) => {
  await openApp(page, "/collection");
  const second = await context.newPage();
  await openApp(second, "/collection");
  const firstCheckbox = page.locator(".collection-card").filter({ hasText: "吓丝妮" }).getByRole("checkbox");
  const secondCheckbox = second.locator(".collection-card").filter({ hasText: "吓丝妮" }).getByRole("checkbox");

  await page.locator(".collection-card").filter({ hasText: "吓丝妮" }).locator(".owned-toggle").click();
  await expect(secondCheckbox).toBeChecked();
  await second.locator(".collection-card").filter({ hasText: "吓丝妮" }).locator(".owned-toggle").click();
  await expect(firstCheckbox).not.toBeChecked();
  await second.close();
});

test("核心页面无严重无障碍问题", async ({ page }) => {
  test.setTimeout(90_000);
  for (const route of ["/breeding", "/paths", "/collection", "/paldex", "/paldex/OniGhostGirl"]) {
    await openApp(page, route);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    if (route === "/breeding") await page.getByRole("combobox", { name: "亲本 A", exact: true }).focus();
    await page.waitForTimeout(200);
    const results = await new AxeBuilder({ page }).analyze();
    const actionable: typeof results.violations = [];
    for (const violation of results.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))) {
      const nodes = [];
      for (const node of violation.nodes) {
        const target = node.target[0];
        const isNaiveSelectFalsePositive = violation.id === "scrollable-region-focusable"
          && typeof target === "string"
          && await page.locator(".pal-select__menu[tabindex='0']").locator(target).count() > 0;
        if (!isNaiveSelectFalsePositive) nodes.push(node);
      }
      if (nodes.length) actionable.push({ ...violation, nodes });
    }
    expect(actionable).toEqual([]);
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
  await page.getByRole("combobox", { name: "亲本 A", exact: true }).fill("xsn");
  const offlineOption = page.locator(".n-base-select-menu:visible .n-base-select-option").filter({ hasText: /吓丝妮.*OniGhostGirl/ });
  await expect(offlineOption).toHaveCount(1);
  await expect(offlineOption.locator("img")).toBeVisible();
});
