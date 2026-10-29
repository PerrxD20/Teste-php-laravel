import { test, expect } from "@playwright/test";
test("dados reais, navegação por todas as abas, busca, exportação e demonstração", async ({
  page,
}) => {
  const errors: string[] = [];
  const externalRequests: string[] = [];
  page.on("request", (req) => {
    if (!["127.0.0.1", "localhost"].includes(new URL(req.url()).hostname))
      externalRequests.push(req.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Informações do sistema", exact: true }),
  ).toBeVisible({ timeout: 45000 });
  await expect(
    page.getByText("Dados de ", { exact: false }).last(),
  ).toContainText("não do dispositivo do navegador");
  await page.getByRole("tab", { name: "Sistema", exact: true }).focus();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("tab", { name: "Temperatura", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await page
    .getByRole("button", { name: "Explorar demonstração" })
    .first()
    .click();
  await expect(
    page.getByText("Modo demonstração", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.locator("dd").filter({ hasText: "AMD Ryzen 5 5600X" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fechar notificação" }).click();
  await page.screenshot({ path: "/tmp/mello-desktop.png", fullPage: true });
  await page.getByRole("tab", { name: "Armazenamento", exact: true }).click();
  await expect(page.locator(".disk-life > strong")).toHaveText("98%");
  await expect(page.getByText("Não estimável com segurança")).toBeVisible();
  await page.getByRole("tab", { name: "Drivers", exact: true }).click();
  await page.getByRole("textbox", { name: "Buscar drivers" }).fill("NVIDIA");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page
    .getByRole("textbox", { name: "Buscar drivers" })
    .fill("impossível-dispositivo");
  await expect(page.getByText("Nenhum dispositivo encontrado")).toBeVisible();
  await page.getByRole("tab", { name: "Memória RAM", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Iniciar teste rápido" }),
  ).toBeDisabled();
  await page.getByRole("tab", { name: "Temperatura", exact: true }).click();
  await expect(page.getByText("46", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Exportar relatório" }).click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Dados completos" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toContain("demonstracao");
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const exported = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(exported.demonstration).toBe(true);
  expect(exported.snapshot.mode).toBe("demo");
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  await page.getByRole("switch", { name: "Atualização automática" }).click();
  await expect(page.getByRole("switch")).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Voltar aos dados reais" }).click();
  await page.getByRole("tab", { name: "Memória RAM", exact: true }).click();
  await page.getByRole("button", { name: "Iniciar teste rápido" }).click();
  await expect(
    page.getByText("Nenhuma divergência na região testada"),
  ).toBeVisible({ timeout: 15000 });
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
});
test("interface móvel sem transbordamento e navegação por toque", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Informações do sistema", exact: true }),
  ).toBeVisible({ timeout: 45000 });
  await page
    .getByRole("button", { name: "Explorar demonstração" })
    .first()
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: "/tmp/mello-mobile.png", fullPage: true });
  await page.getByRole("tab", { name: "Temperatura", exact: true }).click();
  await expect(
    page.getByText("Monitoramento térmico", { exact: false }).first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});
test("API rejeita mutações de outra origem e não reinicia sistemas incompatíveis", async ({
  request,
}) => {
  const denied = await request.post("http://127.0.0.1:4318/api/ram/test", {
    data: {},
    headers: { Origin: "https://untrusted.example" },
  });
  expect(denied.status()).toBe(403);
  const health = await request.get("http://127.0.0.1:4318/api/health");
  const platform = (await health.json()).platform;
  if (platform !== "win32") {
    const native = await request.post("http://127.0.0.1:4318/api/ram/native", {
      data: { confirmed: true },
    });
    expect(native.status()).toBe(400);
  }
  const scan = await request.post("http://127.0.0.1:4318/api/scan", {
    data: { deep: true },
  });
  expect(scan.ok()).toBeTruthy();
  expect((await scan.json()).mode).toBe("live");
});
