import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { readdir, readFile } from "node:fs/promises";
import si from "systeminformation";
import { smartSummary, assess, knownNumber } from "./health.js";
import { smartctlExecutable } from "./native-tools.js";
import { sensorClient } from "./sensor-client.js";
export const stopNativeCollectors = () => sensorClient.stop();
export const restartNativeCollectors = () => sensorClient.stop();
const exec = promisify(execFile);
export async function command(file, args, timeout = 15000) {
  try {
    return (
      await exec(file, args, {
        timeout,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
      })
    ).stdout;
  } catch (error) {
    if (error.stdout?.trim()) return error.stdout;
    throw error;
  }
}
export async function powershell(script, timeout = 20000) {
  const encoded = Buffer.from(
    "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; " +
      script,
    "utf16le",
  ).toString("base64");
  const result = await command(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
    timeout,
  );
  return JSON.parse(result.replace(/^\uFEFF/, "").trim() || "null");
}
const list = (value) =>
  value == null ? [] : Array.isArray(value) ? value : [value];
export async function drivers() {
  if (process.platform === "win32") {
    const rows = list(
      await powershell(
        "Get-CimInstance Win32_PnPSignedDriver | Select-Object DeviceName,DeviceID,HardWareID,DriverVersion,DriverProviderName,DriverDate,IsSigned,DeviceClass | ConvertTo-Json -Depth 3",
      ),
    );
    return rows
      .filter((d) => d.DeviceName)
      .map((d, i) => ({
        id: d.DeviceID || String(i),
        hardwareIds: list(d.HardWareID).filter(Boolean),
        name: d.DeviceName,
        version: d.DriverVersion || "Não informado",
        provider: d.DriverProviderName || "Não informado",
        date: d.DriverDate || null,
        signed: d.IsSigned ?? null,
        category: d.DeviceClass || "Sistema",
        update: "unknown",
      }));
  }
  if (process.platform === "linux") {
    const modules = await readdir("/sys/module");
    return Promise.all(
      modules.map(async (name) => ({
        id: name,
        name,
        version: await readFile(`/sys/module/${name}/version`, "utf8")
          .then((v) => v.trim())
          .catch(() => `Integrado ao kernel ${os.release()}`),
        provider: "Kernel Linux",
        date: null,
        signed: null,
        category: "Módulo do kernel",
        update: "unknown",
      })),
    );
  }
  if (process.platform === "darwin") {
    const result = JSON.parse(
      await command(
        "system_profiler",
        ["SPExtensionsDataType", "-json"],
        30000,
      ),
    );
    return list(result.SPExtensionsDataType).map((d, i) => ({
      id: d.spext_bundleid || String(i),
      name: d._name || d.spext_bundleid || "Extensão do sistema",
      version: d.version || d.spext_version || "Não informado",
      provider:
        d.spext_developer ||
        (Array.isArray(d.spext_signed_by)
          ? d.spext_signed_by.join(", ")
          : d.spext_signed_by) ||
        "Não informado",
      date: d.spext_lastmodified || null,
      signed: null,
      category: "Extensão macOS",
      update: "unknown",
    }));
  }
  return [];
}
export async function driverUpdates() {
  if (process.platform !== "win32")
    return {
      supported: false,
      updates: [],
      message:
        "A consulta de atualizações de drivers está disponível no Windows. No Linux, use o gerenciador de pacotes; no macOS, use Atualização de Software e o suporte do fabricante.",
    };
  const results = await powershell(
    `$session = New-Object -ComObject Microsoft.Update.Session; $search = $session.CreateUpdateSearcher(); $result = $search.Search("IsInstalled=0 and Type='Driver'"); $items = @(); foreach ($u in $result.Updates) { $items += [PSCustomObject]@{ title=$u.Title; manufacturer=$u.DriverManufacturer; model=$u.DriverModel; hardwareId=$u.DriverHardwareID; date=$u.DriverVerDate } }; [PSCustomObject]@{ resultCode=$result.ResultCode; updates=@($items) } | ConvertTo-Json -Depth 4`,
    90000,
  );
  if (results?.resultCode !== 2)
    throw new Error(
      "O Windows Update não concluiu a consulta. Verifique a conexão e o serviço de atualização.",
    );
  return {
    supported: true,
    updates: list(results.updates),
    message:
      "Consulta concluída no Windows Update. Fabricantes podem disponibilizar versões adicionais; ausência de oferta não certifica a versão mais recente.",
  };
}
async function smartDisks() {
  const executable = await smartctlExecutable();
  try {
    const dbArgs = path.isAbsolute(executable)
      ? ["-B", path.join(path.dirname(executable), "drivedb.h")]
      : [];
    const scan = JSON.parse(
      await command(executable, [...dbArgs, "--scan-open", "-j"]),
    );
    const devices = list(scan.devices).slice(0, 32);
    const results = await Promise.all(
      devices.map(async (device) => {
        try {
          const args = ["-x", "-j", "-n", "standby"];
          if (path.isAbsolute(executable))
            args.unshift(
              "-B",
              path.join(path.dirname(executable), "drivedb.h"),
            );
          if (device.type) args.push("-d", device.type);
          args.push(device.name);
          const raw = JSON.parse(await command(executable, args, 15000));
          return {
            device: device.name,
            ...smartSummary(raw),
            measuredAt: new Date().toISOString(),
            source: "smartctl",
            error:
              raw.messages
                ?.filter((m) => m.severity === "error")
                .map((m) => m.string)
                .join("; ") || null,
          };
        } catch {
          return {
            device: device.name,
            ...smartSummary(),
            measuredAt: new Date().toISOString(),
            source: "smartctl",
            error:
              "Sem acesso SMART. Verifique as permissões ou o controlador.",
          };
        }
      }),
    );
    const diagnostics = list(scan.messages)
      .map((m) => m.string)
      .filter(Boolean);
    if (list(scan.devices).length > 32)
      diagnostics.push("A leitura foi limitada às primeiras 32 unidades.");
    if (!devices.length)
      diagnostics.push(
        "Nenhuma unidade física SMART acessível. Algumas unidades exigem executar o Mello como administrador.",
      );
    return {
      disks: results,
      state: results.some((d) => d.readStatus === "available")
        ? "ok"
        : results.length
          ? "partial"
          : "unavailable",
      source: path.isAbsolute(executable)
        ? "smartmontools incorporado"
        : "smartmontools do sistema",
      diagnostics,
    };
  } catch {
    return {
      disks: [],
      state: "unavailable",
      source: "smartmontools",
      diagnostics: [
        "Não foi possível acessar o coletor SMART. Verifique a instalação e as permissões de acesso aos discos.",
      ],
    };
  }
}
async function wmiSensors() {
  if (process.platform !== "win32") return [];
  try {
    const rows = await powershell(
      `$sensors=$null; foreach($ns in @('root/LibreHardwareMonitor','root/OpenHardwareMonitor')) { try { $sensors=Get-CimInstance -Namespace $ns -ClassName Sensor -ErrorAction Stop | Where-Object SensorType -eq 'Temperature'; if($sensors) { break } } catch {} }; $items=@($sensors | ForEach-Object { [PSCustomObject]@{ name=$_.Name; value=$_.Value; min=$_.Min; max=$_.Max; identifier=$_.Identifier } }); ConvertTo-Json -InputObject $items -Depth 3`,
    );
    return list(rows).filter((r) => knownNumber(r.value) !== null);
  } catch {
    return [];
  }
}
async function nativeSensors() {
  const result = await sensorClient.sample();
  const hardwareSensors = (result.sensors || []).filter(
    (s) => typeof s.value === "number" && Number.isFinite(s.value),
  );
  const temperatures = hardwareSensors.filter(
    (s) => String(s.type).toLowerCase() === "temperature" && s.value >= 0,
  );
  const fallback =
    process.platform === "win32" && temperatures.length === 0
      ? await wmiSensors()
      : [];
  return {
    sensors: temperatures.length ? temperatures : fallback,
    hardwareSensors,
    status: {
      state: temperatures.length
        ? result.state === "partial"
          ? "partial"
          : "ok"
        : fallback.length
          ? "partial"
          : result.state,
      source: temperatures.length
        ? "LibreHardwareMonitorLib incorporada"
        : fallback.length
          ? "WMI (compatibilidade)"
          : "LibreHardwareMonitorLib incorporada",
      diagnostics: result.diagnostics || [],
      isAdministrator: result.capabilities?.elevated,
      pawnIOInstalled: result.capabilities?.pawnIOInstalled,
      pawnIOVersion: result.capabilities?.pawnIOVersion,
      libraryVersion: result.libraryVersion,
    },
  };
}
async function windowsReliability() {
  if (process.platform !== "win32") return [];
  try {
    const rows = await powershell(
      `$items=@(); Get-PhysicalDisk | ForEach-Object { $disk=$_; $r=$null; try { $r=$disk | Get-StorageReliabilityCounter -ErrorAction Stop } catch {}; $items += [PSCustomObject]@{ name=$disk.FriendlyName; serial=$disk.SerialNumber; health=[string]$disk.HealthStatus; wear=$r.Wear; hours=$r.PowerOnHours; temperature=$r.Temperature; written=$r.WriteBytesTotal } }; ConvertTo-Json -InputObject @($items) -Depth 3`,
    );
    return list(rows);
  } catch {
    return [];
  }
}
function coreTemperatures(nativeCores, sensors) {
  if (nativeCores?.some((v) => knownNumber(v) !== null))
    return nativeCores.map(knownNumber);
  return sensors
    .filter(
      (s) =>
        /core #?\d+/i.test(s.name) &&
        (/cpu/i.test(s.hardwareType || "") ||
          /(?:intel|amd)cpu/i.test(s.identifier || "")),
    )
    .map((s) => knownNumber(s.value));
}
async function safe(fn, fallback) {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}
export async function collect(deep = false) {
  const [
    system,
    osInfo,
    cpu,
    memory,
    layout,
    disks,
    volumes,
    graphics,
    network,
    bios,
    board,
    temp,
    load,
    battery,
    usb,
    processes,
    reliability,
    smartResult,
    sensorResult,
  ] = await Promise.all([
    safe(() => si.system(), {}),
    safe(() => si.osInfo(), {}),
    safe(() => si.cpu(), {}),
    safe(() => si.mem(), {}),
    safe(() => si.memLayout(), []),
    safe(() => si.diskLayout(), []),
    safe(() => si.fsSize(), []),
    safe(() => si.graphics(), { controllers: [], displays: [] }),
    safe(() => si.networkInterfaces(), []),
    safe(() => si.bios(), {}),
    safe(() => si.baseboard(), {}),
    safe(() => si.cpuTemperature(), {}),
    safe(() => si.currentLoad(), {}),
    safe(() => si.battery(), {}),
    safe(() => si.usb(), []),
    safe(() => si.processes(), {}),
    deep ? windowsReliability() : [],
    deep
      ? smartDisks()
      : {
          disks: [],
          state: "idle",
          source: "smartmontools incorporado",
          diagnostics: [
            "Execute a varredura completa para ler os discos físicos.",
          ],
        },
    nativeSensors(),
  ]);
  const sensors = sensorResult.sensors;
  const smart = smartResult.disks;
  const diskResults = disks.map((d) => {
    const match = smart.find(
      (s) => (s.serial && s.serial === d.serialNum) || s.device === d.device,
    );
    const native = reliability.find(
      (r) =>
        (r.serial?.trim() &&
          d.serialNum?.trim() &&
          r.serial.trim() === d.serialNum.trim()) ||
        (r.name && d.name && r.name === d.name),
    );
    const base =
      match ||
      (native
        ? {
            ...smartSummary(),
            readStatus: "partial",
            severity: "unknown",
            summary:
              "Indicadores parciais do Windows; a leitura SMART completa não foi confirmada.",
            health:
              native.health === "Healthy"
                ? "passed"
                : native.health === "Unhealthy"
                  ? "failed"
                  : "unknown",
            lifePercent:
              knownNumber(native.wear) !== null && native.wear <= 100
                ? 100 - native.wear
                : null,
            powerOnHours: knownNumber(native.hours),
            temperature: knownNumber(native.temperature),
            totalWrittenBytes: knownNumber(native.written),
            measuredAt: new Date().toISOString(),
            source: "Windows Storage Reliability",
          }
        : null);
    return {
      device: d.device || d.name,
      name: d.name,
      vendor: d.vendor,
      type: d.type,
      interface: d.interfaceType,
      size: d.size,
      serial: d.serialNum || null,
      firmware: d.firmwareRevision || null,
      smartStatus: d.smartStatus || "unknown",
      smart: base,
    };
  });
  // A SMART device can be visible even if the platform's inventory omitted it.
  for (const item of smart)
    if (
      !diskResults.some(
        (d) =>
          d.device === item.device || (item.serial && d.serial === item.serial),
      )
    )
      diskResults.push({
        device: item.device,
        name: item.model || item.device,
        vendor: "",
        type: "",
        interface: "",
        size: 0,
        serial: item.serial,
        firmware: null,
        smartStatus: item.health,
        smart: item,
      });
  const inContainer =
    process.platform === "linux" &&
    (await safe(() => readFile("/proc/1/cgroup", "utf8"), "")).match(
      /docker|containerd|kubepods|lxc/,
    ) !== null;
  const snapshot = {
    collectedAt: new Date().toISOString(),
    mode: "live",
    platform: process.platform,
    scope:
      system.virtual ||
      inContainer ||
      /docker|container/i.test(system.model || "")
        ? "virtual"
        : "host",
    host: {
      name: os.hostname(),
      user: os.userInfo().username,
      uptime: os.uptime(),
      manufacturer: system.manufacturer || null,
      model: system.model || null,
      virtual: !!system.virtual || inContainer,
    },
    os: {
      distro: osInfo.distro,
      release: osInfo.release,
      kernel: osInfo.kernel,
      arch: osInfo.arch,
      build: osInfo.build,
      hostname: osInfo.hostname,
      serial: null,
    },
    cpu: {
      brand: cpu.brand,
      manufacturer: cpu.manufacturer,
      cores: cpu.cores,
      physicalCores: cpu.physicalCores,
      speed: cpu.speed,
      socket: cpu.socket,
      load: knownNumber(load.currentLoad),
      cache: cpu.cache,
    },
    memory: {
      total: memory.total || 0,
      used: memory.active || memory.used || 0,
      available: memory.available || 0,
      swapTotal: memory.swaptotal || 0,
      swapUsed: memory.swapused || 0,
      modules: layout
        .filter((m) => m.bank || m.type || m.manufacturer || m.partNum)
        .map((m) => ({
          bank: m.bank,
          size: m.size,
          type: m.type,
          speed: m.clockSpeed,
          manufacturer: m.manufacturer,
          part: m.partNum,
          formFactor: m.formFactor,
        })),
    },
    disks: diskResults,
    volumes: volumes.map((v) => ({
      fs: v.fs,
      type: v.type,
      mount: v.mount,
      size: v.size,
      used: v.used,
      available: v.available,
      use: v.use,
    })),
    graphics: (graphics.controllers || []).map((g) => ({
      model: g.model,
      vendor: g.vendor,
      vram: g.vram,
      driver: g.driverVersion || null,
      temperature: knownNumber(g.temperatureGpu),
      utilization: knownNumber(g.utilizationGpu),
    })),
    displays: (graphics.displays || []).map((d) => ({
      model: d.model,
      connection: d.connection,
      width: d.currentResX,
      height: d.currentResY,
      refresh: d.currentRefreshRate,
    })),
    network: list(network)
      .filter((n) => !n.internal)
      .map((n) => ({
        name: n.iface,
        model: n.ifaceName,
        ip4: n.ip4,
        ip6: n.ip6,
        mac: n.mac,
        speed: n.speed,
        type: n.type,
        state: n.operstate,
      })),
    bios: {
      vendor: bios.vendor,
      version: bios.version,
      release: bios.releaseDate,
    },
    board: {
      manufacturer: board.manufacturer,
      model: board.model,
      version: board.version,
    },
    storageCollector: {
      state: smartResult.state,
      source: smartResult.source,
      diagnostics: smartResult.diagnostics,
    },
    sensorCollector: sensorResult.status,
    hardwareSensors: sensorResult.hardwareSensors,
    temperatures: {
      cpu:
        knownNumber(temp.main) ??
        knownNumber(
          sensors.find((s) =>
            /cpu package|(?:cpu|core).*tctl|(?:cpu|core).*tdie/i.test(s.name),
          )?.value,
        ),
      cores: coreTemperatures(temp.cores, sensors),
      max: knownNumber(temp.max),
      socket: (temp.socket || []).map(knownNumber),
      chipset: knownNumber(temp.chipset),
      sensors,
    },
    battery: battery.hasBattery
      ? {
          percent: battery.percent,
          cycles: battery.cycleCount,
          charging: battery.isCharging,
          capacity: battery.maxCapacity,
          designed: battery.designedCapacity,
        }
      : null,
    usb: usb.map((u) => ({ name: u.name, vendor: u.vendor, type: u.type })),
    processes: {
      total: processes.all ?? null,
      running: processes.running ?? null,
    },
    capabilities: {
      smart: smart.length > 0 || reliability.length > 0,
      windows: process.platform === "win32",
      nativeRam: process.platform === "win32",
    },
    deep,
  };
  snapshot.assessment = assess(snapshot);
  return snapshot;
}

// Frequent polling refreshes dynamic readings only. SMART and firmware inventory
// are collected on explicit scans, avoiding repeated disk queries every 5 seconds.
export async function refresh(snapshot) {
  const [memory, load, temperature, graphics, sensorResult] = await Promise.all(
    [
      safe(() => si.mem(), null),
      safe(() => si.currentLoad(), null),
      safe(() => si.cpuTemperature(), null),
      safe(() => si.graphics(), null),
      nativeSensors(),
    ],
  );
  const sensors = sensorResult.sensors;
  const next = {
    ...snapshot,
    collectedAt: new Date().toISOString(),
    cpu: { ...snapshot.cpu, load: knownNumber(load?.currentLoad) },
    memory: memory
      ? {
          ...snapshot.memory,
          total: memory.total,
          used: memory.active || memory.used,
          available: memory.available,
          swapTotal: memory.swaptotal,
          swapUsed: memory.swapused,
        }
      : snapshot.memory,
    sensorCollector: sensorResult.status,
    hardwareSensors: sensorResult.hardwareSensors,
    temperatures: {
      cpu:
        knownNumber(temperature?.main) ??
        knownNumber(
          sensors.find((s) =>
            /cpu package|(?:cpu|core).*tctl|(?:cpu|core).*tdie/i.test(s.name),
          )?.value,
        ),
      cores: coreTemperatures(temperature?.cores, sensors),
      max: knownNumber(temperature?.max),
      socket: (temperature?.socket || []).map(knownNumber),
      chipset: knownNumber(temperature?.chipset),
      sensors,
    },
    graphics: graphics
      ? (graphics.controllers || []).map((g) => ({
          model: g.model,
          vendor: g.vendor,
          vram: g.vram,
          driver: g.driverVersion || null,
          temperature: knownNumber(g.temperatureGpu),
          utilization: knownNumber(g.utilizationGpu),
        }))
      : snapshot.graphics,
  };
  next.assessment = assess(next);
  return next;
}
