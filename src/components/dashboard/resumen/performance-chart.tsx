"use client";

import { useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { cn, formatSignedPct } from "@/lib/utils";
import type { SeriesPt } from "./periods";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const W = 640;
const H = 240;
/** El eje derecho vive en HTML (columna aparte), así el texto no se deforma. */
const PAD = { t: 10, r: 0, b: 20, l: 2 };

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

function fmtTick(t: number) {
  const digits = Math.abs(t) < 10 && t % 1 !== 0 ? 1 : 0;
  const text = Math.abs(t).toLocaleString("es-CL", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${t > 0 ? "+" : t < 0 ? "\u2212" : ""}${text}%`;
}

/**
 * Gráfico SVG propio: retorno acumulado (%) desde el primer punto visible.
 * Curva negra de 1.5px, sin relleno, eje % en HTML, meses abajo y tooltip con cruz.
 * Sin librerías y sin desbordes en móvil.
 */
export function PerformanceChart({ points, className }: { points: SeriesPt[]; className?: string }) {
  const uid = useId().replace(/:/g, "");
  const titleId = `chart-title-${uid}`;
  const descId = `chart-desc-${uid}`;
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
    return {
      ys,
      x,
      y,
      line,
      ticks,
      shown,
      first: points[0].date,
      last: points[points.length - 1].date,
      lastValue: ys[ys.length - 1],
    };
  }, [points]);

  if (!model) {
    return (
      <div className={cn("flex h-full flex-col items-center justify-center gap-1 px-3 text-center", className)}>
        <p className="text-[12px] text-ink-500">Sin serie todavía</p>
        <p className="text-[11px] leading-snug text-ink-500">Cuando haya cierres, aquí verás el retorno acumulado.</p>
      </div>
    );
  }

  const onMove = (clientX: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    const rel = ((clientX - r.left) / r.width) * W;
    const t = (rel - PAD.l) / (W - PAD.l - PAD.r);
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(t * (points.length - 1)))));
  };

  const hv = hover !== null ? model.ys[hover] : null;
  const hx = hover !== null ? model.x(hover) : 0;
  const tipPct = (hx / W) * 100;
  const tipStyle: CSSProperties =
    tipPct < 30 ? { left: 0 } : tipPct > 70 ? { right: 0 } : { left: `${tipPct}%`, transform: "translateX(-50%)" };

  return (
    <div className={cn("relative flex", className)}>
      <div className="relative min-w-0 flex-1">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-full w-full touch-pan-y select-none"
          role="img"
          aria-labelledby={`${titleId} ${descId}`}
          onPointerMove={(e) => onMove(e.clientX)}
          onPointerDown={(e) => onMove(e.clientX)}
          onPointerLeave={() => setHover(null)}
          onPointerCancel={() => setHover(null)}
        >
          <title id={titleId}>Rendimiento acumulado</title>
          <desc id={descId}>
            {`Serie de ${points.length} cierres, del ${fmtDate(model.first)} al ${fmtDate(model.last)}. Variación acumulada ${formatSignedPct(model.lastValue, 2)} desde el primer punto visible.`}
          </desc>
          {model.ticks.map((t) => (
            <line
              key={t}
              x1={PAD.l}
              x2={W - PAD.r}
              y1={model.y(t)}
              y2={model.y(t)}
              stroke={t === 0 ? "var(--text-faint)" : "var(--line)"}
              strokeDasharray={t === 0 ? undefined : "2 5"}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path
            d={model.line}
            fill="none"
            stroke="var(--text)"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {hover !== null && hv !== null && (
            <line
              x1={hx}
              x2={hx}
              y1={PAD.t}
              y2={H - PAD.b}
              stroke="var(--text-faint)"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {model.shown.map((m) => (
          <span
            key={m.i}
            aria-hidden="true"
            className="absolute bottom-0 -translate-x-1/2 text-[11px] text-ink-500"
            style={{ left: `${Math.min(94, Math.max(6, (model.x(m.i) / W) * 100))}%` }}
          >
            {m.label}
          </span>
        ))}

        {hover !== null && hv !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 border border-line bg-app-card px-2 py-1 text-[11px] whitespace-nowrap text-ink-900"
            style={tipStyle}
          >
            <span className="text-ink-500">{fmtDate(points[hover].date)}</span>
            <span className="mx-1.5 text-ink-500">·</span>
            <span className="num">{formatSignedPct(hv, 2)}</span>
          </div>
        )}
      </div>

      <div className="relative w-11 shrink-0" aria-hidden="true">
        {model.ticks.map((t) => (
          <span
            key={t}
            className="num absolute right-0 -translate-y-1/2 text-[11px] leading-none text-ink-500"
            style={{ top: `${Math.min(96, Math.max(4, (model.y(t) / H) * 100))}%` }}
          >
            {fmtTick(t)}
          </span>
        ))}
      </div>
    </div>
  );
}
