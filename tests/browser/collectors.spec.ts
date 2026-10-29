import { expect, test, type Page } from "@playwright/test";
import { demoSnapshot } from "../../src/demo";
import type { Snapshot } from "../../src/types";

// Electron's user-agent only enables the desktop controls in this browser
// fixture. Every native operation below is intercepted; no driver is installed.
test.use({ userAgent: "Mozilla/5.0 MelloCollectorTest Electron/45.1.0" });

function liveFixture(): Snapshot {
  const snapshot = demoSnapshot();
  snapshot.mode = "live";
  snapshot.scope = "host";
  snapshot.host.name = "COLETOR-TESTE";
  return snapshot;
}
async function mockSnapshot(page: Page, snapshot: Snapshot) {
  await page.route("**/api/snapshot", (route) =>
    route.fulfill({ json: snapshot }),
  );
  await page.route("**/api/scan", (route) => route.fulfill({ json: snapshot }));
}

test("sensores parciais explicam o acesso e só solicitam o driver após confirmação", async ({
  page,
}) => {
  const snapshot = liveFixture();
  snapshot.sensorCollector = {
    state: "partial",
    source: "LibreHardwareMonitor integrado",
    diagnostics: [
      "PawnIO não instalado. Leituras de GPU podem continuar disponíveis.",
    ],
    isAdministrator: false,
    pawnIOInstalled: false,
  };
  await mockSnapshot(page, snapshot);
  const driverRequests: unknown[] = [];
  await page.route("**/api/sensors/**", async (route) => {
    expect(new URL(route.request().url()).pathname).toBe(
      "/api/sensors/driver/install",
    );
    expect(route.request().method()).toBe("POST");
    driverRequests.push(route.request().postDataJSON());
    await route.fulfill({
      json: { message: "Instalador oficial solicitado (teste)." },
    });
  });
  await page.goto("/");
  await page.getByRole("tab", { name: "Temperatura", exact: true }).click();
  const collector = page.getByRole("region", {
    name: "Coletor de sensores integrado",
  });
  await expect(
    collector.getByText("Leitura limitada", { exact: true }),
  ).toBeVisible();
  await expect(
    collector.getByText(
      "PawnIO não instalado. Leituras de GPU podem continuar disponíveis.",
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Preparar acesso aos sensores" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText(
    "conexão com a internet",
  );
  expect(driverRequests).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(driverRequests).toEqual([]);
  await page
    .getByRole("button", { name: "Preparar acesso aos sensores" })
    .click();
  await page
    .getByRole("button", { name: "Baixar e abrir instalador do PawnIO" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(driverRequests).toEqual([{ confirmed: true }]);
});

test("setores pendentes geram atenção mesmo quando o firmware aprova o SMART", async ({
  page,
}) => {
  const snapshot = liveFixture();
  const disk = snapshot.disks[0];
  disk.name = "Unidade SATA de teste";
  disk.interface = "SATA";
  disk.type = "HDD";
  disk.smart = {
    ...disk.smart!,
    protocol: "ata",
    health: "passed",
    severity: "warning",
    readStatus: "available",
    lifePercent: null,
    lifeSource: null,
    totalWrittenBytes: null,
    counters: { pendingSectors: 3 },
    summary: "Há setores pendentes reportados pelo dispositivo.",
    evidence: [
      {
        code: "ata-pending",
        severity: "warning",
        message:
          "Foram encontrados 3 setores pendentes. Faça backup e acompanhe a evolução.",
      },
    ],
    attributes: [
      {
        id: 197,
        name: "Current_Pending_Sector",
        value: 100,
        worst: 100,
        threshold: 0,
        raw: "3",
      },
    ],
  };
  snapshot.assessment.checks = snapshot.assessment.checks.map((check) =>
    check.name === "Armazenamento"
      ? {
          ...check,
          state: "info",
          detail: "Setores pendentes requerem atenção.",
        }
      : check,
  );
  snapshot.assessment.verified = 2;
  await mockSnapshot(page, snapshot);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Armazenamento merece atenção." }),
  ).toBeVisible();
  await expect(
    page.getByText("Nenhum alerta detectado.", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Armazenamento", exact: true }).click();
  await expect(
    page.getByText("Atenção aos indicadores", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("SMART aprovado pelo dispositivo", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Foram encontrados 3 setores pendentes. Faça backup e acompanhe a evolução.",
    ),
  ).toBeVisible();
  const counter = page
    .locator(".detail-row")
    .filter({ has: page.locator("dt", { hasText: "Setores pendentes" }) });
  await expect(counter.locator("dd")).toHaveText("3");
  await expect(page.locator(".disk-life > strong")).toHaveText("—");
  await expect(
    page.getByText("Sem alertas nas leituras", { exact: true }),
  ).toHaveCount(0);
});

test("falta de permissão preserva temperaturas e saúde como indisponíveis", async ({
  page,
}) => {
  const snapshot = liveFixture();
  snapshot.temperatures = {
    cpu: null,
    cores: [],
    max: null,
    socket: [],
    chipset: null,
    sensors: [],
  };
  snapshot.graphics = snapshot.graphics.map((gpu) => ({
    ...gpu,
    temperature: null,
  }));
  snapshot.hardwareSensors = [];
  snapshot.sensorCollector = {
    state: "unavailable",
    source: "LibreHardwareMonitor integrado",
    diagnostics: [
      "Acesso aos sensores negado. Verifique as permissões de administrador.",
    ],
    isAdministrator: false,
    pawnIOInstalled: true,
  };
  snapshot.storageCollector = {
    state: "partial",
    source: "smartctl integrado",
    diagnostics: [
      "Não foi possível acessar os indicadores desta unidade com as permissões atuais.",
    ],
  };
  snapshot.disks[0].smart = {
    ...snapshot.disks[0].smart!,
    health: "unknown",
    severity: "unknown",
    readStatus: "unavailable",
    summary: "Sem permissão para ler os indicadores desta unidade.",
    lifePercent: null,
    lifeSource: null,
    totalWrittenBytes: null,
    temperature: null,
    powerOnHours: null,
    powerCycles: null,
    counters: {},
    attributes: [],
    evidence: [],
  };
  snapshot.assessment.checks = snapshot.assessment.checks.map((check) =>
    ["Armazenamento", "Temperatura"].includes(check.name)
      ? {
          ...check,
          state: "unknown",
          detail: "Leitura indisponível com as permissões atuais.",
        }
      : check,
  );
  snapshot.assessment.verified = 2;
  snapshot.assessment.unavailable = 3;
  await mockSnapshot(page, snapshot);
  await page.goto("/");
  await expect(
    page
      .locator(".check-list > div")
      .filter({ hasText: "Armazenamento" })
      .locator("small"),
  ).toHaveText("A verificar");
  await page.getByRole("tab", { name: "Temperatura", exact: true }).click();
  const collector = page.getByRole("region", {
    name: "Coletor de sensores integrado",
  });
  await expect(
    collector.getByText("Sem leitura", { exact: true }),
  ).toBeVisible();
  await expect(
    collector.getByText(
      "Acesso aos sensores negado. Verifique as permissões de administrador.",
    ),
  ).toBeVisible();
  await expect(page.locator(".sensor-reading")).toHaveCount(0);
  await page.getByRole("tab", { name: "Armazenamento", exact: true }).click();
  await expect(
    page.getByText("Dados insuficientes", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Sem permissão para ler os indicadores desta unidade."),
  ).toBeVisible();
  await expect(page.locator(".disk-life > strong")).toHaveText("—");
  await expect(
    page.getByText("Sem alertas nas leituras", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("SMART aprovado pelo dispositivo", { exact: true }),
  ).toHaveCount(0);
});
