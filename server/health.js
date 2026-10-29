export const knownNumber = (value) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
export function smartSummary(data = {}) {
  const nvme = data.nvme_smart_health_information_log || {};
  const attrs = data.ata_smart_attributes?.table || [];
  const byName = (expression) => attrs.find((a) => expression.test(a.name));
  const remaining = byName(
    /^(SSD_Life_Left|Remaining_Lifetime_Perc|Percent_Lifetime_Remain)$/i,
  );
  const used = knownNumber(nvme.percentage_used);
  const powerOnHours = knownNumber(data.power_on_time?.hours);
  const life =
    used !== null ? Math.max(0, 100 - used) : knownNumber(remaining?.value);
  return {
    model: data.model_name || data.model_family || null,
    serial: data.serial_number || null,
    health:
      data.smart_status?.passed === true
        ? "passed"
        : data.smart_status?.passed === false
          ? "failed"
          : "unknown",
    lifePercent: life !== null && life <= 100 ? life : null,
    // NVMe data units are 1,000 units of 512 bytes (NVMe specification).
    totalWrittenBytes:
      knownNumber(nvme.data_units_written) !== null
        ? nvme.data_units_written * 512000
        : null,
    powerOnHours,
    temperature: knownNumber(data.temperature?.current ?? nvme.temperature),
    powerCycles: knownNumber(data.power_cycle_count),
    remainingDays: null,
    attributes: attrs.map((a) => ({
      id: a.id,
      name: a.name,
      value: a.value,
      worst: a.worst,
      threshold: a.thresh,
      raw: String(a.raw?.string ?? a.raw?.value ?? ""),
    })),
  };
}
export function assess(snapshot) {
  const checks = [
    {
      name: "Processador",
      state: snapshot.cpu?.cores ? "ok" : "unknown",
      detail: snapshot.cpu?.cores
        ? "Processador identificado"
        : "Leitura não disponível",
    },
    {
      name: "Armazenamento",
      state: snapshot.disks?.some((d) => d.smart?.health === "failed")
        ? "critical"
        : snapshot.disks?.length > 0 &&
            snapshot.disks.every((d) => d.smart?.health === "passed")
          ? "ok"
          : "unknown",
      detail: snapshot.disks?.some((d) => d.smart?.health === "failed")
        ? "SMART indica falha; faça backup"
        : snapshot.disks?.length > 0 &&
            snapshot.disks.every((d) => d.smart?.health === "passed")
          ? "Consulte o resultado de cada unidade"
          : "SMART não disponível neste ambiente",
    },
    {
      name: "Memória RAM",
      state: snapshot.memory?.total > 0 ? "info" : "unknown",
      detail:
        snapshot.memory?.total > 0
          ? "Memória identificada; integridade não testada"
          : "Leitura não disponível",
    },
    {
      name: "Drivers",
      state: "unknown",
      detail: "Disponibilidade de atualizações ainda não consultada",
    },
    {
      name: "Temperatura",
      state:
        snapshot.temperatures?.cpu !== null &&
        snapshot.temperatures?.cpu !== undefined
          ? "info"
          : "unknown",
      detail:
        snapshot.temperatures?.cpu !== null &&
        snapshot.temperatures?.cpu !== undefined
          ? "Sensor disponível; limites variam por modelo"
          : "Sensores indisponíveis ou sem permissão",
    },
    {
      name: "Sistema operacional",
      state: snapshot.os?.distro ? "ok" : "unknown",
      detail: snapshot.os?.distro
        ? "Sistema identificado com sucesso"
        : "Leitura não disponível",
    },
  ];
  return {
    checks,
    critical: checks.filter((c) => c.state === "critical").length,
    unavailable: checks.filter((c) => c.state === "unknown").length,
    verified: checks.filter((c) => c.state === "ok").length,
    score: null,
  };
}
