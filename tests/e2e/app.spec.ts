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
  const option = menu.locator(".n-base-select-option").filter({ hasText: new RegExp(`^\\s*${escapeRegExp(optionLabel)}\\s*$`) });
  await expect(menu).toBeVisible();
  if (await option.count()) {
    await option.first().click();
    await expect(page.locator(".n-base-select-menu:visible")).toHaveCount(0);
    return;
  }
  const list = menu.locator(".n-virtual-list");
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

test("@subpath 两类配种查询和图鉴入口可用", async ({ page }) => {
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

  await expect(page.locator(".segmented-control .n-tabs-tab").filter({ hasText: /A ＋ \? ＝ B/ })).toHaveCount(0);
  await selectTab(page, /\? ＋ \? ＝ B/);
  const targetSelect = page.locator(".pal-select").filter({ hasText: "目标子代 B" });
  const targetInput = page.getByRole("combobox", { name: "目标子代 B", exact: true });
  await targetInput.fill("qq");
  await expect(page.locator(".n-base-select-menu:visible .n-base-select-option")).toHaveCount(2);
  await targetInput.press("Tab");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("pal-lab.breeding.v1") ?? "null")?.target ?? "")).toBe("");
  await choose(page, "目标子代 B", "SmallArmadillo");
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
  const handiwork = firstPaldexCard.getByRole("listitem", { name: "手工作业 Lv.1" });
  await expect(handiwork).toBeVisible();
  await expect(handiwork).toContainText("Lv.1");
  await expect(handiwork).not.toContainText("手工作业");
  await expect(firstPaldexCard.locator(".self-breed-badge")).toHaveCount(0);
  await expect(page.locator(".mount-tech-badge")).toHaveCount(115);
  await expect(page.locator(".mount-type-badge")).toHaveCount(115);
  const paldexColumns = await page.locator(".paldex-grid").evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").length);
  expect(paldexColumns).toBe(page.viewportSize()!.width < 672 ? 1 : page.viewportSize()!.width < 1_088 ? 2 : 3);
  const paldexPreview = firstPaldexCard.locator(".paldex-preview");
  await expect(paldexPreview).toContainText(/生命70[\s\S]*Lv\.1/);
  const previewHandiwork = paldexPreview.getByRole("listitem", { name: "手工作业 Lv.1", includeHidden: true });
  await expect(previewHandiwork).toBeAttached();
  if (await page.evaluate(() => matchMedia("(hover: hover)").matches)) {
    await firstPaldexCard.hover();
    await expect(paldexPreview).toBeVisible();
    await expect(previewHandiwork).toBeVisible();
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
  await selectOption(page, "属性", "🔥 火");
  await expect(page.locator(".paldex-card").first().locator(".element-tag--fire")).toHaveText("火");
  await selectOption(page, "属性", "🌈 全部属性");
  await selectOption(page, "属性", "⛰️ 地");
  await expect(page.locator(".paldex-card").first().locator(".element-tag--earth")).toHaveText("地");
  await selectOption(page, "属性", "🌈 全部属性");
  await selectOption(page, "种类", "陆地");
  await expect(page.locator(".paldex-card")).toHaveCount(259);
  await expect(page.getByRole("heading", { name: "杰诺多兰", exact: true })).toBeVisible();
  await selectOption(page, "种类", "飞行");
  await expect(page.locator(".paldex-card")).toHaveCount(28);
  await expect(page.getByRole("heading", { name: "精灵龙", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "杰诺多兰", exact: true })).toBeVisible();
  await selectOption(page, "种类", "飞行兼落地");
  await expect(page.locator(".paldex-card")).toHaveCount(7);
  await expect(page.getByRole("heading", { name: "唤冬兽", exact: true })).toBeVisible();
  await selectOption(page, "种类", "游泳");
  await expect(page.locator(".paldex-card")).toHaveCount(8);
  await selectOption(page, "种类", "全体");
  await expect(page.locator(".paldex-card")).toHaveCount(288);
  await selectOption(page, "排序", "按种类冲刺参数");
  await expect(page.locator(".paldex-card").first()).toContainText(/空涡龙[\s\S]*3300/);
  await selectOption(page, "种类", "游泳");
  await page.getByLabel("搜索图鉴").fill("Umihebi");
  await expect(page.locator(".paldex-card__sort-value")).toHaveText(/游泳冲刺参数\s*1800/);
  await selectOption(page, "种类", "飞行");
  await page.getByLabel("搜索图鉴").fill("BlueSkyDragon");
  await expect(page.locator(".paldex-card__sort-value")).toHaveText(/飞行冲刺参数\s*2800/);
  await page.getByLabel("搜索图鉴").fill("DarkMechaDragon");
  await expect(page.locator(".paldex-card__sort-value")).toHaveText(/飞行冲刺参数\s*2700/);
  await selectOption(page, "种类", "陆地");
  await expect(page.locator(".paldex-card__sort-value")).toHaveText(/陆地冲刺参数\s*660/);
  await selectOption(page, "种类", "飞行兼落地");
  await expect(page.locator(".paldex-card__sort-value")).toHaveText(/飞行冲刺参数\s*2700/);
  await page.getByLabel("搜索图鉴").fill("");
  await selectOption(page, "种类", "全体");
  const sortField = page.locator("label.field").filter({ has: page.locator(".field__label").getByText("排序", { exact: true }) });
  await expect(sortField).toContainText("按种类冲刺参数");
  await expect(sortField).not.toContainText(/[（）]/);
  if (page.viewportSize()!.width >= 1_088) {
    const kindField = page.locator("label.field").filter({ has: page.locator(".field__label").getByText("种类", { exact: true }) });
    const [sortBox, kindBox] = await Promise.all([sortField.boundingBox(), kindField.boundingBox()]);
    expect(sortBox!.width).toBeGreaterThan(kindBox!.width);
  }
  const filterBarFits = await page.locator(".filter-bar--paldex").evaluate((element) =>
    element.scrollWidth <= element.clientWidth + 1);
  expect(filterBarFits).toBe(true);
  await selectOption(page, "工作", "⛏️ 采矿");
  await expect(page.locator(".paldex-card").first()).toContainText(/磐甲龙[\s\S]*No\. 184/);
  await selectOption(page, "工作", "🧰 全部工作");
  await selectOption(page, "排序", "飞行覆盖值");
  await expect(page.locator(".paldex-card").first()).toContainText(/杰诺多兰[\s\S]*1700/);
  await selectOption(page, "排序", "图鉴编号");
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
  const movementCard = drawer.locator(".movement-card");
  const partnerSkill = page.locator(".partner-skill-card");
  const detailCards = await Promise.all([statsCard, workCard, movementCard, partnerSkill]
    .map((card) => card.boundingBox()));
  for (let index = 1; index < detailCards.length; index += 1)
    expect(detailCards[index]!.y).toBeGreaterThanOrEqual(detailCards[index - 1]!.y + detailCards[index - 1]!.height - 1);
  const workColumns = await workCard.locator(".level-list").evaluate((list) =>
    getComputedStyle(list).gridTemplateColumns.split(" ").length);
  expect(workColumns).toBe(page.viewportSize()!.width < 672 ? 1 : 2);
  await expect(statsCard.locator(".stat-grid > div").filter({ hasText: "生命" })).toHaveText("生命70");
  await expect(statsCard.locator(".stat-grid > div").filter({ hasText: "攻击" })).toHaveText("攻击85");
  await expect(statsCard.locator(".stat-grid > div").filter({ hasText: "防御" })).toHaveText("防御80");
  await expect(statsCard.locator(".stat-grid > div").filter({ hasText: "体力" })).toHaveText("体力100");
  await expect(workCard).toContainText(/手工作业\s*Lv\.3[\s\S]*制药\s*Lv\.4[\s\S]*搬运\s*Lv\.2/);
  await expect(partnerSkill.getByRole("heading", { name: "播撒欢笑的亡者" })).toBeVisible();
  await expect(partnerSkill.locator(".partner-skill-description")).toContainText("攻击力降低40%");
  await expect(partnerSkill.getByRole("heading", { name: "0 星具体参数" })).toBeVisible();
  await expect(partnerSkill.locator(".partner-metric-list")).toContainText(/攻击中毒目标时施加降攻[\s\S]*40%[\s\S]*玩家/);

  await refinementSelector.getByText("4 星", { exact: true }).click();
  await expect(zeroStarButton).not.toBeChecked();
  await expect(fourStarButton).toBeChecked();
  await expect(statsCard.locator(".stat-grid > div").filter({ hasText: "生命" })).toHaveText("生命84");
  await expect(statsCard.locator(".stat-grid > div").filter({ hasText: "攻击" })).toHaveText("攻击102");
  await expect(statsCard.locator(".stat-grid > div").filter({ hasText: "防御" })).toHaveText("防御96");
  await expect(statsCard.locator(".stat-grid > div").filter({ hasText: "体力" })).toHaveText("体力100");
  await expect(workCard).toContainText(/手工作业\s*Lv\.5[\s\S]*制药\s*Lv\.6[\s\S]*搬运\s*Lv\.4/);
  await expect(partnerSkill.getByRole("heading", { name: "4 星具体参数" })).toBeVisible();
  await expect(partnerSkill.locator(".partner-skill-description")).toContainText("攻击力降低对应幅度");
  await expect(partnerSkill.locator(".partner-skill-description")).not.toContainText("40%");
  await expect(partnerSkill.locator(".partner-metric-list")).toContainText(/攻击中毒目标时施加降攻[\s\S]*80%[\s\S]*玩家/);
  await expect(partnerSkill.locator(".partner-metric-list")).not.toContainText("40");
  await expect(movementCard.getByRole("heading", { name: "移动参数" })).toBeVisible();
  await expect(movementCard).toContainText(/内部移动类型：\s*地面[\s\S]*奔跑参数/);
  await expect(movementCard.locator(".movement-note")).toHaveCount(0);
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

test("伙伴技能直接显示当前星级的结构化参数", async ({ page }) => {
  test.setTimeout(90_000);
  await openApp(page, "/paldex/PinkCat");
  const drawer = palDrawer(page, "捣蛋猫");
  const partnerSkill = drawer.locator(".partner-skill-card");
  const metrics = partnerSkill.locator(".partner-metric-list");

  const description = partnerSkill.locator(".partner-skill-description");
  await expect(description).toContainText("负重上限将提高100");
  await expect(description).not.toContainText(/科技\s*\d+/);
  await expect(partnerSkill.getByRole("heading", { name: "0 星具体参数" })).toBeVisible();
  await expect(metrics).toContainText(/负重上限增加[\s\S]*100 点[\s\S]*玩家/);

  await drawer.getByText("4 星", { exact: true }).click();
  await expect(partnerSkill.getByRole("heading", { name: "4 星具体参数" })).toBeVisible();
  await expect(description).toContainText("负重上限将提高对应数值");
  await expect(description).not.toContainText("提高100");
  await expect(metrics).toContainText(/负重上限增加[\s\S]*200 点[\s\S]*玩家/);
  await expect(metrics).not.toContainText("100 点");
  await expect(drawer.locator(".movement-note")).toHaveCount(0);

  await openApp(page, "/paldex/ThunderBird");
  const thunderDrawer = palDrawer(page, "迅雷鸟");
  await thunderDrawer.getByText("4 星", { exact: true }).click();
  const thunderMetrics = thunderDrawer.locator(".partner-metric-list");
  await expect(thunderMetrics.locator("li").filter({ hasText: "移动速度增加" })).toContainText("25%");
  await expect(thunderMetrics.locator("li").filter({ hasText: "攻击增加" })).toContainText("20%");
  await expect(thunderMetrics.locator("li").filter({ hasText: "为攻击附加雷属性" })).toContainText("生效");

  await openApp(page, "/paldex/FlowerPrince");
  const poisonGas = palDrawer(page, "夜蔓爵").locator(".partner-metric-list li").filter({ hasText: "毒气伤害无效" });
  await expect(poisonGas).toContainText("生效");
  await expect(poisonGas).not.toContainText(/\b0\b/);

  await openApp(page, "/paldex/Garm");
  const garmDrawer = palDrawer(page, "猎狼");
  await garmDrawer.getByText("0 星", { exact: true }).click();
  const garmSkill = garmDrawer.locator(".partner-skill-card");
  await expect(garmSkill.locator(".partner-metric-list")).toHaveCount(0);
  await expect(garmSkill).toContainText("骑乘期间的移动速度会稍微变快一点");
  await expect(garmSkill).not.toContainText(/科技\s*9/);

  await openApp(page, "/paldex/Ganesha");
  const ganeshaDrawer = palDrawer(page, "壶小象");
  await ganeshaDrawer.getByText("4 星", { exact: true }).click();
  const ganeshaDescription = ganeshaDrawer.locator(".partner-skill-description");
  await expect(ganeshaDescription).toContainText("生命值低于30%");
  await expect(ganeshaDescription).toContainText("恢复对应幅度");
  await expect(ganeshaDescription).toContainText("120秒冷却");
  await expect(ganeshaDescription).not.toContainText("恢复20%");

  await openApp(page, "/paldex/PurpleSpider");
  await expect(palDrawer(page, "桃蛛娘").locator(".partner-skill-description")).toContainText("2段跳跃");

  await openApp(page, "/paldex/GhostRabbit");
  const soulDescription = palDrawer(page, "魅爱莉").locator(".partner-skill-description");
  await expect(soulDescription).toContainText("获得量提升对应幅度");
  await expect(soulDescription).not.toContainText("+对应幅度");
});

test("图鉴已拥有标记支持旧地址、排序、刷新和库存路线", async ({ page }) => {
  test.setTimeout(90_000);
  await openApp(page, "/collection");
  await expect(page).toHaveURL(/#\/paldex\?view=all$/);
  await expect(page.getByRole("heading", { name: "帕鲁图鉴", level: 1 })).toBeVisible();
  await expect(page.locator(".paldex-item")).toHaveCount(288);
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
  await page.getByLabel("搜索图鉴").fill("xsn");
  await expect(page.locator(".paldex-item")).toHaveCount(1);
  const oni = page.locator(".paldex-item").filter({ hasText: "吓丝妮" });
  await expect(oni.getByRole("button", { name: "取消标记吓丝妮为已拥有" })).toBeVisible();
  await page.getByLabel("搜索图鉴").fill("");
  const ganesha = page.locator(".paldex-item").filter({ hasText: "壶小象" });
  await expect(ganesha.getByRole("button", { name: "取消标记壶小象为已拥有" })).toBeVisible();
  await expect(page.getByText(/雄性记录|雌性记录|已有性别/)).toHaveCount(0);

  await selectOption(page, "拥有状态", "仅已拥有");
  await expect(page).toHaveURL(/view=owned/);
  await selectOption(page, "排序", "攻击");
  await expect(page.locator(".paldex-card").first()).toContainText("吓丝妮");

  const migrated = await page.evaluate(() => JSON.parse(localStorage.getItem("pal-lab.collection.v1") ?? "null") as {
    schema: number;
    entries: Record<string, unknown>[];
  });
  expect(migrated.schema).toBe(2);
  expect(migrated.entries).toEqual([{ palId: "OniGhostGirl" }, { palId: "Ganesha" }]);
  expect(migrated.entries.every((entry) => Object.keys(entry).length === 1)).toBe(true);

  await page.reload();
  await expect(page.locator(".data-version")).toContainText("1.0");
  await expect(page.locator("label.field").filter({ hasText: "拥有状态" })).toContainText("仅已拥有");
  await expect(page.locator(".paldex-item").filter({ hasText: "吓丝妮" }).getByRole("button", { name: "取消标记吓丝妮为已拥有" })).toBeVisible();
  await expect(page.locator(".paldex-item").filter({ hasText: "壶小象" }).getByRole("button", { name: "取消标记壶小象为已拥有" })).toBeVisible();

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

  await openApp(page, "/paldex");
  await expect(page).toHaveURL(/#\/paldex\?view=owned$/);
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
  await selectOption(page, "排序", "攻击");
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
  await expect(restored.locator(".field").filter({ hasText: "排序" })).toContainText("攻击");
  await restored.locator(".paldex-card").click();
  await expect(palDrawer(restored, "吓丝妮").getByRole("radio", { name: "4 星", exact: true })).toBeChecked();
  await restored.close();
});

test("图鉴已拥有标记在同源页面间实时同步", async ({ page, context }) => {
  test.setTimeout(90_000);
  await openApp(page, "/paldex");
  const second = await context.newPage();
  await openApp(second, "/paldex");
  await page.getByLabel("搜索图鉴").fill("xsn");
  await second.getByLabel("搜索图鉴").fill("xsn");
  const firstItem = page.locator(".paldex-item").filter({ hasText: "吓丝妮" });
  const secondItem = second.locator(".paldex-item").filter({ hasText: "吓丝妮" });

  await firstItem.getByRole("button", { name: "标记吓丝妮为已拥有" }).click();
  await expect(secondItem.getByRole("button", { name: "取消标记吓丝妮为已拥有" })).toBeVisible();
  await selectOption(second, "拥有状态", "仅已拥有");
  await secondItem.getByRole("button", { name: "取消标记吓丝妮为已拥有" }).click();
  await expect(second.getByLabel("搜索图鉴")).toBeFocused();
  await expect(firstItem).toHaveCount(0);
  await selectOption(page, "拥有状态", "全部帕鲁");
  await expect(page.locator(".paldex-item").filter({ hasText: "吓丝妮" }).getByRole("button", { name: "标记吓丝妮为已拥有" })).toBeVisible();
  await second.close();
});

test("道具图鉴与材料计算器展开蛋糕的完整真实配方", async ({ page }) => {
  test.setTimeout(90_000);
  await openApp(page, "/items");
  await expect(page.getByRole("heading", { name: "道具工坊", level: 1 })).toBeVisible();

  await page.getByLabel("搜索道具").fill("蛋糕");
  const cakeCard = page.getByRole("button", { name: "查看蛋糕详情", exact: true });
  await expect(cakeCard).toBeVisible();
  await expect(cakeCard).toContainText(/蛋糕[\s\S]*Cake[\s\S]*1 个配方[\s\S]*630/);
  await cakeCard.click();

  const drawer = page.locator(".item-drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("蛋糕 · 道具详情");
  await expect(drawer.locator(".item-detail__stats > div").filter({ hasText: "基础出售价" }))
    .toHaveText(/基础出售价\s*630/);
  const cakeRecipe = drawer.locator(".item-recipe-card");
  await expect(cakeRecipe).toHaveCount(1);
  await expect(cakeRecipe).toContainText(/Cake[\s\S]*产出 1[\s\S]*基准工作量 2,000/);
  await expect(cakeRecipe).toContainText(
    /面粉 × 5[\s\S]*红色野莓 × 8[\s\S]*牛奶 × 7[\s\S]*蛋 × 8[\s\S]*蜂蜜 × 2/,
  );

  await drawer.getByRole("button", { name: "计算此道具" }).click();
  await expect(page.locator(".item-calculator")).toBeVisible();
  const quantity = page.getByRole("textbox", { name: /目标数量/ });
  await quantity.fill("2");
  await quantity.press("Tab");
  await expect(page).toHaveURL(/#\/items\?mode=calculator&target=Cake&qty=2$/);

  const summary = page.locator(".item-plan-summary");
  await expect(summary).toContainText(/目标\s*蛋糕 × 2/);
  await expect(summary).toContainText(/实际产出\s*2/);
  await expect(summary).toContainText(/制作步骤\s*2/);
  await expect(summary).toContainText(/总基准工作量\s*4,100/);
  await expect(summary).toContainText(/目标售价合计\s*1,260/);

  const materials = page.locator(".item-material-list li");
  await expect(materials).toHaveCount(5);
  for (const [name, amount] of [
    ["小麦", 30], ["红色野莓", 16], ["牛奶", 14], ["蛋", 16], ["蜂蜜", 4],
  ] as const) {
    const row = materials.filter({ hasText: new RegExp(`${escapeRegExp(name)}[\\s\\S]*×\\s*${amount}`) });
    await expect(row).toHaveCount(1);
  }

  const steps = page.locator(".item-step-list li");
  await expect(steps).toHaveCount(2);
  await expect(steps.nth(0)).toContainText(/面粉 × 10[\s\S]*10 批 · 需要 10 · 余 0[\s\S]*小麦 × 30/);
  await expect(steps.nth(1)).toContainText(/蛋糕 × 2[\s\S]*2 批 · 需要 2 · 余 0/);
  await expect(steps.nth(1)).toContainText(
    /红色野莓 × 16[\s\S]*蛋 × 16[\s\S]*面粉 × 10[\s\S]*蜂蜜 × 4[\s\S]*牛奶 × 14/,
  );
});

test("词条图鉴收录正式词条并支持检索筛选与固定携带跳转", async ({ page }) => {
  await openApp(page, "/passives");
  await expect(page.getByRole("heading", { name: "词条图鉴", level: 1 })).toBeVisible();
  await expect(page.locator(".passive-card")).toHaveCount(115);
  const passiveListColumns = await page.locator(".passive-grid").evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").length);
  expect(passiveListColumns).toBe(1);
  if (page.viewportSize()!.width >= 1_088) {
    await expect(page.locator(".passive-table__head")).toBeVisible();
    const rowColumns = await page.locator(".passive-card").first().evaluate((row) => getComputedStyle(row).gridTemplateColumns.split(" ").length);
    expect(rowColumns).toBe(4);
  }
  await expect(page.locator(".passive-summary")).toContainText(/正式词条\s*115/);
  await expect(page.locator(".passive-summary")).toContainText(/进入随机词条池\s*85/);
  await expect(page.locator(".passive-summary")).toContainText(/不进入随机词条池\s*30/);
  await expect(page.locator(".passive-summary")).toContainText(/可付费手术\s*33/);

  const search = page.getByLabel("搜索词条");
  await search.fill("zjjy");
  await expect(page.locator(".passive-card")).toHaveCount(1);
  await expect(page.locator(".passive-card")).toContainText(/卓绝技艺[\s\S]*工作速度 \+75%[\s\S]*权重 5/);
  await expect(page.locator(".passive-card__footer")).toContainText("CraftSpeed_up3");

  await search.fill("Legend");
  const legend = page.locator(".passive-card");
  await expect(legend).toHaveCount(1);
  await expect(legend).toContainText(/传说[\s\S]*4 星[\s\S]*攻击\+20%[\s\S]*不进入随机词条池/);
  await expect(legend.locator(".passive-card__carriers a")).toHaveCount(6);
  await legend.getByRole("link", { name: "查看唤冬兽的详细图鉴" }).click();
  await expect(palDrawer(page, "唤冬兽")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "词条图鉴", level: 1 })).toBeVisible();

  await search.fill("");
  await selectOption(page, "等级", "5 星");
  await expect(page.locator(".passive-card")).toHaveCount(7);
  await selectOption(page, "等级", "全部等级");
  await selectOption(page, "随机词条池", "不进入随机词条池");
  await expect(page.locator(".passive-card")).toHaveCount(30);
  await selectOption(page, "随机词条池", "全部词条");
  await selectOption(page, "额外获取", "可付费手术");
  await expect(page.locator(".passive-card")).toHaveCount(33);
  await selectOption(page, "额外获取", "有对应道具");
  await expect(page.locator(".passive-card")).toHaveCount(35);

  await page.setViewportSize({ width: 700, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test("核心页面无严重无障碍问题", async ({ page }) => {
  test.setTimeout(150_000);
  for (const route of ["/breeding", "/paths", "/paldex", "/paldex/OniGhostGirl", "/passives", "/items"]) {
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
  await page.getByRole("link", { name: "词条", exact: true }).click();
  await expect(page.getByRole("heading", { name: "词条图鉴" })).toBeVisible();
  await page.getByLabel("搜索词条").fill("CraftSpeed_up3");
  await expect(page.locator(".passive-card")).toHaveCount(1);
  await expect(page.locator(".passive-card")).toContainText("卓绝技艺");
  await page.getByRole("link", { name: "道具", exact: true }).click();
  await expect(page.getByRole("heading", { name: "道具工坊" })).toBeVisible();
  await expect(page.locator(".item-summary")).toContainText(/收录道具\s*1891/);
  await page.getByLabel("搜索道具").fill("蛋糕");
  const offlineCake = page.getByRole("button", { name: "查看蛋糕详情", exact: true });
  await expect(offlineCake).toBeVisible();
  await expect(offlineCake.locator("img")).toBeVisible();
  await offlineCake.click();
  await expect(page.locator(".item-drawer")).toContainText(/基础出售价\s*630/);
});
