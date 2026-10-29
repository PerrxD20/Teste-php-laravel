import { useId, type ReactNode } from "react";
import { Info, ChevronRight, type LucideIcon } from "lucide-react";
export const bytes = (n: number | null | undefined, decimals = 1) => {
  if (n == null || !Number.isFinite(n)) return "Não disponível";
  if (n === 0) return "0 B";
  const i = Math.min(4, Math.max(0, Math.floor(Math.log(n) / Math.log(1024))));
  return `${(n / 1024 ** i).toLocaleString("pt-BR", { maximumFractionDigits: decimals })} ${["B", "KB", "MB", "GB", "TB"][i]}`;
};
export const value = (v: unknown, suffix = "") =>
  v === undefined || v === null || v === ""
    ? "Não disponível"
    : `${v}${suffix}`;
export const pct = (n: number, total: number) =>
  total > 0 ? Math.max(0, Math.min(100, (n / total) * 100)) : 0;
export const duration = (seconds: number) => {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d ? `${d}d ` : ""}${h}h ${m}min`;
};
export const temp = (v: number | null | undefined) =>
  v == null ? "—" : `${Math.round(v)}°C`;
export function IconBox({
  icon: Icon,
  tone = "green",
}: {
  icon: LucideIcon;
  tone?: string;
}) {
  return (
    <span className={`icon-box ${tone}`}>
      <Icon size={20} strokeWidth={1.7} />
    </span>
  );
}
export function Panel({
  title,
  subtitle,
  icon: Icon,
  children,
  action,
  className = "",
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-header">
        <div className="panel-title">
          {Icon && <IconBox icon={Icon} />}
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Badge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Progress({
  value: amount,
  tone = "green",
}: {
  value: number;
  tone?: string;
}) {
  return (
    <div
      className={`progress ${tone}`}
      role="progressbar"
      aria-valuenow={Math.round(amount)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${Math.max(0, Math.min(100, amount))}%` }} />
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <Info size={24} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function DetailRows({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="detail-rows">
      {rows.map(([label, val], i) => (
        <div className="detail-row" key={i}>
          <dt>{label}</dt>
          <dd>{val}</dd>
        </div>
      ))}
    </dl>
  );
}
export function Sparkline({
  points,
  color = "#47e8a2",
  height = 80,
  label = "Histórico de uso",
  max = 100,
}: {
  points: (number | null)[];
  color?: string;
  height?: number;
  label?: string;
  max?: number;
}) {
  const id = useId().replace(/:/g, "");
  const usable = points.filter((p): p is number => p !== null);
  if (usable.length < 2)
    return (
      <div className="chart-pending" style={{ height }}>
        Aguardando próximas leituras…
      </div>
    );
  const width = 400;
  const padding = 4;
  const segments: string[][] = [[]];
  points.forEach((p, i) => {
    if (p === null) {
      if (segments[segments.length - 1].length) segments.push([]);
      return;
    }
    segments[segments.length - 1].push(
      `${padding + (i / Math.max(1, points.length - 1)) * (width - 2 * padding)},${height - padding - (Math.min(max, Math.max(0, p)) / max) * (height - 2 * padding)}`,
    );
  });
  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      style={{ height }}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((n) => (
        <line
          key={n}
          x1="0"
          x2={width}
          y1={height * n}
          y2={height * n}
          stroke="currentColor"
          strokeDasharray="3 5"
        />
      ))}
      {segments
        .filter((segment) => segment.length > 0)
        .map((segment, i) => (
          <g key={i}>
            <polygon
              points={`${segment[0].split(",")[0]},${height} ${segment.join(" ")} ${segment[segment.length - 1].split(",")[0]},${height}`}
              fill={`url(#${id})`}
            />
            <polyline
              points={segment.join(" ")}
              fill="none"
              stroke={color}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
            />
          </g>
        ))}
    </svg>
  );
}
export function ActionLink({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="action-link" onClick={onClick}>
      {children}
      <ChevronRight size={15} />
    </button>
  );
}
