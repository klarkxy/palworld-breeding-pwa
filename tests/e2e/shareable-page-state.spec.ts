import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

test.describe.configure({ timeout: 90_000 });

async function openApp(page: Page, route: string) {
  await page.goto(`./#${route}`);
  await expect(page.locator(".data-version")).toContainText("1.0");
}

async function seedLocalStorage(page: Page, values: Record<string, unknown>) {
  await page.addInitScript((storage) => {
    for (const [key, value] of Object.entries(storage)) {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  }, values);
}

async function expectCanonicalHash(page: Page, expected: string) {
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(expected);
}

function field(page: Page, label: string) {
  return page.locator("label.field").filter({
    has: page.locator(".field__label").getByText(label, { exact: true }),
  });
}

test("配种分享快照覆盖冲突状态，但保留接收者自己的库存", async ({ page }) => {
  await seedLocalStorage(page, {
    "pal-lab.breeding.v1": {
      schema: 1,
      mode: "forward",
      parentA: "PinkCat",
      parentB: "Garm",
      target: "FlowerDinosaur",
      ownedOnly: false,
    },
    "pal-lab.collection.v1": {
      schema: 2,
      dataVersion: "receiver-only",
      entries: [{ palId: "PinkCat" }, { palId: "Garm" }],
      query: "receiver-only",
      view: "owned",
    },
  });

  await openApp(
    page,
    "/breeding?state=1&mode=pairs&a=OniGhostGirl&b=Ganesha&target=SmallArmadillo&owned=1",
  );

  await expectCanonicalHash(
    page,
    "#/breeding?state=1&mode=pairs&a=OniGhostGirl&b=Ganesha&target=SmallArmadillo&owned=1",
  );
  await expect(page.getByRole("combobox", { name: "目标子代 B", exact: true })).toBeVisible();
  await expect(page.locator(".pal-select").filter({ hasText: "目标子代 B" })).toContainText("SmallArmadillo");
  await expect(page.getByRole("checkbox", { name: "只看库存中可直接配对的组合" })).toBeChecked();

  await expect.poll(() => page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("pal-lab.breeding.v1") ?? "null");
    return [stored?.mode, stored?.parentA, stored?.parentB, stored?.target, stored?.ownedOnly];
  })).toEqual(["pairs", "OniGhostGirl", "Ganesha", "SmallArmadillo", true]);

  await expect.poll(() => page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("pal-lab.collection.v1") ?? "null");
    return (stored?.entries ?? []).map((entry: { palId: string }) => entry.palId).sort();
  })).toEqual(["Garm", "PinkCat"]);
});

test("路线分享快照覆盖冲突持久化并恢复已运行结果", async ({ page }) => {
  await seedLocalStorage(page, {
    "pal-lab.paths.v1": {
      schema: 1,
      mode: "owned",
      start: "PinkCat",
      target: "Garm",
      maxDepth: 1,
      lastRun: { mode: "owned", start: "", target: "Garm", maxDepth: 1 },
    },
  });

  await openApp(
    page,
    "/paths?state=1&start=OniGhostGirl&target=SmallArmadillo&depth=6&run=1",
  );

  await expectCanonicalHash(
    page,
    "#/paths?state=1&start=OniGhostGirl&target=SmallArmadillo&depth=6&run=1",
  );
  await expect(page.locator(".pal-select").filter({ hasText: "起点帕鲁" })).toContainText("OniGhostGirl");
  await expect(page.locator(".pal-select").filter({ hasText: "目标帕鲁" })).toContainText("SmallArmadillo");
  await expect(page.locator(".depth-field")).toContainText("6 代");
  await expect(page.locator(".plan-card").first()).toBeVisible();

  await expect.poll(() => page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("pal-lab.paths.v1") ?? "null");
    return {
      mode: stored?.mode,
      start: stored?.start,
      target: stored?.target,
      maxDepth: stored?.maxDepth,
      lastRun: stored?.lastRun,
    };
  })).toEqual({
    mode: "single",
    start: "OniGhostGirl",
    target: "SmallArmadillo",
    maxDepth: 6,
    lastRun: { mode: "single", start: "OniGhostGirl", target: "SmallArmadillo", maxDepth: 6 },
  });
});

test("词条分享参数可恢复，非法枚举会被清理为规范地址", async ({ page }) => {
  await openApp(page, "/passives?state=1&q=Legend&rank=4&pool=excluded&acquisition=none");

  await expectCanonicalHash(
    page,
    "#/passives?state=1&q=Legend&rank=4&pool=excluded&acquisition=none",
  );
  await expect(page.getByLabel("搜索词条")).toHaveValue("Legend");
  await expect(field(page, "等级")).toContainText("4 星");
  await expect(field(page, "随机词条池")).toContainText("不进入随机词条池");
  await expect(field(page, "额外获取")).toContainText("无手术或道具");
  await expect(page.locator(".passive-card")).toHaveCount(1);
  await expect(page.locator(".passive-card__footer")).toContainText("Legend");

  await openApp(page, "/passives?state=1&q=Legend&rank=99&pool=broken&acquisition=unknown");

  await expectCanonicalHash(page, "#/passives?state=1&q=Legend");
  await expect(page.getByLabel("搜索词条")).toHaveValue("Legend");
  await expect(field(page, "等级")).toContainText("全部等级");
  await expect(field(page, "随机词条池")).toContainText("全部词条");
  await expect(field(page, "额外获取")).toContainText("全部记录");
  await expect(page.locator(".passive-card")).toHaveCount(1);
});

test("道具详情保留列表背景并支持后退，材料计算清理非法 choice", async ({ page }) => {
  const catalogHash = "#/items?state=1&q=Cake&category=Food&sort=work-desc";
  await openApp(page, "/items?state=1&q=Cake&category=Food&sort=work-desc");

  await expectCanonicalHash(page, catalogHash);
  await expect(page.getByLabel("搜索道具")).toHaveValue("Cake");
  await expect(field(page, "类别")).toContainText("食物");
  await expect(field(page, "排序")).toContainText("总工作量：高到低");

  const cake = page.getByRole("button", { name: "查看蛋糕详情", exact: true });
  await expect(cake).toBeVisible();
  await cake.click();
  await expectCanonicalHash(
    page,
    "#/items/Cake?state=1&q=Cake&category=Food&sort=work-desc",
  );
  await expect(page.locator(".item-drawer")).toBeVisible();

  await page.goBack();
  await expectCanonicalHash(page, catalogHash);
  await expect(page.locator(".item-drawer")).toBeHidden();
  await expect(page.getByLabel("搜索道具")).toHaveValue("Cake");
  await expect(field(page, "类别")).toContainText("食物");
  await expect(field(page, "排序")).toContainText("总工作量：高到低");

  await openApp(
    page,
    "/items/calculator?state=1&target=Cake&qty=2&choice=bad&choice=Cake:MissingRecipe&choice=Unknown:Missing",
  );

  await expectCanonicalHash(page, "#/items/calculator?state=1&target=Cake&qty=2");
  await expect(field(page, "目标道具")).toContainText(/蛋糕[\s\S]*Cake/);
  await expect(page.getByRole("textbox", { name: /目标数量/ })).toHaveValue("2");
  await expect(page.locator(".item-plan-summary")).toContainText(/目标\s*蛋糕 × 2/);
});
