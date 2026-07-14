import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function openApp(page: Page, route: string) {
  await page.goto(`./#${route}`);
  await expect(page.locator(".data-version")).toContainText("1.0");
}

function field(page: Page, label: string) {
  return page.locator("label.field").filter({
    has: page.locator(".field__label").getByText(label, { exact: true }),
  });
}

function palDrawer(page: Page, palName: string) {
  return page.getByRole("dialog").filter({
    has: page.locator(".paldex-drawer__topbar").getByText(palName, { exact: true }),
  });
}

test("Paldex state=1 overrides conflicting local state and restores detail stars", async ({ context, page }) => {
  await context.addInitScript(() => {
    localStorage.setItem("pal-lab.paldex.v1", JSON.stringify({
      schema: 2,
      query: "qq",
      element: "Fire",
      work: "Mining",
      movement: "fly",
      sortKey: "hp",
      selectedStars: 0,
    }));
  });

  await openApp(page, "/paldex/OniGhostGirl?state=1&q=xsn&element=Dark&sort=attack&stars=4");

  await expect(page).toHaveURL(
    /#\/paldex\/OniGhostGirl\?state=1&q=xsn&element=Dark&sort=attack&stars=4$/,
  );
  await expect(page.getByLabel("搜索图鉴")).toHaveValue("xsn");
  await expect(field(page, "种类")).toContainText("全体");
  await expect(field(page, "排序")).toContainText("攻击");
  await expect(palDrawer(page, "吓丝妮").getByRole("radio", { name: "4 星", exact: true }))
    .toBeChecked();
});

test("Paldex detail uses history push while star changes preserve the entry", async ({ page }) => {
  await openApp(page, "/paldex?state=1&q=xsn");
  await expect(page.locator(".paldex-card")).toHaveCount(1);

  await page.locator(".paldex-card").click();
  const drawer = palDrawer(page, "吓丝妮");
  await expect(drawer).toBeVisible();
  await drawer.getByText("4 星", { exact: true }).click();
  await expect(page).toHaveURL(/#\/paldex\/OniGhostGirl\?state=1&q=xsn&stars=4$/);

  await page.goBack();
  await expect(page).toHaveURL(/#\/paldex\?state=1&q=xsn$/);
  await expect(drawer).toHaveCount(0);

  await page.goForward();
  await expect(page).toHaveURL(/#\/paldex\/OniGhostGirl\?state=1&q=xsn&stars=4$/);
  await expect(palDrawer(page, "吓丝妮").getByRole("radio", { name: "4 星", exact: true }))
    .toBeChecked();
});

test("legacy routes replace themselves with canonical shareable URLs", async ({ context, page }) => {
  await openApp(page, "/collection");
  await expect(page).toHaveURL(/#\/paldex\?state=1$/);

  const breedingPage = await context.newPage();
  await openApp(breedingPage, "/breeding?mode=mate&target=SmallArmadillo");
  await expect(breedingPage).toHaveURL(
    /#\/breeding\?state=1&mode=pairs&target=SmallArmadillo$/,
  );
  await breedingPage.close();

  const itemsPage = await context.newPage();
  await openApp(itemsPage, "/items?mode=calculator&target=Cake&qty=2");
  await expect(itemsPage).toHaveURL(
    /#\/items\/calculator\?state=1&target=Cake&qty=2$/,
  );
  await itemsPage.close();
});
