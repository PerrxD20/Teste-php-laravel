export const knownNumber = (value) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;

// smartctl emits an additional *_s decimal string when a counter cannot be
// represented accurately as a JSON/JavaScript number. Never round such counters.
function exactCounter(object, key) {
  const text = object?.[`${key}_s`];
  if (
    typeof text === "string" &&
    /^\d{1,39}$/.test(text) &&
    BigInt(text) <= (1n << 128n) - 1n
  )
    return BigInt(text);
  const value = object?.[key];
  return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
}
function counter(object, key) {
  const exact = exactCounter(object, key);
  return exact !== null && exact <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(exact)
    : null;
}
const rawCounter = (attribute) => counter(attribute?.raw, "value");
const nonemptyObject = (value) =>
  value && typeof value === "object" && Object.keys(value).length > 0;

export function smartSummary(input = {}) {
  const data = input && typeof input === "object" ? input : {};
  const nvme = data.nvme_smart_health_information_log || {};
  const attrs = Array.isArray(data.ata_smart_attributes?.table)
    ? data.ata_smart_attributes.table.filter((a) => a && typeof a === "object")
    : [];
  const statistics = Array.isArray(data.ata_device_statistics?.pages)
    ? data.ata_device_statistics.pages.flatMap((page) =>
        Array.isArray(page?.table)
          ? page.table.filter((entry) => entry && typeof entry === "object")
          : [],
      )
    : [];
  const byName = (expression) =>
    attrs.find((a) => typeof a.name === "string" && expression.test(a.name));
  const exitStatus = counter(data.smartctl, "exit_status") ?? 0;
  const messages = Array.isArray(data.messages) ? data.messages : [];
  const evidence = [];
  const add = (code, severity, message, value, unit) => {
    if (!evidence.some((item) => item.code === code))
      evidence.push({
        code,
        severity,
        message,
        ...(value !== undefined ? { value } : {}),
        ...(unit ? { unit } : {}),
      });
  };
  const protocol =
    nonemptyObject(nvme) || data.device?.protocol === "NVMe"
      ? "nvme"
      : attrs.length || statistics.length || data.device?.protocol === "ATA"
        ? "ata"
        : data.device?.protocol === "SCSI"
          ? "scsi"
          : null;
  const health =
    data.smart_status?.passed === false || (exitStatus & 8) !== 0
      ? "failed"
      : data.smart_status?.passed === true
        ? "passed"
        : "unknown";
  if (health === "failed")
    add(
      "smart_failed",
      "critical",
      "O dispositivo ou o smartctl reportou falha no estado global SMART. Faça backup e planeje a substituição.",
    );

  const ataEnduranceEntry = statistics.find(
    (entry) =>
      entry?.name === "Percentage Used Endurance Indicator" &&
      entry?.flags?.valid !== false,
  );
  const ataEnduranceCounter = counter(ataEnduranceEntry, "value");
  const ataEnduranceUsed =
    ataEnduranceCounter !== null && ataEnduranceCounter <= 255
      ? ataEnduranceCounter
      : null;
  const remaining = byName(
    /^(SSD_Life_Left|Remaining_Lifetime_Perc|Percent_Lifetime_Remain|Percent_Lifetime_Remaining)$/i,
  );
  const usedCounter = counter(nvme, "percentage_used");
  const percentageUsed =
    usedCounter !== null && usedCounter <= 255 ? usedCounter : null;
  const remainingValue = counter(remaining, "value");
  const enduranceUsed = percentageUsed ?? ataEnduranceUsed;
  const lifePercent =
    enduranceUsed !== null
      ? Math.max(0, 100 - enduranceUsed)
      : remainingValue !== null && remainingValue <= 100
        ? remainingValue
        : null;
  const lifeSource =
    percentageUsed !== null
      ? "NVMe Percentage Used (100 menos desgaste reportado)"
      : ataEnduranceUsed !== null
        ? "ATA Device Statistics Percentage Used Endurance Indicator (100 menos desgaste reportado)"
        : lifePercent !== null
          ? `SMART ATA ${remaining.name} (valor normalizado de vida restante)`
          : null;
  if (enduranceUsed !== null && enduranceUsed >= 100)
    add(
      "nominal_endurance_used",
      "warning",
      "O desgaste reportado atingiu ou excedeu a vida nominal estimada pelo fabricante. Isso não prevê uma data de falha.",
      enduranceUsed,
      "% usado",
    );
  else if (lifePercent === 0)
    add(
      "nominal_endurance_used",
      "warning",
      "O dispositivo reporta zero de vida nominal restante. O indicador não permite estimar dias de funcionamento.",
      lifePercent,
      "% restante",
    );

  const counters = {
    reallocatedSectors: rawCounter(
      byName(
        /^(Reallocated_Sector_Ct|Reallocated_Sector_Count|Reallocated_Sectors_Count)$/i,
      ),
    ),
    pendingSectors: rawCounter(
      byName(
        /^(Current_Pending_Sector|Current_Pending_Sector_Count|Current_Pending_Sectors)$/i,
      ),
    ),
    offlineUncorrectableSectors: rawCounter(
      byName(
        /^(Offline_Uncorrectable|Offline_Uncorrectable_Sector|Offline_Uncorrectable_Sector_Ct|Uncorrectable_Sector_Ct)$/i,
      ),
    ),
    reportedUncorrectableErrors: rawCounter(
      byName(/^(Reported_Uncorrect|Reported_Uncorrectable_Errors)$/i),
    ),
    interfaceCrcErrors: rawCounter(byName(/^UDMA_CRC_Error_Count$/i)),
    nvmeCriticalWarning: (() => {
      const v = counter(nvme, "critical_warning");
      return v !== null && v <= 255 ? v : null;
    })(),
    nvmeAvailableSparePercent: (() => {
      const v = counter(nvme, "available_spare");
      return v !== null && v <= 100 ? v : null;
    })(),
    nvmeSpareThresholdPercent: (() => {
      const v = counter(nvme, "available_spare_threshold");
      return v !== null && v <= 100 ? v : null;
    })(),
    nvmeMediaErrors: counter(nvme, "media_errors"),
    nvmeErrorLogEntries: counter(nvme, "num_err_log_entries"),
    nvmeUnsafeShutdowns: counter(nvme, "unsafe_shutdowns"),
    scsiGrownDefects: counter(data, "scsi_grown_defect_list"),
    scsiReadUncorrectedErrors: counter(
      data.scsi_error_counter_log?.read,
      "total_uncorrected_errors",
    ),
    scsiWriteUncorrectedErrors: counter(
      data.scsi_error_counter_log?.write,
      "total_uncorrected_errors",
    ),
  };
  const ataWarnings = [
    [
      "reallocatedSectors",
      "reallocated_sectors",
      "Foram registrados setores/blocos realocados. Acompanhe a evolução e mantenha backup; o contador isolado não prevê quando o disco falhará.",
    ],
    [
      "pendingSectors",
      "pending_sectors",
      "Há setores pendentes de recuperação ou remapeamento. Faça backup e investigue a unidade.",
    ],
    [
      "offlineUncorrectableSectors",
      "offline_uncorrectable",
      "Foram reportados setores incorrigíveis em verificações offline. Faça backup e investigue a unidade.",
    ],
    [
      "reportedUncorrectableErrors",
      "reported_uncorrectable",
      "Há erros incorrigíveis registrados pelo dispositivo. O contador pode incluir eventos históricos.",
    ],
    [
      "interfaceCrcErrors",
      "interface_crc_errors",
      "Há erros de comunicação registrados. Verifique cabo, porta ou adaptador; esse contador não comprova defeito na mídia e pode permanecer após a correção.",
    ],
  ];
  for (const [key, code, message] of ataWarnings)
    if (counters[key] > 0)
      add(
        code,
        "warning",
        message,
        counters[key],
        "eventos/setores reportados",
      );
  for (const a of attrs) {
    const failingNow = /^(now|failing_now)$/i.test(a.when_failed || "");
    const thresholdExceeded =
      a.flags?.prefailure === true &&
      knownNumber(a.thresh) > 0 &&
      knownNumber(a.value) !== null &&
      a.value <= a.thresh;
    if (failingNow || thresholdExceeded)
      add(
        `ata_threshold_${a.id ?? a.name}`,
        "critical",
        `O atributo SMART ${a.name || a.id} está abaixo do limite de falha reportado pelo dispositivo.`,
        a.value,
        "valor normalizado",
      );
    else if (/^(past|in_the_past)$/i.test(a.when_failed || ""))
      add(
        `ata_past_threshold_${a.id ?? a.name}`,
        "warning",
        `O atributo SMART ${a.name || a.id} registra um limite de falha ultrapassado no passado.`,
        a.value,
        "valor normalizado",
      );
  }
  if (exitStatus & 16)
    add(
      "ata_prefail_exit",
      "critical",
      "O smartctl reportou atributo de pré-falha abaixo do limite do dispositivo.",
    );
  if (exitStatus & 32)
    add(
      "ata_past_prefail_exit",
      "warning",
      "O smartctl reportou atributo de pré-falha que ultrapassou o limite no passado.",
    );

  const criticalWarning = counters.nvmeCriticalWarning;
  if (criticalWarning !== null) {
    const flags = [
      [
        1,
        "nvme_spare_low",
        "warning",
        "O controlador reporta reserva disponível abaixo do limite.",
      ],
      [
        2,
        "nvme_temperature_warning",
        "warning",
        "O controlador NVMe reporta temperatura acima ou abaixo dos seus limites; verifique as condições térmicas.",
      ],
      [
        4,
        "nvme_reliability_degraded",
        "critical",
        "O controlador NVMe reporta confiabilidade da mídia degradada. Faça backup.",
      ],
      [
        8,
        "nvme_read_only",
        "critical",
        "O controlador NVMe reporta que a mídia está em modo somente leitura.",
      ],
      [
        16,
        "nvme_volatile_backup_failed",
        "critical",
        "O controlador NVMe reporta falha no backup da memória volátil.",
      ],
      [
        32,
        "nvme_persistent_memory_warning",
        "critical",
        "O controlador reporta região de memória persistente somente leitura ou não confiável.",
      ],
    ];
    for (const [bit, code, severity, message] of flags)
      if (criticalWarning & bit)
        add(code, severity, message, criticalWarning, "bitmask NVMe");
    if (criticalWarning & ~63)
      add(
        "nvme_unknown_warning_bits",
        "warning",
        "O controlador definiu bits adicionais de Critical Warning. Consulte a documentação do modelo.",
        criticalWarning,
        "bitmask NVMe",
      );
  }
  if (
    counters.nvmeAvailableSparePercent !== null &&
    counters.nvmeSpareThresholdPercent !== null &&
    counters.nvmeAvailableSparePercent < counters.nvmeSpareThresholdPercent
  ) {
    add(
      "nvme_spare_low",
      "warning",
      "A reserva disponível reportada está abaixo do limite do próprio controlador.",
      counters.nvmeAvailableSparePercent,
      "% disponível",
    );
  }
  if (counters.nvmeMediaErrors > 0)
    add(
      "nvme_media_errors",
      "warning",
      "Há erros de integridade de mídia/dados registrados pelo NVMe. Faça backup e acompanhe a evolução; o contador pode incluir eventos históricos.",
      counters.nvmeMediaErrors,
      "erros",
    );
  if (counters.nvmeErrorLogEntries > 0)
    add(
      "nvme_error_log_history",
      "info",
      "O registro NVMe contém eventos, que podem incluir comandos inválidos. Esse total, isoladamente, não comprova falha de mídia.",
      counters.nvmeErrorLogEntries,
      "entradas",
    );
  if (counters.nvmeUnsafeShutdowns > 0)
    add(
      "nvme_unsafe_shutdowns",
      "info",
      "Há desligamentos inseguros registrados. O contador não é uma medida de saúde ou previsão de falha.",
      counters.nvmeUnsafeShutdowns,
      "desligamentos",
    );
  if (counters.scsiGrownDefects > 0)
    add(
      "scsi_grown_defects",
      "warning",
      "A unidade SCSI registra defeitos na lista de crescimento. Acompanhe o contador e mantenha backup.",
      counters.scsiGrownDefects,
      "defeitos",
    );
  for (const [key, code, operation] of [
    ["scsiReadUncorrectedErrors", "scsi_read_uncorrected", "leitura"],
    ["scsiWriteUncorrectedErrors", "scsi_write_uncorrected", "gravação"],
  ]) {
    if (counters[key] > 0)
      add(
        code,
        "warning",
        `Há erros de ${operation} não corrigidos registrados pelo SCSI. O contador pode incluir eventos históricos.`,
        counters[key],
        "erros",
      );
  }
  const errorLogCount = counter(data.ata_smart_error_log?.summary, "count");
  if (errorLogCount > 0 || exitStatus & 64)
    add(
      "ata_error_log_history",
      "info",
      "O histórico ATA contém registros de erros. Consulte o tipo e a data dos eventos antes de atribuir uma falha atual à unidade.",
      errorLogCount ?? undefined,
      "registros",
    );
  const selfTests = data.ata_smart_self_test_log?.standard?.table;
  if (
    Array.isArray(selfTests) &&
    selfTests.length &&
    selfTests[0]?.status?.passed === false
  )
    add(
      "latest_self_test_failed",
      "warning",
      `O último autoteste registrado não passou: ${selfTests[0].status.string || "consulte o registro do dispositivo"}. O aplicativo não iniciou um novo autoteste.`,
    );
  else if (
    exitStatus & 128 &&
    !(Array.isArray(selfTests) && selfTests[0]?.status?.passed === true)
  )
    add(
      "self_test_error_history",
      "warning",
      "O smartctl reportou erro no histórico de autotestes. Consulte a data e o resultado antes de concluir se o problema permanece.",
    );

  // NVMe Data Units Written are standardized units of 1,000 × 512 bytes.
  // ATA attribute 241 has vendor-specific units and is intentionally not guessed.
  let written = exactCounter(nvme, "data_units_written");
  let writesSource =
    written !== null ? "NVMe Data Units Written × 512000 bytes" : null;
  if (written !== null) written *= 512000n;
  else {
    const sectors = statistics.find(
      (entry) =>
        entry?.name === "Logical Sectors Written" &&
        entry?.flags?.valid !== false &&
        entry?.flags?.supported !== false &&
        entry?.flags?.normalized !== true,
    );
    const sectorCount = exactCounter(sectors, "value");
    const blockSize = counter(data, "logical_block_size");
    if (
      sectorCount !== null &&
      blockSize >= 512 &&
      blockSize <= 65536 &&
      Number.isInteger(Math.log2(blockSize))
    ) {
      written = sectorCount * BigInt(blockSize);
      writesSource =
        "ATA Device Statistics Logical Sectors Written × logical_block_size";
    }
  }
  const powerOnHours =
    counter(data.power_on_time, "hours") ??
    counter(nvme, "power_on_hours") ??
    rawCounter(byName(/^Power_On_Hours$/i));
  const powerCycles =
    counter(data, "power_cycle_count") ??
    counter(nvme, "power_cycles") ??
    rawCounter(byName(/^Power_Cycle_Count$/i));
  const hasData =
    health !== "unknown" ||
    attrs.length > 0 ||
    nonemptyObject(nvme) ||
    statistics.length > 0 ||
    powerOnHours !== null;
  const standby = messages.some((m) =>
    /standby|sleep mode|low.power mode/i.test(m?.string || ""),
  );
  const readErrors =
    (exitStatus & 7) !== 0 || messages.some((m) => m?.severity === "error");
  const readStatus = !hasData
    ? "unavailable"
    : readErrors
      ? "partial"
      : "available";
  if (standby && !hasData)
    add(
      "device_standby",
      "info",
      "A unidade está em modo de baixo consumo; a leitura foi adiada para não acordá-la.",
    );
  else if (readErrors)
    add(
      "smart_read_error",
      "info",
      "Não foi possível ler todos os dados SMART. Verifique permissões, suporte do controlador e mensagens do dispositivo; erro de acesso não comprova defeito no disco.",
    );
  const warnings = evidence.filter(
    (item) => item.severity === "warning" || item.severity === "critical",
  );
  const severity = warnings.some((item) => item.severity === "critical")
    ? "critical"
    : warnings.length
      ? "warning"
      : readStatus === "available" && health === "passed"
        ? "ok"
        : "unknown";
  const summary =
    severity === "critical"
      ? "Há indicadores críticos reportados pelo dispositivo. Faça backup."
      : severity === "warning"
        ? "Há indicadores de atenção; consulte as evidências e mantenha backup."
        : readStatus === "unavailable"
          ? "SMART indisponível; não foi possível avaliar a unidade."
          : readStatus === "partial"
            ? "Leitura SMART parcial; a avaliação não está completa."
            : health === "passed"
              ? "SMART sem alertas nos indicadores lidos. Isso não garante ausência de falhas futuras."
              : "Indicadores disponíveis; o estado global SMART não foi reportado.";
  return {
    model: data.model_name || data.model_family || null,
    serial: data.serial_number || null,
    health,
    protocol,
    readStatus,
    severity,
    summary,
    evidence,
    warnings,
    counters,
    lifePercent,
    lifeSource,
    totalWrittenBytes:
      written !== null && written <= BigInt(Number.MAX_SAFE_INTEGER)
        ? Number(written)
        : null,
    totalWrittenBytesExact: written !== null ? written.toString() : null,
    writesSource,
    powerOnHours,
    temperature:
      knownNumber(data.temperature?.current) ?? knownNumber(nvme.temperature),
    powerCycles,
    remainingDays: null,
    attributes: attrs.map((a) => ({
      id: a.id,
      name: a.name,
      value: a.value,
      worst: a.worst,
      threshold: a.thresh,
      raw: String(a.raw?.string ?? a.raw?.value_s ?? a.raw?.value ?? ""),
    })),
  };
}

export function assess(snapshot = {}) {
  const disks = Array.isArray(snapshot.disks) ? snapshot.disks : [];
  const failed = disks.some(
    (d) => d.smart?.health === "failed" || d.smart?.severity === "critical",
  );
  const attention = disks.some((d) => d.smart?.severity === "warning");
  const complete =
    disks.length > 0 &&
    disks.every(
      (d) =>
        d.smart?.health === "passed" &&
        (!d.smart.readStatus || d.smart.readStatus === "available") &&
        (!d.smart.severity || d.smart.severity === "ok"),
    );
  const temperatures = [
    snapshot.temperatures?.cpu,
    ...(snapshot.temperatures?.sensors || []).map((s) => s.value),
    ...(snapshot.graphics || []).map((g) => g.temperature),
    ...disks.map((d) => d.smart?.temperature),
  ];
  const hasTemperature = temperatures.some((t) => knownNumber(t) !== null);
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
      state: failed
        ? "critical"
        : attention
          ? "info"
          : complete
            ? "ok"
            : "unknown",
      detail: failed
        ? "Há indicadores críticos de armazenamento; faça backup"
        : attention
          ? "Há indicadores SMART de atenção; consulte as evidências de cada unidade"
          : complete
            ? "Sem alertas nos indicadores lidos; consulte cada unidade"
            : "SMART ausente ou parcial; avaliação incompleta",
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
      state: hasTemperature ? "info" : "unknown",
      detail: hasTemperature
        ? "Há sensores disponíveis; limites variam por modelo"
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
