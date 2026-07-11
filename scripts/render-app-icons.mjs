import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assets = [
  ["app-icon.svg", "app-icon-192.png", 192],
  ["app-icon.svg", "app-icon-512.png", 512],
  ["app-icon-maskable.svg", "app-icon-maskable-512.png", 512],
];

const browser = await chromium.launch();
try {
  for (const [sourceName, outputName, size] of assets) {
    const svg = await readFile(resolve(root, "public", sourceName), "utf8");
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<style>html,body{margin:0;width:${size}px;height:${size}px}</style>${svg}`);
    await page.locator("svg").evaluate((element, pixels) => {
      element.setAttribute("width", String(pixels));
      element.setAttribute("height", String(pixels));
    }, size);
    await page.locator("svg").screenshot({ path: resolve(root, "public", outputName) });
    await page.close();
    console.log(`Rendered ${basename(outputName)} (${size}x${size})`);
  }
} finally {
  await browser.close();
}
