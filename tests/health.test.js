import { test } from "node:test";
import assert from "node:assert/strict";
import { smartSummary, knownNumber, assess } from "../server/health.js";
import { Worker } from "node:worker_threads";

test("ausência de SMART não fabrica saúde, vida útil ou dias restantes", () => {
  const result = smartSummary();
  assert.equal(result.health, "unknown");
  assert.equal(result.lifePercent, null);
  assert.equal(result.totalWrittenBytes, null);
  assert.equal(result.remainingDays, null);
  assert.equal(result.temperature, null);
});
test("NVMe converte desgaste e data units conforme a especificação", () => {
  const result = smartSummary({
    smart_status: { passed: true },
    nvme_smart_health_information_log: {
      percentage_used: 8,
      data_units_written: 1000,
    },
    power_on_time: { hours: 120 },
    temperature: { current: 40 },
  });
  assert.equal(result.lifePercent, 92);
  assert.equal(result.totalWrittenBytes, 512000000);
  assert.equal(result.health, "passed");
  assert.equal(result.powerOnHours, 120);
  assert.equal(result.remainingDays, null);
});
test("desgaste acima de 100% mostra zero de vida nominal, sem valor negativo", () => {
  assert.equal(
    smartSummary({
      nvme_smart_health_information_log: { percentage_used: 108 },
    }).lifePercent,
    0,
  );
});
test("atributo SATA desconhecido não vira percentual de saúde", () => {
  const result = smartSummary({
    ata_smart_attributes: {
      table: [
        { id: 231, name: "Unknown_Attribute", value: 99, raw: { value: 42 } },
      ],
    },
  });
  assert.equal(result.lifePercent, null);
  assert.equal(result.attributes[0].raw, "42");
});
test("vida restante SATA reconhecida é lida; falha SMART é preservada", () => {
  const result = smartSummary({
    smart_status: { passed: false },
    ata_smart_attributes: { table: [{ name: "SSD_Life_Left", value: 31 }] },
  });
  assert.equal(result.lifePercent, 31);
  assert.equal(result.health, "failed");
});
test("indicadores inválidos ou temperaturas indisponíveis são null", () => {
  for (const n of [undefined, null, -1, NaN, Infinity, "42"])
    assert.equal(knownNumber(n), null);
  assert.equal(knownNumber(0), 0);
});
test("inventário de RAM não afirma que a integridade foi testada; sem score arbitrário", () => {
  const result = assess({
    cpu: { cores: 8 },
    memory: { total: 1024 },
    disks: [],
    os: { distro: "macOS" },
    temperatures: { cpu: null },
  });
  assert.equal(
    result.checks.find((c) => c.name === "Memória RAM").state,
    "info",
  );
  assert.equal(
    result.checks.find((c) => c.name === "Drivers").state,
    "unknown",
  );
  assert.equal(result.score, null);
  assert.equal(result.critical, 0);
});
test("falha SMART gera alerta mesmo com outro disco saudável", () => {
  const result = assess({
    disks: [{ smart: { health: "passed" } }, { smart: { health: "failed" } }],
  });
  assert.equal(result.critical, 1);
});
test("worker de memória executa seis padrões e verifica a região alocada", async () => {
  const result = await new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../server/ram-worker.js", import.meta.url),
      { workerData: { bytes: 1024 * 1024 } },
    );
    worker.on("message", (m) => {
      if (m.type === "result") resolve(m.result);
    });
    worker.on("error", reject);
  });
  assert.equal(result.errors, 0);
  assert.equal(result.patterns, 6);
  assert.equal(result.bytes, 1024 * 1024);
  assert.equal(result.scope, "process");
});
test("um disco saudável não mascara outro disco sem leitura", () => {
  const result = assess({
    disks: [{ smart: { health: "passed" } }, { smart: null }],
  });
  assert.equal(
    result.checks.find((c) => c.name === "Armazenamento").state,
    "unknown",
  );
});
