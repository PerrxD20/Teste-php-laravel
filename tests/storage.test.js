import { test } from "node:test";
import assert from "node:assert/strict";
import { smartSummary, assess } from "../server/health.js";

function ata(attributes, extra = {}) {
  return {
    smart_status: { passed: true },
    device: { protocol: "ATA" },
    ata_smart_attributes: { table: attributes },
    ...extra,
  };
}
function attribute(id, name, raw, extra = {}) {
  return {
    id,
    name,
    value: 100,
    worst: 100,
    thresh: 0,
    raw: { value: raw, string: String(raw) },
    ...extra,
  };
}
function nvme(log, extra = {}) {
  return {
    smart_status: { passed: true },
    device: { protocol: "NVMe" },
    nvme_smart_health_information_log: { critical_warning: 0, ...log },
    ...extra,
  };
}

test("SMART passado com setores pendentes é atenção, não uma unidade certificada saudável", () => {
  const s = smartSummary(ata([attribute(197, "Current_Pending_Sector", 8)]));
  assert.equal(s.health, "passed");
  assert.equal(s.severity, "warning");
  assert.equal(s.counters.pendingSectors, 8);
  assert.equal(s.warnings[0].code, "pending_sectors");
  assert.equal(
    assess({ disks: [{ smart: s }] }).checks.find(
      (c) => c.name === "Armazenamento",
    ).state,
    "info",
  );
});
test("contadores ATA conhecidos distinguem realocação, erro de mídia e comunicação", () => {
  const s = smartSummary(
    ata([
      attribute(5, "Reallocated_Sector_Ct", 2),
      attribute(198, "Offline_Uncorrectable", 1),
      attribute(199, "UDMA_CRC_Error_Count", 27),
    ]),
  );
  assert.equal(s.counters.reallocatedSectors, 2);
  assert.equal(s.counters.offlineUncorrectableSectors, 1);
  assert.equal(s.counters.interfaceCrcErrors, 27);
  assert.match(
    s.evidence.find((e) => e.code === "interface_crc_errors").message,
    /não comprova defeito na mídia/,
  );
  assert.equal(s.severity, "warning");
});
test("identificador ATA reutilizado pelo fabricante não recebe significado inventado", () => {
  const s = smartSummary(ata([attribute(197, "Unknown_Attribute", 24)]));
  assert.equal(s.counters.pendingSectors, null);
  assert.equal(s.severity, "ok");
});
test("atributo de pré-falha abaixo de seu limite faz a avaliação ser crítica", () => {
  const s = smartSummary(
    ata([
      attribute(5, "Reallocated_Sector_Ct", 0, {
        value: 8,
        thresh: 10,
        flags: { prefailure: true },
      }),
    ]),
  );
  assert.equal(s.health, "passed");
  assert.equal(s.severity, "critical");
  assert.equal(assess({ disks: [{ smart: s }] }).critical, 1);
});
test("limite ultrapassado no passado é identificado como histórico", () => {
  const s = smartSummary(
    ata([attribute(1, "Raw_Read_Error_Rate", 0, { when_failed: "past" })]),
  );
  assert.equal(s.severity, "warning");
  assert.match(s.warnings[0].message, /passado/);
});
test("status não zero por falha de acesso não vira disco defeituoso", () => {
  const s = smartSummary({
    smartctl: { exit_status: 2 },
    messages: [{ severity: "error", string: "Access denied" }],
  });
  assert.equal(s.health, "unknown");
  assert.equal(s.readStatus, "unavailable");
  assert.equal(s.severity, "unknown");
  assert.equal(s.warnings.length, 0);
  assert.equal(s.evidence[0].code, "smart_read_error");
});
test("SMART parcial não vira OK porque o estado global pôde ser lido", () => {
  const s = smartSummary({
    smart_status: { passed: true },
    smartctl: { exit_status: 4 },
  });
  assert.equal(s.readStatus, "partial");
  assert.equal(s.severity, "unknown");
  assert.equal(assess({ disks: [{ smart: s }] }).verified, 0);
});
test("bit de falha global no exit status continua crítico mesmo sem smart_status", () => {
  const s = smartSummary({ smartctl: { exit_status: 8 } });
  assert.equal(s.health, "failed");
  assert.equal(s.severity, "critical");
});
test("bit de pré-falha do smartctl não é confundido com falha de acesso", () => {
  const s = smartSummary(ata([], { smartctl: { exit_status: 16 } }));
  assert.equal(s.readStatus, "available");
  assert.equal(s.severity, "critical");
});
test("unidade dormindo preserva o estado indisponível em vez de produzir falha", () => {
  const s = smartSummary({
    smartctl: { exit_status: 2 },
    messages: [{ severity: "info", string: "Device is in STANDBY mode" }],
  });
  assert.equal(s.readStatus, "unavailable");
  assert.equal(s.severity, "unknown");
  assert.equal(s.evidence[0].code, "device_standby");
});
test("NVMe Critical Warning decodifica confiabilidade, somente leitura e backup volátil", () => {
  const s = smartSummary(nvme({ critical_warning: 4 | 8 | 16 }));
  assert.equal(s.severity, "critical");
  for (const code of [
    "nvme_reliability_degraded",
    "nvme_read_only",
    "nvme_volatile_backup_failed",
  ])
    assert.ok(s.evidence.some((e) => e.code === code));
});
test("reserva NVMe é comparada ao limite do próprio dispositivo", () => {
  const s = smartSummary(
    nvme({ available_spare: 5, available_spare_threshold: 10 }),
  );
  assert.equal(s.severity, "warning");
  assert.equal(s.counters.nvmeAvailableSparePercent, 5);
  assert.equal(s.warnings[0].code, "nvme_spare_low");
});
test("erros de mídia NVMe diferem de entradas de log e desligamentos inseguros", () => {
  const historical = smartSummary(
    nvme({ num_err_log_entries: 100, unsafe_shutdowns: 12 }),
  );
  assert.equal(historical.severity, "ok");
  assert.equal(historical.warnings.length, 0);
  assert.equal(historical.evidence.length, 2);
  const media = smartSummary(nvme({ media_errors: 1 }));
  assert.equal(media.severity, "warning");
  assert.ok(media.warnings.some((e) => e.code === "nvme_media_errors"));
});
test("desgaste nominal consumido não é uma previsão de falha nem porcentagem de saúde geral", () => {
  const s = smartSummary(nvme({ percentage_used: 100 }));
  assert.equal(s.lifePercent, 0);
  assert.equal(s.health, "passed");
  assert.equal(s.severity, "warning");
  assert.equal(s.remainingDays, null);
  assert.match(s.lifeSource, /Percentage Used/);
});
test("valores de vida e reserva fora do domínio do protocolo não são normalizados à força", () => {
  const s = smartSummary(nvme({ percentage_used: 999, available_spare: 120 }));
  assert.equal(s.lifePercent, null);
  assert.equal(s.counters.nvmeAvailableSparePercent, null);
});
test("atributo 241 não assume automaticamente unidades de 512 bytes", () => {
  const s = smartSummary(ata([attribute(241, "Total_LBAs_Written", 10000)]));
  assert.equal(s.totalWrittenBytes, null);
  assert.equal(s.writesSource, null);
});
test("ATA Device Statistics usa setores lógicos escritos e tamanho de setor reportado", () => {
  const s = smartSummary(
    ata([], {
      logical_block_size: 4096,
      ata_device_statistics: {
        pages: [
          {
            table: [
              {
                name: "Logical Sectors Written",
                value: 1000,
                flags: { valid: true },
              },
            ],
          },
        ],
      },
    }),
  );
  assert.equal(s.totalWrittenBytes, 4096000);
  assert.match(s.writesSource, /logical_block_size/);
});
test("estatística ATA inválida não produz bytes gravados", () => {
  const s = smartSummary(
    ata([], {
      logical_block_size: 512,
      ata_device_statistics: {
        pages: [
          {
            table: [
              {
                name: "Logical Sectors Written",
                value: 1000,
                flags: { valid: false },
              },
            ],
          },
        ],
      },
    }),
  );
  assert.equal(s.totalWrittenBytes, null);
});
test("contadores grandes preservam valor exato decimal sem arredondar a interface numérica", () => {
  const s = smartSummary(
    nvme({
      data_units_written: 9007199254740992,
      data_units_written_s: "9007199254740993",
    }),
  );
  assert.equal(s.totalWrittenBytes, null);
  assert.equal(
    s.totalWrittenBytesExact,
    (9007199254740993n * 512000n).toString(),
  );
  const impreciseOnly = smartSummary(
    nvme({ data_units_written: 9007199254740992 }),
  );
  assert.equal(impreciseOnly.totalWrittenBytesExact, null);
});
test("horas, ciclos e temperatura usam campos padronizados do log NVMe", () => {
  const s = smartSummary(
    nvme({ power_on_hours: 456, power_cycles: 123, temperature: 35 }),
  );
  assert.equal(s.powerOnHours, 456);
  assert.equal(s.powerCycles, 123);
  assert.equal(s.temperature, 35);
});
test("um autoteste recente aprovado não vira falha atual por um registro antigo", () => {
  const s = smartSummary(
    ata([], {
      smartctl: { exit_status: 128 },
      ata_smart_self_test_log: {
        standard: {
          table: [
            { status: { passed: true, string: "Completed without error" } },
            { status: { passed: false, string: "Completed: read failure" } },
          ],
        },
      },
    }),
  );
  assert.equal(s.severity, "ok");
});
test("último autoteste registrado com falha é apresentado sem executar teste novo", () => {
  const s = smartSummary(
    ata([], {
      ata_smart_self_test_log: {
        standard: {
          table: [
            { status: { passed: false, string: "Completed: read failure" } },
          ],
        },
      },
    }),
  );
  assert.equal(s.severity, "warning");
  assert.match(s.warnings[0].message, /não iniciou um novo/);
});
test("SCSI apresenta defeitos e erros não corrigidos sem inventar percentual", () => {
  const s = smartSummary({
    device: { protocol: "SCSI" },
    smart_status: { passed: true },
    scsi_grown_defect_list: 3,
    scsi_error_counter_log: { read: { total_uncorrected_errors: 2 } },
  });
  assert.equal(s.protocol, "scsi");
  assert.equal(s.severity, "warning");
  assert.equal(s.lifePercent, null);
  assert.equal(s.counters.scsiReadUncorrectedErrors, 2);
});
test("sensores de GPU disponíveis contam como leitura térmica mesmo sem sensor CPU", () => {
  const result = assess({
    temperatures: { cpu: null },
    graphics: [{ temperature: 40 }],
  });
  assert.equal(
    result.checks.find((c) => c.name === "Temperatura").state,
    "info",
  );
});
test("indicador de endurance padronizado em ATA Device Statistics fornece vida nominal restante", () => {
  const s = smartSummary(
    ata([], {
      ata_device_statistics: {
        pages: [
          {
            number: 7,
            table: [
              {
                name: "Percentage Used Endurance Indicator",
                value: 17,
                flags: { valid: true },
              },
            ],
          },
        ],
      },
    }),
  );
  assert.equal(s.lifePercent, 83);
  assert.match(s.lifeSource, /Device Statistics/);
  assert.equal(s.remainingDays, null);
});
