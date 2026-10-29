import { _electron as electron, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const profile = await fs.mkdtemp(path.join(os.tmpdir(), "mello-desktop-test-"));
const executablePath = process.env.MELLO_DESKTOP_EXECUTABLE;
const args = [...(executablePath ? [] : ["."]), "--user-data-dir=" + profile];
if (process.platform === "linux" && process.env.CI)
  args.unshift("--no-sandbox", "--disable-gpu");
const desktop = await electron.launch({
  args,
  ...(executablePath ? { executablePath } : {}),
  cwd: process.cwd(),
  timeout: 30000,
});
let errors = [];
try {
  const page = await desktop.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(
    page.getByRole("heading", { name: "Informações do sistema", exact: true }),
  ).toBeVisible({ timeout: 60000 });
  assert.ok((await page.title()).includes("Mello"));
  const settings = await desktop.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    const p = w.webContents.getLastWebPreferences();
    return {
      nodeIntegration: p.nodeIntegration,
      contextIsolation: p.contextIsolation,
      sandbox: p.sandbox,
      url: w.webContents.getURL(),
    };
  });
  assert.equal(settings.nodeIntegration, false);
  assert.equal(settings.contextIsolation, true);
  assert.equal(settings.sandbox, true);
  const unauthorized = await fetch(new URL("/api/health", settings.url));
  assert.equal(unauthorized.status, 403);
  assert.equal(await page.evaluate(() => typeof window.require), "undefined");
  await page.getByRole("tab", { name: "Memória RAM", exact: true }).click();
  await page.getByRole("button", { name: "Iniciar teste rápido" }).click();
  await expect(
    page.getByText("Nenhuma divergência na região testada"),
  ).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Explorar demonstração" }).click();
  for (const tab of [
    "Sistema",
    "Armazenamento",
    "Drivers",
    "Memória RAM",
    "Temperatura",
  ]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await expect(
      page.getByRole("tab", { name: tab, exact: true }),
    ).toHaveAttribute("aria-selected", "true");
  }
  await page.getByRole("tab", { name: "Sistema", exact: true }).click();
  await page.screenshot({
    path: path.join(os.tmpdir(), "mello-desktop-native.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "Desktop smoke: window, real collector, session isolation, sandbox, RAM worker and five tabs PASS",
  );
} finally {
  await desktop.close();
  await fs.rm(profile, { recursive: true, force: true });
}
