import { version as APP_VERSION } from "../package.json";
const isDesktop = navigator.userAgent.includes("Electron/");
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  CircuitBoard,
  Clock3,
  Cpu,
  Database,
  Download,
  Fan,
  FileJson,
  Gauge,
  HardDrive,
  HeartPulse,
  Info,
  Layers3,
  ListChecks,
  LoaderCircle,
  MemoryStick,
  Monitor,
  Network,
  Play,
  Plug,
  Power,
  Radar,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Thermometer,
  TriangleAlert,
  Usb,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import {
  Panel,
  Badge,
  Progress,
  Empty,
  DetailRows,
  IconBox,
  Sparkline,
  bytes,
  value,
  pct,
  duration,
  temp,
} from "./ui";
import type {
  Snapshot,
  Driver,
  Sample,
  RamJob,
  UpdateJob,
  CollectorStatus as CollectorState,
  Smart,
} from "./types";
import { demoSnapshot, demoDrivers } from "./demo";

type Tab = "system" | "storage" | "drivers" | "ram" | "temperature";
const tabs = [
  { id: "system" as Tab, label: "Sistema", icon: Monitor },
  { id: "storage" as Tab, label: "Armazenamento", icon: HardDrive },
  { id: "drivers" as Tab, label: "Drivers", icon: Settings2 },
  { id: "ram" as Tab, label: "Memória RAM", icon: MemoryStick },
  { id: "temperature" as Tab, label: "Temperatura", icon: Thermometer },
];
const headings: Record<Tab, [string, string]> = {
  system: [
    "Seu computador, em detalhes.",
    "Conheça seu hardware. Entenda cada sinal. Cuide do que importa.",
  ],
  storage: [
    "Cada dado, no lugar certo.",
    "Capacidade, integridade e indicadores de vida útil das suas unidades.",
  ],
  drivers: [
    "Conexões que fazem tudo funcionar.",
    "Explore os dispositivos e as versões instaladas no seu sistema.",
  ],
  ram: [
    "Mais espaço para suas ideias.",
    "Acompanhe o uso, conheça seus módulos e verifique a memória.",
  ],
  temperature: [
    "De olho em cada grau.",
    "Monitore os sensores disponíveis e o comportamento térmico do seu PC.",
  ],
};
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    `/api${path}`,
    body !== undefined
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.error || "Não foi possível conectar ao coletor local.",
    );
  return data as T;
}
export default function App() {
  const [tab, setTab] = useState<Tab>("system");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [demo, setDemo] = useState(false);
  const demoRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [auto, setAuto] = useState(true);
  const [intervalSeconds, setIntervalSeconds] = useState(5);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [toast, setToast] = useState<{
    message: string;
    error?: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<
    "settings" | "help" | "report" | "native" | "sensor-driver" | null
  >(null);
  const [sensorBusy, setSensorBusy] = useState(false);
  const [lastDuration, setLastDuration] = useState<number | null>(null);
  const [driverList, setDriverList] = useState<Driver[]>([]);
  const [driverLoading, setDriverLoading] = useState(false);
  const [driverError, setDriverError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [driverCategory, setDriverCategory] = useState("Todas as categorias");
  const [updateJob, setUpdateJob] = useState<UpdateJob>({
    state: "idle",
    result: null,
    error: null,
  });
  const [ramJob, setRamJob] = useState<RamJob>({
    state: "idle",
    progress: 0,
    result: null,
    error: null,
  });
  const [selectedDisk, setSelectedDisk] = useState(0);
  const notice = useCallback(
    (message: string, error = false) => setToast({ message, error }),
    [],
  );
  const apply = useCallback((data: Snapshot) => {
    setSnapshot(data);
    setError(null);
    setSamples((previous) =>
      [
        ...previous,
        {
          time: data.collectedAt,
          cpu: data.cpu.load,
          ram: pct(data.memory.used, data.memory.total),
          temperature: data.temperatures.cpu,
        },
      ].slice(-36),
    );
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    let cancelled = false;
    request<Snapshot>("/snapshot")
      .then((data) => {
        if (!cancelled && !demoRef.current) apply(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apply]);
  useEffect(() => {
    if (!auto || demo || scanning) return;
    let active = true;
    let pending = false;
    const timer = setInterval(async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const data = await request<Snapshot>("/snapshot");
        if (active && !demoRef.current) apply(data);
      } catch {
        if (active)
          setError(
            "A conexão com o coletor foi interrompida. Tentaremos novamente.",
          );
      } finally {
        pending = false;
      }
    }, intervalSeconds * 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [auto, demo, scanning, intervalSeconds, apply]);
  useEffect(() => {
    if (tab !== "drivers" || demo || driverList.length) return;
    let active = true;
    setDriverLoading(true);
    setDriverError(null);
    request<{ drivers: Driver[] }>("/drivers")
      .then((data) => {
        if (active) setDriverList(data.drivers);
      })
      .catch((e) => {
        if (active) setDriverError(e.message);
      })
      .finally(() => {
        if (active) setDriverLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tab, demo, driverList.length]);
  useEffect(() => {
    if (ramJob.state !== "running") return;
    const timer = setInterval(
      () =>
        request<RamJob>("/ram/test")
          .then(setRamJob)
          .catch((e) => {
            setRamJob((j) => ({ ...j, state: "error", error: e.message }));
          }),
      400,
    );
    return () => clearInterval(timer);
  }, [ramJob.state]);
  useEffect(() => {
    if (updateJob.state !== "running") return;
    const timer = setInterval(
      () =>
        request<UpdateJob>("/drivers/check")
          .then(setUpdateJob)
          .catch((e) =>
            setUpdateJob({ state: "error", error: e.message, result: null }),
          ),
      1500,
    );
    return () => clearInterval(timer);
  }, [updateJob.state]);
  async function toggleDemo() {
    const next = !demo;
    demoRef.current = next;
    setDemo(next);
    setSamples([]);
    setDriverList([]);
    setDriverCategory("Todas as categorias");
    setUpdateJob({ state: "idle", result: null, error: null });
    setSelectedDisk(0);
    if (next) {
      apply(demoSnapshot());
      setSamples(
        [
          14, 18, 16, 24, 20, 22, 17, 28, 22, 19, 21, 16, 18, 23, 20, 17, 18,
          18,
        ].map((cpu, i) => ({
          time: new Date(Date.now() - (17 - i) * 5000).toISOString(),
          cpu,
          ram: 38 + (i % 4) * 0.4,
          temperature: 43 + (i % 4),
        })),
      );
      setLoading(false);
      notice("Demonstração ativada. Todos os dados exibidos são ilustrativos.");
    } else {
      setLoading(true);
      setSnapshot(null);
      try {
        apply(await request<Snapshot>("/snapshot"));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }
  }
  async function scan(deep: boolean) {
    if (demo) {
      notice(
        "Saia da demonstração para analisar o computador que executa o coletor.",
      );
      return;
    }
    setScanning(true);
    const start = performance.now();
    try {
      const data = await request<Snapshot>("/scan", { deep });
      if (!demoRef.current) apply(data);
      setLastDuration((performance.now() - start) / 1000);
      notice(
        deep
          ? "Varredura concluída. Consulte os resultados e as leituras indisponíveis."
          : "Informações do sistema atualizadas.",
      );
    } catch (e) {
      notice((e as Error).message, true);
    } finally {
      setScanning(false);
      setLoading(false);
    }
  }
  async function startRam() {
    if (demo) {
      notice("O teste de RAM só pode ser executado no modo de dados reais.");
      return;
    }
    try {
      setRamJob(await request<RamJob>("/ram/test", {}));
    } catch (e) {
      notice((e as Error).message, true);
    }
  }
  async function refreshSensors() {
    if (demo || sensorBusy) return;
    setSensorBusy(true);
    try {
      await request("/sensors/restart", {});
      await scan(false);
    } catch (e) {
      notice((e as Error).message, true);
    } finally {
      setSensorBusy(false);
    }
  }
  async function checkUpdates() {
    if (demo) {
      notice("Saia da demonstração para consultar atualizações reais.");
      return;
    }
    try {
      setUpdateJob(await request<UpdateJob>("/drivers/check", {}));
    } catch (e) {
      notice((e as Error).message, true);
    }
  }
  function downloadReport(format: "json" | "html") {
    if (!snapshot) return;
    const report = {
      app: "Mello PC Diagnostic",
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      demonstration: demo,
      snapshot,
      drivers: demo ? demoDrivers : driverList,
      driverUpdates: updateJob,
      ramTest: demo ? null : ramJob.result,
      thermalHistory: samples,
      notice:
        "As leituras se referem ao computador que executa o coletor. Ausência de alerta não certifica integridade. Este relatório inclui identificadores e endereços do sistema; revise antes de compartilhar.",
    };
    let body = JSON.stringify(report, null, 2);
    if (format === "html") {
      const esc = (s: string) =>
        s
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;");
      body = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Relatório Mello PC Diagnostic</title><style>body{font:15px system-ui;max-width:1050px;margin:50px auto;padding:24px;color:#182532}h1{color:#0e7957}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f2f6f4;padding:24px;border-radius:12px}small{color:#586970}@media print{body{margin:0}pre{font-size:10px}}</style><h1>MELLO PC DIAGNOSTIC</h1><h2>${demo ? "DEMONSTRAÇÃO — " : ""}Relatório de diagnóstico</h2><p>${esc(snapshot.host.name)} · ${new Date().toLocaleString("pt-BR")}</p><p>${esc(report.notice)}</p><p>Use a opção Imprimir do navegador para salvar em PDF.</p><pre>${esc(JSON.stringify(report, null, 2))}</pre></html>`;
    }
    const url = URL.createObjectURL(
      new Blob([body], {
        type:
          format === "json" ? "application/json" : "text/html;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `mello-${demo ? "demonstracao-" : ""}${new Date().toISOString().slice(0, 10)}.${format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setModal(null);
    notice(
      "Relatório exportado. Revise os dados pessoais antes de compartilhar.",
    );
  }
  const ramUse = snapshot
    ? pct(snapshot.memory.used, snapshot.memory.total)
    : 0;
  const activeDrivers = demo ? demoDrivers : driverList;
  const filteredDrivers = activeDrivers.filter(
    (d) =>
      `${d.name} ${d.provider} ${d.version}`
        .toLocaleLowerCase("pt-BR")
        .includes(search.toLocaleLowerCase("pt-BR")) &&
      (driverCategory === "Todas as categorias" ||
        d.category === driverCategory),
  );
  const categories = [...new Set(activeDrivers.map((d) => d.category))];
  const hasStorageWarning = !!snapshot?.disks.some(
    (d) => d.smart?.severity === "warning",
  );
  const storageWarningOnly =
    hasStorageWarning &&
    !snapshot?.disks.some(
      (d) => d.smart?.severity === "critical" || d.smart?.health === "failed",
    );
  const totalAlertCategories =
    snapshot?.assessment.checks.filter(
      (c) =>
        c.state === "critical" ||
        (c.name === "Armazenamento" && hasStorageWarning),
    ).length || 0;
  const integratedTemperatures = snapshot?.temperatures.sensors || [];
  const hasIntegratedCpu = integratedTemperatures.some((s) =>
    /^cpu$/i.test(s.hardwareType || ""),
  );
  const hasIntegratedGpu = integratedTemperatures.some((s) =>
    /^gpu/i.test(s.hardwareType || ""),
  );
  const extraSensors = (snapshot?.hardwareSensors || []).filter(
    (s) => !/^temperature$/i.test(s.type || "") && Number.isFinite(s.value),
  );
  const tempSensors: {
    name: string;
    detail: string;
    value: number;
    icon: typeof Cpu;
    source: string;
    min?: number | null;
    max?: number | null;
  }[] = snapshot
    ? [
        ...(snapshot.temperatures.cpu !== null && !hasIntegratedCpu
          ? [
              {
                name: "Processador",
                detail: snapshot.cpu.brand,
                value: snapshot.temperatures.cpu,
                icon: Cpu,
                source: "Sensor do processador",
              },
            ]
          : []),
        ...snapshot.graphics
          .filter((g) => g.temperature !== null && !hasIntegratedGpu)
          .map((g) => ({
            name: "Placa de vídeo",
            detail: g.model,
            value: g.temperature!,
            icon: Monitor,
            source: "Sensor da GPU",
          })),
        ...snapshot.disks
          .filter((d) => d.smart?.temperature != null)
          .map((d) => ({
            name: "Armazenamento",
            detail: d.name,
            value: d.smart!.temperature!,
            icon: HardDrive,
            source: `${d.smart!.source || "SMART"}${d.smart!.measuredAt ? ` · ${new Date(d.smart!.measuredAt).toLocaleTimeString("pt-BR")}` : ""}`,
          })),
        ...(snapshot.temperatures.chipset !== null
          ? [
              {
                name: "Chipset",
                detail: "Placa-mãe",
                value: snapshot.temperatures.chipset,
                icon: CircuitBoard,
                source: "Sensor do chipset",
              },
            ]
          : []),
        ...(snapshot.temperatures.sensors || []).map((s) => ({
          name: s.name,
          detail: s.hardware || s.identifier,
          value: s.value,
          icon: Thermometer,
          source: snapshot.sensorCollector?.source || "Sensores do sistema",
          min: s.min,
          max: s.max,
        })),
      ]
    : [];

  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("system");
          }}
          aria-label="Mello PC Diagnostic início"
        >
          <span className="brand-symbol">
            <Monitor size={27} strokeWidth={1.7} />
            <span />
          </span>
          <div>
            <span className="brand-name">
              MELLO<span className="brand-divider">/</span>
              <b>PC DIAGNOSTIC</b>
            </span>
            <span className="brand-tagline">HARDWARE INTELLIGENCE</span>
          </div>
        </a>
        <div className="header-actions">
          <span className={`connection ${demo ? "demo" : ""}`}>
            <span className="status-dot" />
            {demo
              ? "Demonstração"
              : error
                ? "Coletor desconectado"
                : "Coletor local"}
          </span>
          <button
            className="icon-button"
            aria-label="Ajuda e informações"
            onClick={() => setModal("help")}
          >
            <CircleHelp size={19} />
          </button>
          <span className="header-separator" />
          <button
            className="icon-button"
            aria-label="Configurações"
            onClick={() => setModal("settings")}
          >
            <SlidersHorizontal size={19} />
          </button>
          <span className="avatar">M</span>
        </div>
      </header>
      <main>
        <div className="page-heading">
          <div>
            <div className="eyebrow">
              <span />
              SEU CENTRO DE DIAGNÓSTICO
            </div>
            <h1>{headings[tab][0]}</h1>
            <p>{headings[tab][1]}</p>
          </div>
          <button
            className={`mode-button ${demo ? "demo-active" : ""}`}
            onClick={toggleDemo}
            disabled={
              scanning ||
              ramJob.state === "running" ||
              updateJob.state === "running"
            }
          >
            <Sparkles size={16} />
            {demo ? "Voltar aos dados reais" : "Explorar demonstração"}
            <ArrowUpRight size={14} />
          </button>
        </div>
        <nav
          className="tabs"
          role="tablist"
          aria-label="Categorias de diagnóstico"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              className={tab === t.id ? "tab active" : "tab"}
              onClick={() => setTab(t.id)}
              tabIndex={tab === t.id ? 0 : -1}
              onKeyDown={(e) => {
                const current = tabs.findIndex((item) => item.id === tab);
                const next =
                  e.key === "ArrowRight"
                    ? (current + 1) % tabs.length
                    : e.key === "ArrowLeft"
                      ? (current - 1 + tabs.length) % tabs.length
                      : e.key === "Home"
                        ? 0
                        : e.key === "End"
                          ? tabs.length - 1
                          : -1;
                if (next >= 0) {
                  e.preventDefault();
                  setTab(tabs[next].id);
                  document.getElementById(`tab-${tabs[next].id}`)?.focus();
                }
              }}
            >
              <t.icon size={19} />
              {t.label}
              {tab === t.id && <span className="tab-dot" />}
            </button>
          ))}
          <span className="tabs-end">
            <ShieldCheck size={14} />
            100% local
          </span>
        </nav>
        {demo && (
          <div className="demo-banner">
            <Sparkles size={16} />
            <strong>Modo demonstração</strong>
            <span>
              Dados ilustrativos para explorar a interface. Nenhum resultado
              representa seu computador.
            </span>
          </div>
        )}
        {error && !demo && (
          <div className="error-banner">
            <TriangleAlert size={17} />
            <span>{error}</span>
            <button onClick={() => scan(false)}>Tentar novamente</button>
          </div>
        )}
        <div className="toolbar">
          <div className="toolbar-actions">
            <button
              className="button primary"
              onClick={() => scan(false)}
              disabled={scanning || demo}
            >
              {scanning ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Play size={15} fill="currentColor" />
              )}
              {scanning ? "Analisando…" : "Iniciar análise"}
            </button>
            <button
              className="button secondary"
              onClick={() => scan(true)}
              disabled={scanning || demo}
            >
              <Radar size={17} />
              <span>Varredura completa</span>
            </button>
            <button
              className="button secondary"
              onClick={() => setModal("report")}
              disabled={!snapshot}
            >
              <ArrowDownToLine size={17} />
              <span>Exportar relatório</span>
            </button>
          </div>
          <div className="last-scan">
            <span className="status-dot" />
            <span>
              {snapshot ? (
                <>
                  Última leitura{" "}
                  <b>
                    {new Date(snapshot.collectedAt).toLocaleTimeString(
                      "pt-BR",
                      { hour: "2-digit", minute: "2-digit", second: "2-digit" },
                    )}
                  </b>
                  {lastDuration !== null && (
                    <small> · {lastDuration.toFixed(1)}s</small>
                  )}
                </>
              ) : (
                "Conectando ao seu sistema…"
              )}
            </span>
          </div>
        </div>
        <div
          id={`panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab}`}
          className="tab-content"
        >
          {loading && !snapshot ? (
            <div className="loading-card">
              <div className="scan-orbit">
                <Monitor size={32} />
              </div>
              <h2>Conhecendo seu sistema</h2>
              <p>Coletando informações de hardware e software…</p>
            </div>
          ) : !snapshot ? (
            <Panel title="Vamos conectar seu computador" icon={Monitor}>
              <Empty title="O coletor local ainda não está disponível">
                Execute o programa no seu computador para ler seu hardware, ou
                explore a demonstração da interface.
              </Empty>
              <button className="button primary" onClick={toggleDemo}>
                <Sparkles size={17} />
                Explorar demonstração
              </button>
            </Panel>
          ) : (
            <>
              {tab === "system" && (
                <>
                  <div className="section-caption">
                    <h2>
                      Visão geral
                      <span className="caption-dot" />{" "}
                      <small>{snapshot.host.name}</small>
                    </h2>
                    <span>
                      <Activity size={13} />
                      {demo
                        ? "Dados ilustrativos"
                        : auto
                          ? `Atualização a cada ${intervalSeconds}s`
                          : "Atualização pausada"}
                    </span>
                  </div>
                  <div className="overview-grid">
                    <Panel
                      title="Informações do sistema"
                      subtitle="A identidade do seu computador"
                      icon={Monitor}
                      className="system-info"
                    >
                      <Badge tone="cyan">{snapshot.os.arch || "—"}</Badge>
                      <DetailRows
                        rows={[
                          [
                            <>
                              <Monitor size={14} />
                              Computador
                            </>,
                            snapshot.host.name,
                          ],
                          [
                            <>
                              <Layers3 size={14} />
                              Sistema operacional
                            </>,
                            `${value(snapshot.os.distro)} ${snapshot.os.release || ""}`,
                          ],
                          [
                            <>
                              <ListChecks size={14} />
                              Versão / Build
                            </>,
                            value(snapshot.os.build || snapshot.os.kernel),
                          ],
                          [
                            <>
                              <Clock3 size={14} />
                              Tempo ligado
                            </>,
                            duration(snapshot.host.uptime),
                          ],
                          [
                            <>
                              <Cpu size={14} />
                              Processador
                            </>,
                            <span>
                              {value(snapshot.cpu.brand)}
                              <small>
                                {snapshot.cpu.physicalCores || "—"} núcleos ·{" "}
                                {snapshot.cpu.cores || "—"} threads ·{" "}
                                {snapshot.cpu.speed > 0
                                  ? `${snapshot.cpu.speed} GHz`
                                  : "Frequência não informada"}
                              </small>
                            </span>,
                          ],
                          [
                            <>
                              <CircuitBoard size={14} />
                              Placa-mãe
                            </>,
                            value(snapshot.board.model),
                          ],
                          [
                            <>
                              <MemoryStick size={14} />
                              Memória RAM
                            </>,
                            <span>
                              {bytes(snapshot.memory.total)}
                              <small>
                                {snapshot.memory.modules.length
                                  ? `${snapshot.memory.modules.length} módulo(s) · ${snapshot.memory.modules[0].type || ""} ${snapshot.memory.modules[0].speed ? `· ${snapshot.memory.modules[0].speed} MHz` : ""}`
                                  : "Detalhes dos módulos indisponíveis"}
                              </small>
                            </span>,
                          ],
                          [
                            <>
                              <Monitor size={14} />
                              Placa de vídeo
                            </>,
                            snapshot.graphics.length
                              ? snapshot.graphics.map((g) => g.model).join(", ")
                              : "Não identificada",
                          ],
                          [
                            <>
                              <Network size={14} />
                              Conexão de rede
                            </>,
                            <span>
                              {snapshot.network[0]?.model ||
                                snapshot.network[0]?.name ||
                                "Não disponível"}
                              <small>{snapshot.network[0]?.ip4 || ""}</small>
                            </span>,
                          ],
                        ]}
                      />
                    </Panel>
                    <div className="overview-center">
                      <section
                        className={`status-panel ${snapshot.assessment.critical ? "has-critical" : hasStorageWarning ? "has-warning" : ""}`}
                      >
                        <div className="status-top">
                          <span>
                            <ShieldCheck size={16} />
                            STATUS DO SISTEMA
                          </span>
                          <Badge
                            tone={
                              snapshot.assessment.critical
                                ? "red"
                                : hasStorageWarning
                                  ? "amber"
                                  : "green"
                            }
                          >
                            {totalAlertCategories
                              ? "Alerta detectado"
                              : "Leitura concluída"}
                          </Badge>
                        </div>
                        <div className="status-main">
                          <div>
                            <h2>
                              {snapshot.assessment.critical
                                ? "Atenção necessária"
                                : hasStorageWarning
                                  ? "Armazenamento merece atenção."
                                  : snapshot.assessment.unavailable > 1
                                    ? "Seu sistema, mais claro."
                                    : "Nenhum alerta detectado."}
                            </h2>
                            <p>
                              {snapshot.assessment.critical
                                ? "Há indicadores de falha no armazenamento. Faça backup dos seus arquivos."
                                : hasStorageWarning
                                  ? "Há indicadores de atenção nas unidades. Consulte os detalhes e mantenha um backup atualizado."
                                  : "Uma visão dos indicadores disponíveis. Saúde completa exige testes específicos."}
                            </p>
                          </div>
                          <div className="status-orb">
                            <svg viewBox="0 0 110 110" aria-hidden="true">
                              <circle cx="55" cy="55" r="45" />
                              <circle
                                className="orb-fill"
                                cx="55"
                                cy="55"
                                r="45"
                                strokeDasharray={`${(snapshot.assessment.verified / 6) * 283} 283`}
                              />
                            </svg>
                            <span>
                              <CheckCheck size={32} />
                              <small>
                                {snapshot.assessment.verified}/6 leituras OK
                              </small>
                            </span>
                          </div>
                        </div>
                        <div className="status-bottom">
                          <span className="status-dot" />
                          Diagnóstico transparente. Sem estimativas inventadas.
                        </div>
                      </section>
                      <div className="mini-stats">
                        <Metric
                          icon={Cpu}
                          label="CPU"
                          number={
                            snapshot.cpu.load === null
                              ? "—"
                              : `${Math.round(snapshot.cpu.load)}%`
                          }
                          amount={snapshot.cpu.load || 0}
                          detail="Uso atual"
                        />
                        <Metric
                          icon={MemoryStick}
                          label="RAM"
                          number={`${Math.round(ramUse)}%`}
                          amount={ramUse}
                          detail={`${bytes(snapshot.memory.used)} em uso`}
                          tone="cyan"
                        />
                        <Metric
                          icon={HardDrive}
                          label="Disco"
                          number={
                            snapshot.volumes[0]
                              ? `${Math.round(snapshot.volumes[0].use)}%`
                              : "—"
                          }
                          amount={snapshot.volumes[0]?.use || 0}
                          detail="Espaço utilizado"
                          tone="purple"
                        />
                      </div>
                      <Panel
                        title="Atividade do processador"
                        action={
                          <span className="chart-value">
                            {snapshot.cpu.load === null
                              ? "—"
                              : `${Math.round(snapshot.cpu.load)}%`}
                            <span> agora</span>
                          </span>
                        }
                        className="activity-panel"
                      >
                        <Sparkline
                          points={samples.map((s) => s.cpu)}
                          height={75}
                        />
                        <div className="chart-labels">
                          <span>
                            {samples.length > 1
                              ? new Date(samples[0].time).toLocaleTimeString(
                                  "pt-BR",
                                )
                              : "Início da sessão"}
                          </span>
                          <span>Agora</span>
                        </div>
                      </Panel>
                    </div>
                    <div className="overview-right">
                      <Panel
                        title="Saúde do sistema"
                        subtitle="O que foi possível verificar"
                        icon={HeartPulse}
                        className="health-panel"
                      >
                        <div className="health-total">
                          <strong>
                            {snapshot.assessment.verified
                              .toString()
                              .padStart(2, "0")}
                          </strong>
                          <span>
                            leituras confirmadas
                            <small>
                              de {snapshot.assessment.checks.length} categorias
                            </small>
                          </span>
                          <Badge tone="green">AO VIVO</Badge>
                        </div>
                        <div className="health-segments">
                          {snapshot.assessment.checks.map((c, i) => (
                            <span
                              key={i}
                              className={
                                c.name === "Armazenamento" && storageWarningOnly
                                  ? "warning"
                                  : c.state
                              }
                              title={`${c.name}: ${c.detail}`}
                            />
                          ))}
                        </div>
                        <div className="check-list">
                          {snapshot.assessment.checks.map((c) => (
                            <div key={c.name} title={c.detail}>
                              <span
                                className={`check-icon ${c.name === "Armazenamento" && storageWarningOnly ? "warning" : c.state}`}
                              >
                                {c.state === "ok" ? (
                                  <Check size={12} />
                                ) : c.state === "critical" ||
                                  (c.name === "Armazenamento" &&
                                    storageWarningOnly) ? (
                                  <TriangleAlert size={12} />
                                ) : (
                                  <Info size={12} />
                                )}
                              </span>
                              <span>{c.name}</span>
                              <small
                                className={
                                  c.name === "Armazenamento" &&
                                  storageWarningOnly
                                    ? "warning"
                                    : c.state
                                }
                              >
                                {c.name === "Armazenamento" &&
                                storageWarningOnly
                                  ? "Atenção"
                                  : c.state === "ok"
                                    ? "OK"
                                    : c.state === "critical"
                                      ? "Alerta"
                                      : c.state === "info"
                                        ? "Identificado"
                                        : "A verificar"}
                              </small>
                            </div>
                          ))}
                        </div>
                        <div className="panel-footnote">
                          <Info size={13} />
                          Ausência de alerta não certifica integridade.
                        </div>
                      </Panel>
                      <div className="quick-summary">
                        <span>
                          <TriangleAlert size={17} />
                          Alertas nas leituras
                        </span>
                        <strong
                          className={
                            snapshot.assessment.critical ? "red-text" : ""
                          }
                        >
                          {totalAlertCategories.toString().padStart(2, "0")}
                        </strong>
                        <span className="summary-divider" />
                        <span>Sem leitura</span>
                        <strong className="muted-text">
                          {snapshot.assessment.unavailable
                            .toString()
                            .padStart(2, "0")}
                        </strong>
                      </div>
                    </div>
                  </div>
                  <div className="shortcut-grid">
                    <Shortcut
                      icon={HardDrive}
                      title="Armazenamento"
                      subtitle={snapshot.disks[0]?.name || "Unidades e volumes"}
                      onClick={() => setTab("storage")}
                    >
                      <div className="shortcut-data">
                        <span>Espaço utilizado</span>
                        <b>
                          {snapshot.volumes[0]
                            ? `${Math.round(snapshot.volumes[0].use)}%`
                            : "—"}
                        </b>
                      </div>
                      <Progress
                        value={snapshot.volumes[0]?.use || 0}
                        tone="green"
                      />
                    </Shortcut>
                    <Shortcut
                      icon={Settings2}
                      title="Drivers"
                      subtitle="Dispositivos e versões instaladas"
                      onClick={() => setTab("drivers")}
                    >
                      <div className="shortcut-bottom">
                        <Badge tone="purple">
                          <Settings2 size={11} />
                          Inventário do sistema
                        </Badge>
                        <span>
                          Ver detalhes
                          <ArrowRight size={13} />
                        </span>
                      </div>
                    </Shortcut>
                    <Shortcut
                      icon={MemoryStick}
                      title="Memória RAM"
                      subtitle={`${bytes(snapshot.memory.total)} de memória física`}
                      onClick={() => setTab("ram")}
                    >
                      <div className="shortcut-data">
                        <span>{bytes(snapshot.memory.used)} em uso</span>
                        <b>{Math.round(ramUse)}%</b>
                      </div>
                      <Progress value={ramUse} tone="cyan" />
                    </Shortcut>
                    <Shortcut
                      icon={Thermometer}
                      title="Temperatura"
                      subtitle="Sensores dos seus componentes"
                      onClick={() => setTab("temperature")}
                    >
                      <div className="temperature-inline">
                        <span>
                          CPU <b>{temp(snapshot.temperatures.cpu)}</b>
                        </span>
                        <span>
                          GPU <b>{temp(snapshot.graphics[0]?.temperature)}</b>
                        </span>
                        <span>
                          SSD{" "}
                          <b>{temp(snapshot.disks[0]?.smart?.temperature)}</b>
                        </span>
                      </div>
                    </Shortcut>
                  </div>
                  {snapshot.battery && (
                    <Panel
                      title="Bateria"
                      subtitle="Indicadores reportados pelo sistema"
                      icon={Zap}
                    >
                      <DetailRows
                        rows={[
                          ["Carga atual", `${snapshot.battery.percent}%`],
                          [
                            "Estado",
                            snapshot.battery.charging
                              ? "Carregando"
                              : "Em descarga",
                          ],
                          ["Ciclos reportados", value(snapshot.battery.cycles)],
                          [
                            "Capacidade atual / original",
                            snapshot.battery.capacity > 0 &&
                            snapshot.battery.designed > 0
                              ? `${Math.round((snapshot.battery.capacity / snapshot.battery.designed) * 100)}% da capacidade de projeto`
                              : "Não disponível",
                          ],
                        ]}
                      />
                    </Panel>
                  )}
                  <div className="bottom-grid">
                    <Panel
                      title="Mais sobre seu sistema"
                      subtitle="Informações complementares de hardware e conectividade"
                      icon={CircuitBoard}
                    >
                      <DetailRows
                        rows={[
                          [
                            "Fabricante / Modelo",
                            `${value(snapshot.host.manufacturer)} · ${value(snapshot.host.model)}`,
                          ],
                          [
                            "BIOS / Firmware",
                            `${value(snapshot.bios.vendor)} ${snapshot.bios.version || ""}`,
                          ],
                          ["Data do firmware", value(snapshot.bios.release)],
                          [
                            "Processos",
                            snapshot.processes.total === null
                              ? "Não disponível"
                              : `${snapshot.processes.total} identificados · ${snapshot.processes.running ?? "—"} em execução`,
                          ],
                          [
                            "Dispositivos USB",
                            `${snapshot.usb.length} identificado(s)`,
                          ],
                          ["Usuário da sessão", snapshot.host.user],
                        ]}
                      />
                    </Panel>
                    <Panel
                      title="Rede e periféricos"
                      subtitle="Dispositivos identificados pelo sistema"
                      icon={Plug}
                    >
                      <details open>
                        <summary>
                          <Wifi size={15} />
                          Interfaces de rede{" "}
                          <Badge>{snapshot.network.length}</Badge>
                          <ChevronDown size={15} />
                        </summary>
                        {snapshot.network.length ? (
                          snapshot.network.map((n) => (
                            <DetailRows
                              key={n.name}
                              rows={[
                                [
                                  n.name,
                                  `${n.ip4 || n.ip6 || "Sem endereço"} · ${n.state}`,
                                ],
                                ["Endereço MAC", value(n.mac)],
                                [
                                  "Velocidade nominal",
                                  n.speed > 0
                                    ? `${n.speed} Mbps`
                                    : "Não informada",
                                ],
                              ]}
                            />
                          ))
                        ) : (
                          <p className="muted-text">
                            Nenhuma interface reportada.
                          </p>
                        )}
                      </details>
                      <details>
                        <summary>
                          <Usb size={15} />
                          Dispositivos USB<Badge>{snapshot.usb.length}</Badge>
                          <ChevronDown size={15} />
                        </summary>
                        {snapshot.usb.map((u, i) => (
                          <DetailRows
                            key={i}
                            rows={[
                              [
                                u.name || "Dispositivo",
                                u.vendor || u.type || "—",
                              ],
                            ]}
                          />
                        ))}
                      </details>
                      <details>
                        <summary>
                          <Monitor size={15} />
                          Monitores<Badge>{snapshot.displays.length}</Badge>
                          <ChevronDown size={15} />
                        </summary>
                        {snapshot.displays.map((d, i) => (
                          <DetailRows
                            key={i}
                            rows={[
                              [
                                d.model || "Monitor",
                                `${d.width} × ${d.height} · ${d.refresh || "—"} Hz`,
                              ],
                              ["Conexão", value(d.connection)],
                            ]}
                          />
                        ))}
                      </details>
                    </Panel>
                  </div>
                </>
              )}
              {tab === "storage" && (
                <>
                  <div className="section-caption">
                    <h2>
                      Armazenamento
                      <small>
                        {snapshot.disks.length} unidade(s) física(s)
                      </small>
                    </h2>
                    <Badge tone="cyan">
                      {snapshot.deep
                        ? "Varredura completa realizada"
                        : "Execute a varredura para consultar SMART"}
                    </Badge>
                  </div>
                  {!demo && snapshot.storageCollector && (
                    <CollectorStatus
                      title="Leitura de armazenamento"
                      status={snapshot.storageCollector}
                      icon={HardDrive}
                    />
                  )}
                  <div className="storage-layout">
                    <div className="disk-sidebar">
                      {snapshot.disks.map((d, i) => (
                        <button
                          key={d.device}
                          className={`disk-selector ${selectedDisk === i ? "selected" : ""}`}
                          onClick={() => setSelectedDisk(i)}
                        >
                          <IconBox icon={HardDrive} />
                          <span>
                            <b>{d.name || "Unidade"}</b>
                            <small>
                              {bytes(d.size)} ·{" "}
                              {d.interface || d.type || "Disco"}
                            </small>
                          </span>
                          <ChevronDown size={14} />
                        </button>
                      ))}
                      <Panel title="Volumes e partições" icon={Database}>
                        {snapshot.volumes.length ? (
                          snapshot.volumes.map((v, i) => (
                            <div className="volume" key={i}>
                              <div>
                                <b>{v.mount || v.fs}</b>
                                <Badge>{v.type}</Badge>
                              </div>
                              <Progress
                                value={v.use}
                                tone={v.use > 90 ? "amber" : "cyan"}
                              />
                              <p>
                                {bytes(v.used)} usados de {bytes(v.size)}
                                <span>{Math.round(v.use)}%</span>
                              </p>
                              <small>{bytes(v.available)} disponíveis</small>
                            </div>
                          ))
                        ) : (
                          <Empty title="Volumes não acessíveis">
                            O sistema não reportou volumes montados.
                          </Empty>
                        )}
                      </Panel>
                    </div>
                    <div className="disk-main">
                      {snapshot.disks[selectedDisk] ? (
                        <DiskDetail
                          disk={snapshot.disks[selectedDisk]}
                          scan={() => scan(true)}
                          scanning={scanning || demo}
                        />
                      ) : (
                        <Panel title="Unidades físicas" icon={HardDrive}>
                          <Empty title="Inventário físico indisponível">
                            Máquinas virtuais, contêineres e alguns
                            controladores não expõem discos físicos. Os volumes
                            acessíveis aparecem ao lado. Execute o programa no
                            seu computador para consultar seu hardware.
                          </Empty>
                        </Panel>
                      )}
                      <div className="info-callout">
                        <Info size={19} />
                        <div>
                          <strong>
                            Vida útil não é uma contagem regressiva.
                          </strong>
                          <p>
                            A porcentagem é exibida somente quando o dispositivo
                            fornece um indicador de desgaste reconhecido. SMART
                            não permite prever com segurança quantos dias um
                            disco ainda vai durar. Mantenha seus backups em dia.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
              {tab === "drivers" && (
                <>
                  <div className="stat-grid four">
                    <Stat
                      icon={Settings2}
                      label="Dispositivos listados"
                      number={String(activeDrivers.length)}
                      detail="Inventário disponível"
                    />
                    <Stat
                      icon={ShieldCheck}
                      label="Assinaturas reportadas"
                      number={String(
                        activeDrivers.filter((d) => d.signed === true).length,
                      )}
                      detail="Assinatura informada pelo Windows"
                      tone="cyan"
                    />
                    <Stat
                      icon={Download}
                      label="Ofertas de atualização"
                      number={
                        updateJob.state === "done" &&
                        updateJob.result?.supported
                          ? String(updateJob.result.updates.length)
                          : "—"
                      }
                      detail="Fonte: Windows Update"
                      tone="purple"
                    />
                    <Stat
                      icon={CircleHelp}
                      label="Estado das versões"
                      number="A verificar"
                      detail="Sem comparação por data de instalação"
                      tone="amber"
                    />
                  </div>
                  <Panel
                    title="Drivers e dispositivos"
                    subtitle={
                      snapshot.platform === "darwin"
                        ? "Extensões reportadas pelo macOS; muitos drivers são integrados ao sistema"
                        : snapshot.platform === "linux"
                          ? "Módulos do kernel Linux; atualizados pelo gerenciador da distribuição"
                          : "Versões e fornecedores reportados pelo Windows"
                    }
                    icon={Settings2}
                    action={
                      <button
                        className="button secondary small"
                        disabled={
                          updateJob.state === "running" ||
                          demo ||
                          snapshot.platform !== "win32"
                        }
                        onClick={checkUpdates}
                      >
                        {updateJob.state === "running" ? (
                          <LoaderCircle className="spin" size={15} />
                        ) : (
                          <RefreshCw size={15} />
                        )}
                        Consultar atualizações
                      </button>
                    }
                  >
                    <div className="table-toolbar">
                      <label className="search-field">
                        <Search size={17} />
                        <input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Buscar dispositivo, fabricante ou versão…"
                          aria-label="Buscar drivers"
                        />
                      </label>
                      <label className="select-field">
                        <SlidersHorizontal size={15} />
                        <select
                          value={driverCategory}
                          onChange={(e) => setDriverCategory(e.target.value)}
                          aria-label="Filtrar categoria"
                        >
                          <option>Todas as categorias</option>
                          {categories.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {driverLoading ? (
                      <div className="inline-loading">
                        <LoaderCircle size={20} className="spin" />
                        Lendo os dispositivos do sistema…
                      </div>
                    ) : driverError ? (
                      <Empty title="Não foi possível ler os drivers">
                        {driverError}
                      </Empty>
                    ) : (
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>DISPOSITIVO</th>
                              <th>VERSÃO INSTALADA</th>
                              <th>FORNECEDOR</th>
                              <th>ASSINATURA</th>
                              <th>ATUALIZAÇÃO</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredDrivers.slice(0, 300).map((d) => {
                              const offered = updateJob.result?.updates.some(
                                (u) =>
                                  u.hardwareId &&
                                  [d.id, ...(d.hardwareIds || [])].some(
                                    (id) =>
                                      id.toLowerCase() ===
                                      u.hardwareId!.toLowerCase(),
                                  ),
                              );
                              return (
                                <tr key={d.id}>
                                  <td>
                                    <span className="device-cell">
                                      <IconBox
                                        icon={
                                          d.category
                                            .toLowerCase()
                                            .includes("net")
                                            ? Network
                                            : d.category
                                                  .toLowerCase()
                                                  .includes("display") ||
                                                d.category === "Vídeo"
                                              ? Monitor
                                              : Settings2
                                        }
                                        tone="cyan"
                                      />
                                      <span>
                                        <b>{d.name}</b>
                                        <small>{d.category}</small>
                                      </span>
                                    </span>
                                  </td>
                                  <td className="mono">{d.version}</td>
                                  <td>{d.provider}</td>
                                  <td>
                                    {d.signed === true ? (
                                      <Badge tone="green">
                                        <Check size={11} />
                                        Assinado
                                      </Badge>
                                    ) : d.signed === false ? (
                                      <Badge tone="amber">Não assinado</Badge>
                                    ) : (
                                      <span className="muted-text">
                                        Não informada
                                      </span>
                                    )}
                                  </td>
                                  <td>
                                    <Badge tone={offered ? "amber" : "muted"}>
                                      {offered
                                        ? "Oferta disponível"
                                        : updateJob.state === "done" &&
                                            updateJob.result?.supported
                                          ? "Sem oferta no Windows Update"
                                          : "Não confirmada"}
                                    </Badge>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {!filteredDrivers.length && (
                          <Empty title="Nenhum dispositivo encontrado">
                            Tente outra busca ou categoria. A disponibilidade do
                            inventário depende do sistema operacional.
                          </Empty>
                        )}
                      </div>
                    )}
                    <div className="table-footer">
                      <span>
                        {Math.min(filteredDrivers.length, 300)} de{" "}
                        {activeDrivers.length} dispositivos
                      </span>
                      <span>
                        <ShieldCheck size={13} />
                        Nenhum driver é instalado automaticamente
                      </span>
                    </div>
                  </Panel>
                  {updateJob.state === "running" && (
                    <div className="info-callout">
                      <LoaderCircle className="spin" size={18} />
                      <div>
                        <strong>Consultando o Windows Update</strong>
                        <p>
                          A consulta pode levar até 90 segundos e não instala
                          atualizações.
                        </p>
                      </div>
                    </div>
                  )}
                  {updateJob.error && (
                    <div className="error-banner">
                      <TriangleAlert size={17} />
                      {updateJob.error}
                    </div>
                  )}
                  {updateJob.result && (
                    <Panel title="Resultado da consulta" icon={Download}>
                      <p className="body-copy">{updateJob.result.message}</p>
                      {updateJob.result.updates.map((u, i) => (
                        <DetailRows
                          key={i}
                          rows={[
                            [
                              u.title,
                              u.manufacturer ||
                                u.model ||
                                "Oferta do Windows Update",
                            ],
                          ]}
                        />
                      ))}
                    </Panel>
                  )}
                  <div className="info-callout">
                    <Info size={19} />
                    <div>
                      <strong>
                        {snapshot.platform === "darwin"
                          ? "No macOS, drivers geralmente acompanham o sistema."
                          : "Uma versão instalada não prova que o driver está atualizado."}
                      </strong>
                      <p>
                        {snapshot.platform === "darwin"
                          ? "Use Ajustes do Sistema → Geral → Atualização de Software para atualizar drivers integrados. Extensões de terceiros devem ser verificadas com o fabricante. A lista pode variar entre versões do macOS."
                          : "O Mello mantém o status como não confirmado até obter uma oferta correspondente. O Windows Update não inclui necessariamente todas as versões dos fabricantes."}
                      </p>
                    </div>
                  </div>
                </>
              )}
              {tab === "ram" && (
                <>
                  <div className="stat-grid four">
                    <Stat
                      icon={MemoryStick}
                      label="Memória física"
                      number={bytes(snapshot.memory.total)}
                      detail={`${snapshot.memory.modules.length} módulo(s) identificado(s)`}
                    />
                    <Stat
                      icon={Activity}
                      label="Em uso"
                      number={bytes(snapshot.memory.used)}
                      detail={`${ramUse.toFixed(1)}% da memória total`}
                      tone="cyan"
                    />
                    <Stat
                      icon={Layers3}
                      label="Disponível"
                      number={bytes(snapshot.memory.available)}
                      detail="Disponível para novas tarefas"
                      tone="purple"
                    />
                    <Stat
                      icon={Gauge}
                      label="Velocidade reportada"
                      number={
                        snapshot.memory.modules[0]?.speed
                          ? `${snapshot.memory.modules[0].speed} MHz`
                          : "—"
                      }
                      detail={
                        snapshot.memory.modules[0]?.type ||
                        "Dados dos módulos indisponíveis"
                      }
                      tone="amber"
                    />
                  </div>
                  <div className="bottom-grid">
                    <Panel
                      title="Uso de memória"
                      subtitle="Leituras coletadas nesta sessão"
                      icon={Activity}
                      action={
                        <Badge tone="cyan">{Math.round(ramUse)}% em uso</Badge>
                      }
                    >
                      <Sparkline
                        points={samples.map((s) => s.ram)}
                        color="#49cde5"
                        height={170}
                        label="Histórico de uso de memória RAM"
                      />
                      <div className="memory-legend">
                        <span>
                          <i />
                          Em uso <b>{bytes(snapshot.memory.used)}</b>
                        </span>
                        <span>
                          <i />
                          Disponível <b>{bytes(snapshot.memory.available)}</b>
                        </span>
                      </div>
                      <DetailRows
                        rows={[
                          [
                            "Memória swap / virtual",
                            bytes(snapshot.memory.swapTotal),
                          ],
                          ["Swap em uso", bytes(snapshot.memory.swapUsed)],
                        ]}
                      />
                    </Panel>
                    <Panel
                      title="Verificação de memória"
                      subtitle="Um primeiro olhar sobre a integridade"
                      icon={ShieldCheck}
                    >
                      <div className="ram-test-icon">
                        <MemoryStick size={39} />
                      </div>
                      <h3 className="test-title">
                        Teste rápido, sem reiniciar.
                      </h3>
                      <p className="body-copy">
                        Escreve e verifica 6 padrões em até 64 MB de memória
                        alocada pelo programa. Seu computador continua
                        disponível durante o teste.
                      </p>
                      <button
                        className="button primary full"
                        disabled={ramJob.state === "running" || demo}
                        onClick={startRam}
                      >
                        {ramJob.state === "running" ? (
                          <LoaderCircle size={16} className="spin" />
                        ) : (
                          <Play size={15} />
                        )}{" "}
                        {ramJob.state === "running"
                          ? "Verificando memória…"
                          : "Iniciar teste rápido"}
                      </button>
                      {ramJob.state === "running" && (
                        <div className="test-progress">
                          <Progress value={ramJob.progress} />
                          <small>
                            {ramJob.progress}% · Não feche o coletor
                          </small>
                        </div>
                      )}
                      {ramJob.result && !demo && (
                        <div
                          className={`test-result ${ramJob.result.errors ? "failed" : ""}`}
                        >
                          <CheckCheck size={20} />
                          <div>
                            <strong>
                              {ramJob.result.errors
                                ? `${ramJob.result.errors} divergência(s) detectada(s)`
                                : "Nenhuma divergência na região testada"}
                            </strong>
                            <p>
                              {bytes(ramJob.result.bytes)} ·{" "}
                              {ramJob.result.patterns} padrões ·{" "}
                              {ramJob.result.durationMs} ms
                            </p>
                          </div>
                        </div>
                      )}
                      {ramJob.error && (
                        <p className="red-text">{ramJob.error}</p>
                      )}
                      <p className="panel-footnote">
                        <Info size={13} />
                        Este teste não certifica a integridade de toda a RAM.
                      </p>
                      <button
                        className="button secondary full"
                        onClick={() => setModal("native")}
                      >
                        <ArrowUpRight size={16} />
                        Diagnóstico completo do sistema
                      </button>
                    </Panel>
                  </div>
                  <Panel
                    title="Módulos de memória"
                    subtitle="Inventário físico reportado pelo sistema"
                    icon={MemoryStick}
                  >
                    {snapshot.memory.modules.length ? (
                      <div className="module-grid">
                        {snapshot.memory.modules.map((m, i) => (
                          <div className="memory-module" key={i}>
                            <div className="module-header">
                              <div>
                                <Badge tone="cyan">
                                  {m.bank || `Módulo ${i + 1}`}
                                </Badge>
                                <h3>
                                  {bytes(m.size)} <span>{m.type}</span>
                                </h3>
                              </div>
                              <MemoryStick size={43} />
                            </div>
                            <DetailRows
                              rows={[
                                ["Fabricante", value(m.manufacturer)],
                                ["Modelo", value(m.part)],
                                [
                                  "Velocidade",
                                  m.speed ? `${m.speed} MHz` : "Não disponível",
                                ],
                                ["Formato", value(m.formFactor)],
                              ]}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Empty title="Detalhes dos módulos indisponíveis">
                        O firmware ou ambiente virtual não expõe os módulos
                        físicos. Em Macs com memória unificada, essas
                        informações podem ser limitadas.
                      </Empty>
                    )}
                  </Panel>
                </>
              )}
              {tab === "temperature" && (
                <>
                  <div className="section-caption">
                    <h2>
                      Monitoramento térmico
                      <small>
                        {tempSensors.length} sensor(es) disponível(is)
                      </small>
                    </h2>
                    <Badge tone="cyan">
                      <span className="status-dot" />
                      {auto && !demo
                        ? "Monitoramento ativo"
                        : demo
                          ? "Dados ilustrativos"
                          : "Pausado"}
                    </Badge>
                  </div>
                  {!demo && snapshot.sensorCollector && (
                    <CollectorStatus
                      title="Coletor de sensores integrado"
                      status={snapshot.sensorCollector}
                      icon={Thermometer}
                      actions={
                        snapshot.platform === "win32" ? (
                          <>
                            {isDesktop &&
                              snapshot.sensorCollector.pawnIOInstalled ===
                                false && (
                                <button
                                  className="button secondary small"
                                  disabled={sensorBusy || scanning}
                                  onClick={() => setModal("sensor-driver")}
                                >
                                  <ShieldCheck size={14} />
                                  Preparar acesso aos sensores
                                </button>
                              )}
                            <button
                              className="button secondary small"
                              disabled={sensorBusy || scanning}
                              onClick={refreshSensors}
                            >
                              {sensorBusy ? (
                                <LoaderCircle size={14} className="spin" />
                              ) : (
                                <RefreshCw size={14} />
                              )}
                              Atualizar sensores
                            </button>
                          </>
                        ) : undefined
                      }
                    />
                  )}
                  {tempSensors.length ? (
                    <>
                      <div className="sensor-grid">
                        {tempSensors.map((s, i) => (
                          <Panel
                            key={i}
                            title={s.name}
                            subtitle={s.detail}
                            icon={s.icon}
                            action={<Badge tone="cyan">Sensor</Badge>}
                          >
                            <div className="sensor-reading">
                              <strong>{Math.round(s.value)}</strong>
                              <span>°C</span>
                              <Thermometer size={38} />
                            </div>
                            <div className="thermal-scale">
                              <span
                                style={{ left: `${Math.min(100, s.value)}%` }}
                              />
                            </div>
                            <div className="thermal-scale-labels">
                              <span>0°C</span>
                              <span>50°C</span>
                              <span>100°C</span>
                            </div>
                            <div className="sensor-source">{s.source}</div>
                            {"min" in s && (s.min != null || s.max != null) && (
                              <div className="sensor-range">
                                <span>
                                  Mín. <b>{temp(s.min)}</b>
                                </span>
                                <span>
                                  Máx. <b>{temp(s.max)}</b>
                                </span>
                                <small>Na sessão do coletor</small>
                              </div>
                            )}
                          </Panel>
                        ))}
                      </div>
                      <div className="bottom-grid">
                        <Panel
                          title="Histórico térmico da CPU"
                          subtitle="Apenas leituras reais desta sessão; lacunas indicam sensor indisponível"
                          icon={Activity}
                        >
                          <Sparkline
                            points={samples.map((s) => s.temperature)}
                            color="#eab774"
                            height={190}
                            label="Histórico de temperatura do processador"
                          />
                          <div className="chart-labels">
                            <span>
                              {samples.length
                                ? new Date(samples[0].time).toLocaleTimeString(
                                    "pt-BR",
                                  )
                                : "Início"}
                            </span>
                            <span>Agora</span>
                          </div>
                        </Panel>
                        <Panel
                          title="Temperaturas por núcleo"
                          subtitle="Sensores individuais do processador"
                          icon={Cpu}
                        >
                          {snapshot.temperatures.cores.length ? (
                            snapshot.temperatures.cores.map((c, i) => (
                              <div className="core-reading" key={i}>
                                <span>
                                  <Cpu size={14} />
                                  Núcleo {i + 1}
                                </span>
                                <Progress value={c || 0} tone="cyan" />
                                <b>{temp(c)}</b>
                              </div>
                            ))
                          ) : (
                            <Empty title="Sensores individuais indisponíveis">
                              O processador ou o sistema operacional não expõe a
                              temperatura de cada núcleo.
                            </Empty>
                          )}
                        </Panel>
                      </div>
                    </>
                  ) : (
                    <Panel title="Sensores de temperatura" icon={Thermometer}>
                      <Empty title="Este ambiente não expõe sensores térmicos">
                        Execute o coletor no computador que deseja analisar.
                        Máquinas virtuais e alguns modelos de Mac não
                        disponibilizam sensores pela interface padrão do
                        sistema.
                      </Empty>
                    </Panel>
                  )}
                  {extraSensors.length > 0 && (
                    <Panel
                      title="Ventoinhas e outros indicadores"
                      subtitle="Leituras adicionais disponíveis no hardware; sem faixas de saúde universais"
                      icon={Fan}
                    >
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>COMPONENTE / SENSOR</th>
                              <th>TIPO</th>
                              <th>ATUAL</th>
                              <th>MÍNIMO</th>
                              <th>MÁXIMO</th>
                            </tr>
                          </thead>
                          <tbody>
                            {extraSensors.map((sensor, i) => (
                              <tr key={sensor.identifier || i}>
                                <td>
                                  <b>{sensor.name}</b>
                                  <small className="hardware-sensor-detail">
                                    {sensor.hardware || sensor.identifier}
                                  </small>
                                </td>
                                <td>{sensorTypeLabel(sensor.type)}</td>
                                <td>
                                  {formatSensor(
                                    sensor.value,
                                    sensor.type,
                                    sensor.unit,
                                  )}
                                </td>
                                <td>
                                  {formatSensor(
                                    sensor.min,
                                    sensor.type,
                                    sensor.unit,
                                  )}
                                </td>
                                <td>
                                  {formatSensor(
                                    sensor.max,
                                    sensor.type,
                                    sensor.unit,
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Panel>
                  )}
                  <div className="info-callout">
                    <Fan size={20} />
                    <div>
                      <strong>
                        Mais sensores, quando o hardware permitir.
                      </strong>
                      <p>
                        As temperaturas SMART são atualizadas na varredura
                        completa. No Windows, o coletor integrado usa a
                        biblioteca LibreHardwareMonitor para consultar os
                        sensores disponíveis, sem exigir outro monitor aberto.
                        Alguns sensores de CPU e placa-mãe precisam do driver
                        PawnIO e de permissões de administrador. A leitura por
                        WMI continua como alternativa. No macOS, algumas
                        leituras exigem ferramentas específicas do fabricante.
                        As faixas térmicas seguras variam por componente;
                        consulte as especificações do seu modelo.
                      </p>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
        <footer>
          <span>
            <span className="status-dot" />
            MELLO PC DIAGNOSTIC <small>v{APP_VERSION}</small>
            <span className="footer-divider" />
            Feito para conhecer. Projetado para cuidar.
          </span>
          <span>
            <ShieldCheck size={13} />
            {demo
              ? "Modo demonstração · dados ilustrativos"
              : snapshot
                ? `Dados de ${snapshot.host.name}${snapshot.host.virtual ? " · ambiente virtual" : ""}${isDesktop ? " · coleta local" : " · não do dispositivo do navegador"}`
                : "Coleta local · sem envio de telemetria"}
          </span>
        </footer>
      </main>
      {toast && (
        <div className={`toast ${toast.error ? "error" : ""}`} role="status">
          {toast.error ? <TriangleAlert size={19} /> : <Check size={19} />}
          <span>{toast.message}</span>
          <button
            aria-label="Fechar notificação"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {modal && (
        <Modal
          title={
            modal === "settings"
              ? "Seu diagnóstico, do seu jeito."
              : modal === "help"
                ? "Conheça o Mello."
                : modal === "report"
                  ? "Leve os detalhes com você."
                  : modal === "sensor-driver"
                    ? "Preparar acesso ao hardware."
                    : "Uma verificação mais profunda."
          }
          onClose={() => setModal(null)}
        >
          {modal === "sensor-driver" && (
            <>
              <p className="body-copy">
                Alguns sensores de CPU e placa-mãe precisam do{" "}
                <strong>PawnIO</strong>, um driver usado pelo coletor
                LibreHardwareMonitor. Outras leituras podem funcionar sem ele.
              </p>
              <div className="info-callout">
                <ShieldCheck size={19} />
                <div>
                  <strong>Instalação com sua confirmação</strong>
                  <p>
                    A ação abaixo baixa e abre o instalador oficial do PawnIO. É
                    necessária uma conexão com a internet. O Windows pode pedir
                    autorização de administrador. Confira o editor e as etapas
                    na janela do instalador antes de prosseguir.
                  </p>
                </div>
              </div>
              <p className="body-copy">
                Quando terminar, volte à aba Temperatura e selecione{" "}
                <strong>Atualizar sensores</strong>. Para ampliar o acesso,
                talvez seja necessário abrir o Mello como administrador. A
                disponibilidade continua dependendo do seu equipamento.
              </p>
              <button
                className="button primary full"
                disabled={demo || !isDesktop || sensorBusy}
                onClick={async () => {
                  setSensorBusy(true);
                  try {
                    const result = await request<{ message: string }>(
                      "/sensors/driver/install",
                      { confirmed: true },
                    );
                    notice(result.message);
                    setModal(null);
                  } catch (e) {
                    notice((e as Error).message, true);
                  } finally {
                    setSensorBusy(false);
                  }
                }}
              >
                {sensorBusy ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <ArrowUpRight size={16} />
                )}
                Baixar e abrir instalador do PawnIO
              </button>
            </>
          )}
          {modal === "settings" && (
            <>
              <p className="body-copy">
                Configure as leituras desta sessão. Todas as informações são
                coletadas localmente pelo programa.
              </p>
              <div className="setting-row">
                <div>
                  <strong>Atualização automática</strong>
                  <p>Mantém os indicadores e gráficos em dia.</p>
                </div>
                <button
                  role="switch"
                  aria-checked={auto}
                  aria-label="Atualização automática"
                  className={`switch ${auto ? "on" : ""}`}
                  onClick={() => setAuto(!auto)}
                >
                  <span />
                </button>
              </div>
              <div className="setting-row">
                <div>
                  <strong>Intervalo de leitura</strong>
                  <p>Intervalos maiores reduzem o uso de recursos.</p>
                </div>
                <select
                  aria-label="Intervalo de leitura"
                  className="settings-select"
                  value={intervalSeconds}
                  onChange={(e) => setIntervalSeconds(Number(e.target.value))}
                >
                  <option value={5}>5 segundos</option>
                  <option value={10}>10 segundos</option>
                  <option value={30}>30 segundos</option>
                </select>
              </div>
              <div className="info-callout">
                <ShieldCheck size={19} />
                <p>
                  Não há envio de telemetria. O relatório exportado pode conter
                  nome do usuário, endereços de rede e números de série.
                </p>
              </div>
            </>
          )}
          {modal === "help" && (
            <>
              <div className="about-brand">
                <IconBox icon={Monitor} />
                <strong>
                  MELLO <span>PC DIAGNOSTIC</span>
                </strong>
                <Badge tone="green">{APP_VERSION}</Badge>
              </div>
              <p className="body-copy">
                Um lugar para entender seu computador: hardware, armazenamento,
                drivers, memória e temperatura.
              </p>
              <DetailRows
                rows={[
                  [
                    "Dados reais",
                    "Coletados do computador que executa o programa.",
                  ],
                  [
                    "Demonstração",
                    "Inventário ilustrativo, sempre identificado na interface.",
                  ],
                  [
                    "Privacidade",
                    "Processamento local. Nenhuma instalação automática de drivers.",
                  ],
                  [
                    "Compatibilidade",
                    "Windows, macOS e Linux; sensores variam por plataforma.",
                  ],
                ]}
              />
              <div className="info-callout">
                <Info size={18} />
                <p>
                  {isDesktop
                    ? "Esta versão desktop analisa o computador em que está sendo executada. Os relatórios são salvos por você, sem envio de telemetria."
                    : "Se você abriu uma versão hospedada, as leituras são do servidor. Para analisar seu próprio PC ou Mac, execute o programa localmente."}
                </p>
              </div>
            </>
          )}
          {modal === "report" && (
            <>
              <p className="body-copy">
                Exporte o inventário e os resultados disponíveis.{" "}
                {demo && (
                  <strong>O arquivo será marcado como demonstração.</strong>
                )}
              </p>
              <button
                className="export-option"
                onClick={() => downloadReport("html")}
              >
                <IconBox icon={Download} />
                <div>
                  <strong>Relatório para leitura</strong>
                  <p>Arquivo HTML · pode ser impresso ou salvo em PDF</p>
                </div>
                <ArrowRight size={19} />
              </button>
              <button
                className="export-option"
                onClick={() => downloadReport("json")}
              >
                <IconBox icon={FileJson} tone="cyan" />
                <div>
                  <strong>Dados completos</strong>
                  <p>Arquivo JSON · inventário e resultados estruturados</p>
                </div>
                <ArrowRight size={19} />
              </button>
              <p className="panel-footnote">
                <Info size={14} />
                Revise dados pessoais e números de série antes de compartilhar.
              </p>
            </>
          )}
          {modal === "native" && (
            <>
              <p className="body-copy">
                O teste rápido avalia apenas a memória alocada pelo processo.
                Para verificar toda a memória, use o diagnóstico do fabricante
                ou um teste inicializável.
              </p>
              {snapshot?.platform === "win32" ? (
                <>
                  <div className="info-callout">
                    <Info size={19} />
                    <div>
                      <strong>Diagnóstico de Memória do Windows</strong>
                      <p>
                        A próxima ação abre o utilitário do Windows. Ele permite
                        escolher quando reiniciar para testar a memória. Salve
                        seu trabalho antes de agendar o teste.
                      </p>
                    </div>
                  </div>
                  <button
                    className="button primary full"
                    disabled={demo}
                    onClick={async () => {
                      try {
                        const r = await request<{ message: string }>(
                          "/ram/native",
                          { confirmed: true },
                        );
                        notice(r.message);
                        setModal(null);
                      } catch (e) {
                        notice((e as Error).message, true);
                      }
                    }}
                  >
                    <ArrowUpRight size={16} />
                    Abrir diagnóstico do Windows
                  </button>
                </>
              ) : snapshot?.platform === "darwin" ? (
                <DetailRows
                  rows={[
                    [
                      "Mac com Apple Silicon",
                      "Desligue. Mantenha o botão de energia pressionado até aparecerem as opções de inicialização. Depois, pressione Command (⌘) + D.",
                    ],
                    [
                      "Mac com processador Intel",
                      "Ligue o Mac e mantenha a tecla D pressionada para abrir o Diagnóstico Apple.",
                    ],
                    [
                      "Antes de começar",
                      "Salve seus arquivos e siga as instruções oficiais da Apple para o seu modelo.",
                    ],
                  ]}
                />
              ) : (
                <div className="info-callout">
                  <MemoryStick size={19} />
                  <p>
                    No Linux, use um teste inicializável como MemTest86+ para
                    avaliar a memória fora do sistema operacional. Salve seus
                    arquivos antes de reiniciar.
                  </p>
                </div>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
function Metric({
  icon: Icon,
  label,
  number,
  amount,
  detail,
  tone = "green",
}: {
  icon: typeof Cpu;
  label: string;
  number: string;
  amount: number;
  detail: string;
  tone?: string;
}) {
  return (
    <div className={`mini-stat ${tone}`}>
      <div>
        <Icon size={15} />
        <span>{label}</span>
      </div>
      <strong>{number}</strong>
      <Progress value={amount} tone={tone} />
      <small>{detail}</small>
    </div>
  );
}
function Stat({
  icon,
  label,
  number,
  detail,
  tone = "green",
}: {
  icon: typeof Cpu;
  label: string;
  number: string;
  detail: string;
  tone?: string;
}) {
  return (
    <div className="stat-card">
      <div>
        <IconBox icon={icon} tone={tone} />
        <span>{label}</span>
      </div>
      <strong>{number}</strong>
      <p>{detail}</p>
    </div>
  );
}
function Shortcut({
  icon: Icon,
  title,
  subtitle,
  children,
  onClick,
}: {
  icon: typeof Cpu;
  title: string;
  subtitle: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="shortcut" onClick={onClick}>
      <div className="shortcut-top">
        <IconBox icon={Icon} tone="cyan" />
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        <ArrowUpRight size={17} />
      </div>
      {children}
    </button>
  );
}
function CollectorStatus({
  title,
  status,
  icon: Icon,
  actions,
}: {
  title: string;
  status: CollectorState;
  icon: typeof Cpu;
  actions?: ReactNode;
}) {
  const ready = ["ready", "available", "ok", "running"].includes(status.state);
  const partial = [
    "partial",
    "limited",
    "warning",
    "degraded",
    "requires_admin",
    "requires_driver",
    "needsAdministrator",
  ].includes(status.state);
  return (
    <section
      className={`collector-status ${ready ? "ready" : partial ? "partial" : "unavailable"}`}
      aria-label={title}
    >
      <div className="collector-status-heading">
        <IconBox icon={Icon} tone={ready ? "green" : "cyan"} />
        <div>
          <strong>{title}</strong>
          <p>{status.source || "Leitura local"}</p>
        </div>
        <Badge tone={ready ? "green" : partial ? "amber" : "muted"}>
          {ready
            ? "Disponível"
            : partial
              ? "Leitura limitada"
              : status.state === "unsupported"
                ? "Indisponível nesta plataforma"
                : status.state === "error"
                  ? "Falha na leitura"
                  : status.state === "unavailable"
                    ? "Sem leitura"
                    : status.state === "missing"
                      ? "Componente não encontrado"
                      : "A verificar"}
        </Badge>
      </div>
      {status.diagnostics.length > 0 && (
        <ul>
          {status.diagnostics.map((message, i) => (
            <li key={i}>
              <Info size={13} />
              <span>{message}</span>
            </li>
          ))}
        </ul>
      )}
      {actions && <div className="collector-actions">{actions}</div>}
    </section>
  );
}
function sensorTypeLabel(type?: string) {
  const labels: Record<string, string> = {
    Fan: "Ventoinha",
    Voltage: "Tensão",
    Current: "Corrente",
    Power: "Potência",
    Load: "Uso",
    Clock: "Frequência",
    Control: "Controle reportado",
    Data: "Dados",
    SmallData: "Dados",
    Throughput: "Transferência",
    Level: "Nível",
    Factor: "Fator",
  };
  return type ? labels[type] || type : "Sensor";
}
function formatSensor(amount: number | null, type?: string, unit?: string) {
  if (amount == null || !Number.isFinite(amount)) return "—";
  const units: Record<string, string> = {
    Fan: "RPM",
    Voltage: "V",
    Current: "A",
    Power: "W",
    Load: "%",
    Clock: "MHz",
    Temperature: "°C",
  };
  return `${amount.toLocaleString("pt-BR", { maximumFractionDigits: type === "Voltage" ? 3 : 2 })} ${unit || units[type || ""] || ""}`.trim();
}
function storageCounterRows(smart: Smart): [ReactNode, ReactNode][] {
  const labels: Record<string, string> = {
    reallocatedSectors: "Setores realocados",
    pendingSectors: "Setores pendentes",
    offlineUncorrectableSectors: "Setores incorrigíveis (offline)",
    reportedUncorrectableErrors: "Erros incorrigíveis reportados",
    interfaceCrcErrors: "Erros CRC da interface",
    scsiGrownDefects: "Defeitos remapeados SCSI",
    scsiReadUncorrectedErrors: "Erros de leitura não corrigidos SCSI",
    scsiWriteUncorrectedErrors: "Erros de escrita não corrigidos SCSI",
    nvmeCriticalWarning: "Alerta crítico NVMe (bitmask)",
    nvmeAvailableSparePercent: "Reserva disponível NVMe",
    nvmeSpareThresholdPercent: "Limite da reserva NVMe",
    nvmeMediaErrors: "Erros de mídia / integridade NVMe",
    nvmeErrorLogEntries: "Entradas no log de erros NVMe",
    nvmeUnsafeShutdowns: "Desligamentos inseguros NVMe",
  };
  return Object.entries(smart.counters || {})
    .filter(([, n]) => n != null)
    .map(([key, n]) => [
      labels[key] || key,
      `${typeof n === "number" ? n.toLocaleString("pt-BR") : n}${key.endsWith("Percent") ? "%" : ""}`,
    ]);
}
function DiskDetail({
  disk,
  scan,
  scanning,
}: {
  disk: Snapshot["disks"][number];
  scan: () => void;
  scanning: boolean;
}) {
  const s = disk.smart;
  const severity =
    s?.severity ||
    (s?.health === "failed"
      ? "critical"
      : s?.health === "passed"
        ? "ok"
        : "unknown");
  const severityTone =
    severity === "critical"
      ? "red"
      : severity === "warning"
        ? "amber"
        : severity === "ok"
          ? "green"
          : "muted";
  return (
    <>
      <Panel
        title={disk.name || "Unidade física"}
        subtitle={`${disk.interface || disk.type || "Disco"} · ${bytes(disk.size)}`}
        icon={HardDrive}
        action={
          <Badge tone={severityTone}>
            {severity === "critical"
              ? "Indicadores críticos"
              : severity === "warning"
                ? "Atenção aos indicadores"
                : severity === "ok"
                  ? "Sem alertas nas leituras"
                  : "Dados insuficientes"}
          </Badge>
        }
      >
        <div className="disk-health-grid">
          <div className="disk-life">
            <span>VIDA ÚTIL REPORTADA</span>
            <strong>
              {s?.lifePercent != null ? s.lifePercent : "—"}
              <small>{s?.lifePercent != null ? "%" : ""}</small>
            </strong>
            {s?.lifePercent != null ? (
              <Progress
                value={s.lifePercent}
                tone={s.lifePercent < 20 ? "amber" : "green"}
              />
            ) : (
              <p>O dispositivo não forneceu um indicador reconhecido.</p>
            )}
          </div>
          <div className="disk-facts">
            <div>
              <Thermometer size={18} />
              <span>
                Temperatura<strong>{temp(s?.temperature)}</strong>
              </span>
            </div>
            <div>
              <Database size={18} />
              <span>
                Total de dados gravados
                <strong>
                  {s?.totalWrittenBytes == null
                    ? s?.totalWrittenBytesExact
                      ? `${s.totalWrittenBytesExact} bytes`
                      : "Não disponível"
                    : bytes(s.totalWrittenBytes)}
                </strong>
              </span>
            </div>
            <div>
              <Clock3 size={18} />
              <span>
                Tempo em funcionamento
                <strong>
                  {s?.powerOnHours == null
                    ? "Não disponível"
                    : `${s.powerOnHours.toLocaleString("pt-BR")} horas`}
                </strong>
              </span>
            </div>
            <div>
              <Power size={18} />
              <span>
                Ciclos de energia
                <strong>
                  {s?.powerCycles == null
                    ? "Não disponível"
                    : s.powerCycles.toLocaleString("pt-BR")}
                </strong>
              </span>
            </div>
          </div>
        </div>
        <DetailRows
          rows={[
            ["Número de série", value(disk.serial)],
            ["Firmware", value(disk.firmware)],
            ["Dispositivo", value(disk.device)],
            [
              "Protocolo",
              s?.protocol ? s.protocol.toUpperCase() : "Não informado",
            ],
            [
              "Estado informado pelo firmware",
              s?.health === "passed"
                ? "SMART aprovado pelo dispositivo"
                : s?.health === "failed"
                  ? "SMART reprovado pelo dispositivo"
                  : "Não disponível",
            ],
            [
              "Indicador de vida útil",
              s?.lifeSource || "Não reportado / sem atributo reconhecido",
            ],
            ["Dias restantes de vida", "Não estimável com segurança"],
            [
              "Fonte dos indicadores",
              s?.source || "Sem leitura SMART disponível",
            ],
            [
              "Última leitura SMART",
              s?.measuredAt
                ? new Date(s.measuredAt).toLocaleString("pt-BR")
                : "Não disponível",
            ],
          ]}
        />
        {!s && (
          <div className="smart-setup">
            <Info size={18} />
            <p>
              Execute a varredura completa para consultar o leitor SMART
              integrado no Windows. Algumas unidades e controladores exigem que
              o Mello seja aberto como administrador; outros não expõem esses
              dados.
            </p>
            <button
              className="button secondary small"
              onClick={scan}
              disabled={scanning}
            >
              <Radar size={15} />
              Verificar
            </button>
          </div>
        )}
        {s?.error && <p className="panel-footnote">{s.error}</p>}
      </Panel>
      {s?.summary && (
        <Panel
          title="Avaliação dos indicadores"
          subtitle="A avaliação considera evidências reportadas, sem prever a data de falha"
          icon={ShieldCheck}
          action={
            <Badge tone={severityTone}>
              {s.readStatus === "partial"
                ? "Leitura parcial"
                : s.readStatus === "unavailable"
                  ? "Sem leitura"
                  : "Leitura disponível"}
            </Badge>
          }
        >
          <p className={`storage-assessment-summary ${severity}`}>
            {s.summary}
          </p>
          {s.evidence && s.evidence.length > 0 && (
            <ul className="smart-evidence">
              {[...s.evidence]
                .sort(
                  (a, b) =>
                    ({ critical: 0, warning: 1, unknown: 2, info: 3, ok: 4 })[
                      a.severity
                    ] -
                    { critical: 0, warning: 1, unknown: 2, info: 3, ok: 4 }[
                      b.severity
                    ],
                )
                .map((item, i) => (
                  <li className={item.severity} key={`${item.code}-${i}`}>
                    {item.severity === "critical" ||
                    item.severity === "warning" ? (
                      <TriangleAlert size={15} />
                    ) : (
                      <Info size={15} />
                    )}
                    <span>{item.message}</span>
                  </li>
                ))}
            </ul>
          )}
        </Panel>
      )}
      {s?.counters && Object.values(s.counters).some((v) => v != null) && (
        <Panel
          title="Contadores de integridade"
          subtitle="Contadores do dispositivo; valores históricos não indicam, por si só, uma falha atual"
          icon={Database}
        >
          <DetailRows rows={storageCounterRows(s)} />
        </Panel>
      )}
      <Panel
        title="Atributos SMART"
        subtitle="Valores reportados pelo dispositivo, sem normalização inventada"
        icon={ListChecks}
      >
        {s?.attributes.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>ATRIBUTO</th>
                  <th>ATUAL</th>
                  <th>PIOR</th>
                  <th>LIMITE</th>
                  <th>BRUTO</th>
                </tr>
              </thead>
              <tbody>
                {s.attributes.map((a) => (
                  <tr key={a.id}>
                    <td className="mono">
                      {a.id.toString(16).toUpperCase().padStart(2, "0")}
                    </td>
                    <td>{a.name}</td>
                    <td>{a.value}</td>
                    <td>{a.worst}</td>
                    <td>{a.threshold}</td>
                    <td className="mono">{a.raw}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Tabela de atributos indisponível">
            NVMe usa indicadores diferentes de SATA. Os indicadores reconhecidos
            aparecem no resumo quando acessíveis.
          </Empty>
        )}
      </Panel>
    </>
  );
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) {
          const rect = ref.current!.getBoundingClientRect();
          if (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-header">
        <span className="eyebrow">MELLO PC DIAGNOSTIC</span>
        <button
          className="icon-button"
          aria-label="Fechar janela"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <h2>{title}</h2>
      {children}
    </dialog>
  );
}
