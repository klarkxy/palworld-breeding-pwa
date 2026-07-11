import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
import type { FullConfig } from "@playwright/test";

export default async function globalSetup(_config: FullConfig) {
  const url = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";
  const previewBase = new URL(url).pathname || "/";
  const server = spawn(process.execPath, [
    path.resolve("node_modules/vite/bin/vite.js"),
    "preview",
    "--host",
    "127.0.0.1",
  ], {
    cwd: process.cwd(),
    env: { ...process.env, VITE_BASE_PATH: process.env.VITE_BASE_PATH ?? previewBase },
    stdio: "ignore",
    windowsHide: true,
  });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Vite preview exited with code ${server.exitCode}`);
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) break;
    } catch {
      // Preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (attempt === 79) throw new Error(`Vite preview did not become ready at ${url}`);
  }

  return () => {
    if (!server.pid || server.exitCode !== null) return;
    if (process.platform === "win32") {
      try {
        execFileSync("taskkill.exe", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
      } catch {
        // Vite may have already exited with its parent between the check and taskkill.
      }
    } else {
      server.kill("SIGTERM");
    }
  };
}
