import { useEffect, useId, useMemo, useRef, useState } from "react";
import { money, num } from "../lib/utils";
import type { SeriesPoint } from "../../shared/types";

export function Sparkline({
  values,
  tone = "emerald",
  height = 32,
  fill = true,
}: {
  values: number[];
  tone?: "emerald" | "gold" | "rose";
  height?: number;
  fill?: boolean;
}) {
  const width = 120;
  const safe = values.length > 1 ? values : [0, 0];
  const min = Math.min(...safe);
  const max = Math.max(...safe);
  const range = max - min || 1;
  const points = safe.map((value, index) => {
    const x = (index / (safe.length - 1)) * width;
    const y = height - 3 - ((value - min) / range) * (height - 8);
    return [x, y] as const;
  });
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `0,${height} ${line} ${width},${height}`;
  const id = useId().replace(/:/g, "");

  return (
    <svg
      className={`spark spark-${tone}`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      height={height}
      aria-hidden="true"
    >
      {fill ? <polygon points={area} fill={`url(#spark-${id})`} opacity={0.42} /> : null}
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--spark)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--spark)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={line} fill="none" stroke="var(--spark)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

function niceMax(value: number): number {
  if (value <= 0) return 10;
  const power = Math.pow(10, Math.floor(Math.log10(value)));
  const normal = value / power;
  const step = normal <= 2 ? 2 : normal <= 5 ? 5 : 10;
  return step * power;
}

export function AreaChart({
  data,
  height = 262,
  label = "Revenue",
}: {
  data: SeriesPoint[];
  height?: number;
  label?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [measured, setMeasured] = useState(760);
  const hostRef = useRef<HTMLDivElement>(null);
  const id = useId().replace(/:/g, "");
  const width = Math.max(280, measured);
  const pad = { l: 46, r: 12, t: 16, b: 30 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const max = niceMax(Math.max(...data.map((point) => point.revenue), 1));
  const points = data.map((point, index) => ({
    x: pad.l + (index / Math.max(1, data.length - 1)) * innerW,
    y: pad.t + innerH - (point.revenue / max) * innerH,
    point,
    index,
  }));
  const line = points.map((entry) => `${entry.x.toFixed(1)},${entry.y.toFixed(1)}`).join(" ");
  const area = `${pad.l},${pad.t + innerH} ${line} ${pad.l + innerW},${pad.t + innerH}`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    y: pad.t + innerH - ratio * innerH,
    value: max * ratio,
  }));
  const step = Math.max(1, Math.ceil(data.length / 6));
  const xTicks = data.filter((_, index) => index % step === 0 || index === data.length - 1);
  const active = hover !== null ? points[hover] : null;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next && next > 0) setMeasured(next);
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="area-chart" style={{ height }} ref={hostRef}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label} over ${data.length} days`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const relative = (event.clientX - rect.left) / rect.width;
          const x = relative * width;
          let closest = 0;
          let distance = Infinity;
          points.forEach((entry, index) => {
            const delta = Math.abs(entry.x - x);
            if (delta < distance) {
              distance = delta;
              closest = index;
            }
          });
          setHover(closest);
        }}
      >
        <defs>
          <linearGradient id={`area-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--emerald-2)" stopOpacity="0.3" />
            <stop offset="78%" stopColor="var(--emerald-2)" stopOpacity="0.03" />
            <stop offset="100%" stopColor="var(--emerald-2)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`line-${id}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--emerald-2)" />
            <stop offset="55%" stopColor="var(--gold)" />
            <stop offset="100%" stopColor="var(--gold-2)" />
          </linearGradient>
        </defs>
        {ticks.map((tick) => (
          <g key={tick.y}>
            <line x1={pad.l} x2={pad.l + innerW} y1={tick.y} y2={tick.y} stroke="var(--chart-grid)" strokeWidth="1" />
            <text x={pad.l - 10} y={tick.y + 4} textAnchor="end" className="chart-axis" fill="var(--ink-3)">
              {tick.value >= 1000 ? `$${Math.round(tick.value / 1000)}k` : `$${Math.round(tick.value)}`}
            </text>
          </g>
        ))}
        <polygon points={area} fill={`url(#area-${id})`} />
        <polyline points={line} fill="none" stroke={`url(#line-${id})`} strokeWidth="2.2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        {xTicks.map((point) => {
          const index = data.indexOf(point);
          const x = pad.l + (index / Math.max(1, data.length - 1)) * innerW;
          return (
            <text key={point.date} x={x} y={height - 8} textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"} className="chart-axis" fill="var(--ink-3)">
              {new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short" }).format(new Date(point.date))}
            </text>
          );
        })}
        {active ? (
          <g>
            <line x1={active.x} x2={active.x} y1={pad.t} y2={pad.t + innerH} stroke="var(--gold)" strokeWidth="1" strokeDasharray="4 4" />
            <circle cx={active.x} cy={active.y} r="4.5" fill="var(--gold)" stroke="var(--surface)" strokeWidth="1.5" />
          </g>
        ) : null}
      </svg>
      {active ? (
        <div className="chart-tooltip" style={{ left: `${(active.x / width) * 100}%`, top: `${Math.max(6, (active.y / height) * 100 - 18)}%` }}>
          <span className="chart-tooltip-date">
            {new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short" }).format(new Date(active.point.date))}
          </span>
          <strong>{money(active.point.revenue)}</strong>
          <small>{num(active.point.orders)} orders</small>
        </div>
      ) : null}
    </div>
  );
}

export function DonutChart({
  data,
  size = 172,
  centerLabel,
  centerValue,
}: {
  data: Array<{ name: string; value: number; color: string }>;
  size?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = data.reduce((sum, slice) => sum + slice.value, 0) || 1;
  const stroke = 13;
  const radius = (size - stroke) / 2 - 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="donut-wrap">
      <div className="donut" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={centerLabel ?? "Distribution"}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--line-faint)" strokeWidth={stroke} />
          {data.map((slice) => {
            const fraction = slice.value / total;
            const dash = fraction * circumference;
            const element = (
              <circle
                key={slice.name}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth={stroke}
                strokeDasharray={`${Math.max(0, dash - 2)} ${circumference - Math.max(0, dash - 2)}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                strokeLinecap="butt"
              />
            );
            offset += dash;
            return element;
          })}
        </svg>
        <div className="donut-center">
          {centerValue ? <strong>{centerValue}</strong> : null}
          {centerLabel ? <span>{centerLabel}</span> : null}
        </div>
      </div>
      {data.length ? (
        <ul className="donut-legend">
          {data.map((slice) => (
            <li key={slice.name}>
              <i style={{ background: slice.color }} />
              <span className="truncate">{slice.name}</span>
              <b className="tnum">{Math.round((slice.value / total) * 100)}%</b>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function CategoryBars({ data, valueLabel }: { data: Array<{ name: string; value: number; color?: string }>; valueLabel?: string }) {
  const max = Math.max(...data.map((entry) => entry.value), 1);
  return (
    <ul className="cat-bars">
      {data.map((entry, index) => (
        <li key={`${entry.name}-${index}`}>
          <div className="cat-bars-head">
            <span className="truncate">{entry.name}</span>
            <b className="tnum">{valueLabel ?? money(entry.value)}</b>
          </div>
          <div className="cat-bars-track">
            <span
              style={{
                width: `${Math.max(3, (entry.value / max) * 100)}%`,
                background: entry.color
                  ? `linear-gradient(90deg, ${entry.color}, color-mix(in oklab, ${entry.color}, white 28%))`
                  : undefined,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Gauge({ value, label, sublabel }: { value: number; label: string; sublabel?: string }) {
  const segments = 32;
  const center = 92;
  const radius = 72;
  const filled = Math.round((Math.min(100, Math.max(0, value)) / 100) * segments);
  return (
    <div className="gauge">
      <svg viewBox="0 0 184 184" role="img" aria-label={`${label}: ${value}%`}>
        {Array.from({ length: segments }).map((_, index) => {
          const angle = 135 + (index / (segments - 1)) * 270;
          return (
            <rect
              key={index}
              x={center - 2.2}
              y={center - radius}
              width={4.4}
              height={11}
              rx={2.2}
              fill={index < filled ? "var(--gold)" : "var(--line)"}
              transform={`rotate(${angle} ${center} ${center})`}
            />
          );
        })}
        <circle cx={center} cy={center} r={radius - 16} fill="none" stroke="var(--line-faint)" strokeWidth="1" />
      </svg>
      <div className="gauge-center">
        <strong className="serif">{value}%</strong>
        <span>{label}</span>
        {sublabel ? <em>{sublabel}</em> : null}
      </div>
    </div>
  );
}

export function MiniBars({ data }: { data: Array<{ name: string; value: number }> }) {
  const max = useMemo(() => Math.max(...data.map((entry) => entry.value), 1), [data]);
  return (
    <div className="mini-bars" aria-label="Channel mix">
      {data.map((entry) => (
        <div key={entry.name} className="mini-bar">
          <span className="mini-bar-value tnum">{entry.value}</span>
          <span className="mini-bar-track">
            <span style={{ height: `${Math.max(8, (entry.value / max) * 100)}%` }} />
          </span>
          <span className="mini-bar-label">{entry.name}</span>
        </div>
      ))}
    </div>
  );
}
