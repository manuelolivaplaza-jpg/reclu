"use client";

import { useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function fmtPct(v: number, digits = 1): string {
  const s = Math.abs(v).toFixed(digits).replace(".", ",");
  return `${v > 0 ? "+" : v < 0 ? "\u2212" : ""}${s}%`;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? ""} ${y}`;
}

/** Paso "bonito" para el eje (1, 2, 2.5, 5 × 10^n). */
function niceStep(range: number, ticks: number): number {
  const raw = range / Math.max(1, ticks);
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

/**
 * Gráfico SVG propio estilo terminal: línea con degradado, eje de % a la
 * derecha, meses abajo, línea de 0% y tooltip con cruz al pasar el dedo o
 * el mouse. Sin librerías.
 */
export function ExploreHeroChart({
  data,
  className,
  height = 240,
}: {
  data: { date: string; pct: number }[];
  className?: string;
  height?: number;
}) {
  const gid = useId().replace(/:/g, "");
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const W = 640;
  const H = height;
  const PAD = { l: 4, r: 52, t: 12, b: 26 };
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;

  const geo = useMemo(() => {
    if (data.length < 2) return null;
    const vals = data.map((d) => d.pct);
    let min = Math.min(0, ...vals);
    let max = Math.max(0, ...vals);
    if (max - min < 1) {
      max += 0.5;
      min -= 0.5;
    }
    const step = niceStep(max - min, 4);
    min = Math.floor(min / step) * step;
    max = Math.ceil(max / step) * step;
    const x = (i: number) => PAD.l + (i / (data.length - 1)) * iw;
    const y = (v: number) => PAD.t + (1 - (v - min) / (max - min)) * ih;
    const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.pct).toFixed(1)}`).join("");
    const area = `${line}L${x(data.length - 1).toFixed(1)},${(PAD.t + ih).toFixed(1)}L${PAD.l},${(PAD.t + ih).toFixed(1)}Z`;
    const ticks: number[] = [];
    for (let v = min; v <= max + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
    const months: { i: number; label: string }[] = [];
    let prev = "";
    data.forEach((d, i) => {
      const key = d.date.slice(0, 7);
      if (key !== prev) {
        if (prev) months.push({ i, label: MONTHS[Number(d.date.slice(5, 7)) - 1] ?? "" });
        prev = key;
      }
    });
    const every = Math.ceil(months.length / 7) || 1;
    return { x, y, line, area, ticks, months: months.filter((_, k) => k % every === 0) };
  }, [data, iw, ih, PAD.l, PAD.t]);

  if (!geo) {
    return (
      <div className={cn("flex items-center justify-center rounded-xl bg-ink-50 text-[13px] text-ink-500", className)} style={{ height }}>
        Sin serie de rendimiento aún
      </div>
    );
  }

  const last = data[data.length - 1].pct;
  const up = last >= 0;
  const color = up ? "var(--color-positive, #16a34a)" : "var(--color-negative, #dc2626)";

  function onMove(clientX: number) {
    const svg = ref.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    const i = Math.round(((px - PAD.l) / iw) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  }

  const h = hover !== null ? data[hover] : null;
  const hx = hover !== null ? geo.x(hover) : 0;

  return (
    <div className={cn("relative select-none", className)}>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        role="img"
        aria-label={`Rendimiento del período: ${fmtPct(last)}`}
        onMouseMove={(e) => onMove(e.clientX)}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => onMove(e.touches[0].clientX)}
        onTouchEnd={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`g${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {geo.ticks.map((v) => (
          <g key={v}>
            <line
              x1={PAD.l}
              x2={PAD.l + iw}
              y1={geo.y(v)}
              y2={geo.y(v)}
              stroke={v === 0 ? "#c4c4c4" : "#efefef"}
              strokeDasharray={v === 0 ? "3 3" : undefined}
              vectorEffect="non-scaling-stroke"
            />
            <text x={W - 4} y={geo.y(v) + 4} textAnchor="end" className="fill-ink-500 text-[11px] tabular-nums">
              {fmtPct(v, Math.abs(v) < 10 && v % 1 !== 0 ? 1 : 0)}
            </text>
          </g>
        ))}

        {geo.months.map((m) => (
          <text key={`${m.i}`} x={geo.x(m.i)} y={H - 6} textAnchor="middle" className="fill-ink-500 text-[11px]">
            {m.label}
          </text>
        ))}

        <path d={geo.area} fill={`url(#g${gid})`} />
        <path d={geo.line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <circle cx={geo.x(data.length - 1)} cy={geo.y(last)} r={3.5} fill={color} />

        {h ? (
          <g>
            <line x1={hx} x2={hx} y1={PAD.t} y2={PAD.t + ih} stroke="#0a0a0a" strokeOpacity={0.35} vectorEffect="non-scaling-stroke" />
            <circle cx={hx} cy={geo.y(h.pct)} r={4.5} fill="#fff" stroke={color} strokeWidth={2} />
          </g>
        ) : null}
      </svg>

      {h ? (
        <div
          className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-lg bg-ink-900 px-2.5 py-1.5 text-center text-white shadow-lg"
          style={{ left: `${Math.min(88, Math.max(12, (hx / W) * 100))}%` }}
        >
          <p className="text-[13px] font-semibold tabular-nums">{fmtPct(h.pct, 2)}</p>
          <p className="text-[11px] text-white/70">{fmtDate(h.date)}</p>
        </div>
      ) : null}
    </div>
  );
}
