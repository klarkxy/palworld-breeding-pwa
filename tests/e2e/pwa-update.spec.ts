import { createServer } from "node:http";
import type { Server } from "node:http";
import { appendFile, cp, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

test.describe.configure({ timeout: 90_000 });

const contentTypes: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".webp": "image/webp",
};

async function startStaticServer(root: string) {
  const absoluteRoot = path.resolve(root);
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      const relative = decodeURIComponent(pathname).replace(/^\/+/, "") || "index.html";
      const filename = path.resolve(absoluteRoot, relative);
      if (filename !== absoluteRoot && !filename.startsWith(absoluteRoot + path.sep)) {
        response.writeHead(403).end();
        return;
      }
      const body = await readFile(filename);
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Content-Type", contentTypes[path.extname(filename)] ?? "application/octet-stream");
      if (relative === "sw.js") response.setHeader("Service-Worker-Allowed", "/");
      response.writeHead(200).end(body);
    } catch {
      response.writeHead(404).end();
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("临时 PWA 服务器启动失败");
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

test("waiting worker 点击刷新后激活、重载一次并关闭提示", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Service Worker 升级链路只需在 Chromium 桌面项目执行一次");

  const siteRoot = testInfo.outputPath("pwa-site");
  await cp(path.resolve("dist"), siteRoot, { recursive: true });
  const { server, url } = await startStaticServer(siteRoot);
  let updater = null as Awaited<ReturnType<typeof context.newPage>> | null;

  try {
    await page.addInitScript(() => {
      const key = "pwa-update-e2e-loads";
      const loads = Number(sessionStorage.getItem(key) ?? "0") + 1;
      sessionStorage.setItem(key, String(loads));
    });
    await page.goto(`${url}/#/breeding`);
    await expect(page.getByRole("heading", { name: "配种计算" })).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    const loadsBeforeUpdate = await page.evaluate(() => Number(sessionStorage.getItem("pwa-update-e2e-loads")));

    await appendFile(path.join(siteRoot, "sw.js"), `\n// external-update-${Date.now()}\n`);
    updater = await context.newPage();
    await updater.goto(`${url}/#/breeding`);
    await updater.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      await registration.update();
    });

    await expect.poll(() => page.evaluate(async () =>
      Boolean((await navigator.serviceWorker.getRegistration())?.waiting))).toBe(true);
    const refreshButton = page.getByRole("button", { name: "立即刷新", exact: true });
    await expect(refreshButton).toBeVisible();
    await updater.close();
    updater = null;

    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15_000 }),
      refreshButton.click(),
    ]);
    await expect.poll(async () => {
      try {
        return await page.evaluate(() => Number(sessionStorage.getItem("pwa-update-e2e-loads")));
      } catch {
        return -1;
      }
    }, { timeout: 15_000 }).toBe(loadsBeforeUpdate + 1);
    await expect(page.getByText("新配种数据已就绪", { exact: true })).toHaveCount(0);
    await expect.poll(() => page.evaluate(async () =>
      Boolean((await navigator.serviceWorker.getRegistration())?.waiting))).toBe(false);

    await page.waitForTimeout(400);
    expect(await page.evaluate(() => Number(sessionStorage.getItem("pwa-update-e2e-loads"))))
      .toBe(loadsBeforeUpdate + 1);
  } finally {
    await updater?.close();
    await closeServer(server);
  }
});
