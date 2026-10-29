"use client";

import { useId, useMemo, useRef, useState } from "react";
import type { SeriesPt } from "./periods";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const W = 640;
const H = 240;
const PAD = { t: 12, r: 48, b: 24, l: 4 };

function niceStep(range: number) {
  const raw = range / 4;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

/**
 * Gráfico SVG propio: retorno acumulado (%) desde el primer punto visible.
 * Eje % a la derecha, meses abajo, tooltip con cruz. Sin librerías.
 */
export function PerformanceChart({ points, className }: { points: SeriesPt[]; className?: string }) {
  const gid = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    if (points.length < 2) return null;
    const base = 1 + points[0].value / 100;
    const ys = points.map((p) => ((1 + p.value / 100) / base - 1) * 100);
    let min = Math.min(0, ...ys);
    let max = Math.max(0, ...ys);
    if (max - min < 1) {
      max += 0.5;
      min -= 0.5;
    }
    const step = niceStep(max - min);
    min = Math.floor(min / step) * step;
    max = Math.ceil(max / step) * step;
    const iw = W - PAD.l - PAD.r;
    const ih = H - PAD.t - PAD.b;
    const x = (i: number) => PAD.l + (i / (points.length - 1)) * iw;
    const y = (v: number) => PAD.t + (1 - (v - min) / (max - min)) * ih;
    const line = ys.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const area = `${line} L${x(points.length - 1).toFixed(1)},${(H - PAD.b).toFixed(1)} L${x(0).toFixed(1)},${(H - PAD.b).toFixed(1)} Z`;
    const ticks: number[] = [];
    for (let v = min; v <= max + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
    // Meses: primer punto de cada mes; se ralea para no saturar.
    const months: { i: number; label: string }[] = [];
    let prev = "";
    points.forEach((p, i) => {
      const k = p.date.slice(0, 7);
      if (k !== prev) {
        prev = k;
        if (i > 0) months.push({ i, label: MONTHS[Number(p.date.slice(5, 7)) - 1] });
      }
    });
    const every = Math.max(1, Math.ceil(months.length / 7));
    const shown = months.filter((_, j) => j % every === 0);
    const up = ys[ys.length - 1] >= 0;
    return { ys, x, y, line, area, ticks, shown, up };
  }, [points]);

  if (!model) {
    return (
      <div className={`flex items-center justify-center text-app-caption text-ink-400 ${className ?? ""}`}>
        Sin serie real todavía
      </div>
    );
  }

  const color = model.up ? "var(--color-positive)" : "var(--color-negative)";
  const onMove = (clientX: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    const rel = ((clientX - r.left) / r.width) * W;
    const t = (rel - PAD.l) / (W - PAD.l - PAD.r);
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(t * (points.length - 1)))));
  };
  const hv = hover !== null ? model.ys[hover] : null;
  const hx = hover !== null ? model.x(hover) : 0;

  return (
    <div className={`relative ${className ?? ""}`}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-full w-full touch-pan-y select-none"
        role="img"
        aria-label="Rendimiento acumulado"
        onPointerMove={(e) => onMove(e.clientX)}
        onPointerDown={(e) => onMove(e.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`g${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {model.ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={model.y(t)}
              y2={model.y(t)}
              stroke="var(--color-app-border)"
              strokeDasharray={t === 0 ? undefined : "2 4"}
              vectorEffect="non-scaling-stroke"
            />
            <text x={W - PAD.r + 8} y={model.y(t) + 4} className="fill-ink-500 text-[11px] tabular-nums">
              {t > 0 ? "+" : ""}
              {t.toFixed(Math.abs(t) < 10 && t % 1 !== 0 ? 1 : 0)}%
            </text>
          </g>
        ))}
        {model.shown.map((m) => (
          <text key={m.i} x={model.x(m.i)} y={H - 6} textAnchor="middle" className="fill-ink-500 text-[11px]">
            {m.label}
          </text>
        ))}
        <path d={model.area} fill={`url(#g${gid})`} />
        <path d={model.line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <circle cx={model.x(points.length - 1)} cy={model.y(model.ys[model.ys.length - 1])} r={3.5} fill={color} />
        {hover !== null && hv !== null && (
          <g>
            <line x1={hx} x2={hx} y1={PAD.t} y2={H - PAD.b} stroke="var(--color-ink-400)" vectorEffect="non-scaling-stroke" />
            <circle cx={hx} cy={model.y(hv)} r={4} fill="white" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
          </g>
        )}
      </svg>
      {hover !== null && hv !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-app-control bg-ink-900 px-2.5 py-1.5 text-app-caption whitespace-nowrap text-white shadow-app-raised"
          style={{ left: `${Math.min(88, Math.max(12, (hx / W) * 100))}%` }}
        >
          <span className="text-white/70">{fmtDate(points[hover].date)}</span>{" "}
          <span className="font-semibold tabular-nums">
            {hv >= 0 ? "+" : ""}
            {hv.toFixed(2)}%
          </span>
        </div>
      )}
    </div>
  );
}
