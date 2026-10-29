export type Check = {
  name: string;
  state: "ok" | "info" | "unknown" | "critical";
  detail: string;
};
export type CollectorStatus = {
  state: string;
  source: string;
  diagnostics: string[];
  isAdministrator?: boolean;
  pawnIOInstalled?: boolean;
};
export type HardwareSensor = {
  name: string;
  value: number;
  min: number | null;
  max: number | null;
  identifier: string;
  hardware?: string;
  hardwareType?: string;
  type?: string;
  unit?: string;
};
export type SmartEvidence = {
  code: string;
  severity: "ok" | "warning" | "critical" | "unknown" | "info";
  message: string;
  value?: number | string | null;
  unit?: string;
};
export type Smart = {
  measuredAt?: string;
  protocol?: string | null;
  readStatus?: "available" | "partial" | "unavailable";
  severity?: "ok" | "warning" | "critical" | "unknown";
  summary?: string;
  evidence?: SmartEvidence[];
  warnings?: SmartEvidence[];
  counters?: Record<string, number | string | null>;
  lifeSource?: string | null;
  writesSource?: string | null;
  totalWrittenBytesExact?: string | null;
  health: string;
  lifePercent: number | null;
  totalWrittenBytes: number | null;
  powerOnHours: number | null;
  temperature: number | null;
  powerCycles: number | null;
  remainingDays: number | null;
  source?: string;
  error?: string | null;
  attributes: {
    id: number;
    name: string;
    value: number;
    worst: number;
    threshold: number;
    raw: string;
  }[];
};
export type Snapshot = {
  collectedAt: string;
  mode: string;
  platform: string;
  scope: string;
  deep: boolean;
  sensorCollector?: CollectorStatus;
  storageCollector?: CollectorStatus;
  hardwareSensors?: HardwareSensor[];
  host: {
    name: string;
    user: string;
    uptime: number;
    manufacturer: string | null;
    model: string | null;
    virtual: boolean;
  };
  os: {
    distro: string;
    release: string;
    kernel: string;
    arch: string;
    build?: string;
    hostname?: string;
  };
  cpu: {
    brand: string;
    manufacturer: string;
    cores: number;
    physicalCores: number;
    speed: number;
    socket: string;
    load: number | null;
    cache?: Record<string, number>;
  };
  memory: {
    total: number;
    used: number;
    available: number;
    swapTotal: number;
    swapUsed: number;
    modules: {
      bank: string;
      size: number;
      type: string;
      speed: number;
      manufacturer: string;
      part: string;
      formFactor?: string;
    }[];
  };
  disks: {
    device: string;
    name: string;
    vendor: string;
    type: string;
    interface: string;
    size: number;
    serial: string | null;
    firmware: string | null;
    smartStatus: string;
    smart: Smart | null;
  }[];
  volumes: {
    fs: string;
    type: string;
    mount: string;
    size: number;
    used: number;
    available: number;
    use: number;
  }[];
  graphics: {
    model: string;
    vendor: string;
    vram: number;
    driver: string | null;
    temperature: number | null;
    utilization: number | null;
  }[];
  displays: {
    model: string;
    connection: string;
    width: number;
    height: number;
    refresh: number;
  }[];
  network: {
    name: string;
    model: string;
    ip4: string;
    ip6: string;
    mac: string;
    speed: number;
    type: string;
    state: string;
  }[];
  bios: { vendor: string; version: string; release: string };
  board: { manufacturer: string; model: string; version: string };
  temperatures: {
    cpu: number | null;
    cores: (number | null)[];
    max: number | null;
    socket: (number | null)[];
    chipset: number | null;
    sensors?: HardwareSensor[];
  };
  battery: {
    percent: number;
    cycles: number;
    charging: boolean;
    capacity: number;
    designed: number;
  } | null;
  usb: { name: string; vendor: string; type: string }[];
  processes: { total: number | null; running: number | null };
  capabilities: { smart: boolean; windows: boolean; nativeRam: boolean };
  assessment: {
    checks: Check[];
    critical: number;
    unavailable: number;
    verified: number;
    score: number | null;
  };
};
export type Driver = {
  id: string;
  hardwareIds?: string[];
  name: string;
  version: string;
  provider: string;
  date: string | null;
  signed: boolean | null;
  category: string;
  update: string;
};
export type RamJob = {
  state: string;
  progress: number;
  error: string | null;
  result: {
    bytes: number;
    patterns: number;
    errors: number;
    durationMs: number;
    completedAt: string;
    scope: string;
    message: string;
  } | null;
};
export type UpdateJob = {
  state: string;
  error: string | null;
  result: {
    supported: boolean;
    message: string;
    updates: {
      title: string;
      manufacturer: string;
      model: string;
      hardwareId?: string;
    }[];
  } | null;
};
export type Sample = {
  time: string;
  cpu: number | null;
  ram: number;
  temperature: number | null;
};
