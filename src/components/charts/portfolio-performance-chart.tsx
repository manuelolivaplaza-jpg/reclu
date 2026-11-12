"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { formatSignedPct } from "@/lib/utils";
import Link from "next/link";

export interface ChartPoint {
  date: string;
  value: number;
}

export interface PortfolioPerformanceChartProps {
  /** Serie del portafolio (niveles, p.ej. base 100). */
  series: ChartPoint[];
  /** Serie del benchmark en la misma escala (opcional). */
  benchmark?: ChartPoint[];
  benchmarkLabel?: string;
  /**
   * Plan gratis: periodos con más días quedan bloqueados (muro de pago).
   * null = sin límite. Los periodos sin datos suficientes no se muestran.
   */
  maxFreeDays?: number | null;
  /** Última fecha estimada (posiciones actuales); ese tramo va punteado y gris. */
  estimatedUntil?: string | null;
}

const PERIODS = [
  { key: "1S", label: "1S", days: 7 },
  { key: "1M", label: "1M", days: 30 },
  { key: "3M", label: "3M", days: 90 },
  { key: "6M", label: "6M", days: 182 },
  { key: "1A", label: "1A", days: 365 },
] as const;
type PeriodKey = (typeof PERIODS)[number]["key"];

const W = 720;
const H = 260;
const PAD_T = 16;
const PAD_B = 28;
const DAY = 86_400_000;

function clean(points: ChartPoint[] | undefined): { t: number; v: number; date: string }[] {
  if (!Array.isArray(points)) return [];
  return points
    .map((p) => ({ t: Date.parse(String(p?.date ?? "")), v: Number(p?.value), date: String(p?.date ?? "") }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v) && p.v > 0)
    .sort((a, b) => a.t - b.t);
}

/** Curva suave monotona (Fritsch-Carlson) -> path SVG. */
function smoothPath(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M ${pts[0].x} ${pts[0].y}`;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x || 1e-6);
    m.push((pts[i + 1].y - pts[i].y) / (dx[i] || 1e-6));
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C ${(pts[i].x + h).toFixed(2)} ${(pts[i].y + t[i] * h).toFixed(2)}, ${(pts[i + 1].x - h).toFixed(2)} ${(pts[i + 1].y - t[i + 1] * h).toFixed(2)}, ${pts[i + 1].x.toFixed(2)} ${pts[i + 1].y.toFixed(2)}`;
  }
  return d;
}

/** Cifra con signo; null cuando no hay dato (nunca un placeholder). */
function fmtPct(v: number | null | undefined): string | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  return formatSignedPct(v, 2);
}

function fmtDate(t: number): string {
  try {
    return new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
      new Date(t),
    );
  } catch {
    return "";
  }
}

/**
 * Rendimiento del portafolio por período. Línea negra de 1.5px sobre grilla de
 * filetes; benchmark en gris punteado y tramo estimado en gris punto. El
 * selector es rectangular (radio 0) y el lienzo se recorre con el teclado.
 */
export function PortfolioPerformanceChart({
  series,
  benchmark,
  benchmarkLabel = "S&P 500",
  maxFreeDays = null,
  estimatedUntil = null,
}: PortfolioPerformanceChartProps) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const estT = estimatedUntil ? Date.parse(estimatedUntil) : NaN;
  const port = useMemo(() => clean(series), [series]);
  const bench = useMemo(() => clean(benchmark), [benchmark]);
  const lastT = port.length ? port[port.length - 1].t : 0;

  const isLocked = (days: number) => maxFreeDays != null && days > maxFreeDays;
  const hasData = (days: number) => port.filter((p) => p.t >= lastT - days * DAY).length >= 2;

  // Selector: los períodos bloqueados por plan se mantienen (son el muro de
  // pago); los que no tienen datos suficientes se omiten, no se muestran vacíos.
  const shown = PERIODS.filter((p) => isLocked(p.days) || hasData(p.days));
  const usable = PERIODS.filter((p) => !isLocked(p.days) && hasData(p.days));

  const defaultKey: PeriodKey = useMemo(() => {
    const open = PERIODS.filter((p) => !isLocked(p.days) && hasData(p.days));
    return (open[open.length - 1] ?? PERIODS[0]).key;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [port, maxFreeDays]);
  const [picked, setPicked] = useState<PeriodKey | null>(null);
  // Si el período elegido deja de existir (muro o falta de datos), se cae al
  // período por defecto en vez de pintar un gráfico vacío.
  const periodKey: PeriodKey = picked !== null && usable.some((p) => p.key === picked) ? picked : defaultKey;
  const period = PERIODS.find((p) => p.key === periodKey) ?? PERIODS[0];

  const view = useMemo(() => {
    const from = lastT - period.days * DAY;
    const p = port.filter((x) => x.t >= from);
    if (p.length < 2) return null;
    const base = p[0].v;
    const pp = p.map((x) => ({ t: x.t, pct: (x.v / base - 1) * 100 }));
    const bRaw = bench.filter((x) => x.t >= from && x.t <= lastT);
    const bb = bRaw.length >= 2 ? bRaw.map((x) => ({ t: x.t, pct: (x.v / bRaw[0].v - 1) * 100 })) : [];
    const t0 = pp[0].t;
    const t1 = pp[pp.length - 1].t;
    const all = [...pp.map((x) => x.pct), ...bb.map((x) => x.pct), 0];
    const yMinRaw = Math.min(...all);
    const yMaxRaw = Math.max(...all);
    let lo = yMinRaw;
    let hi = yMaxRaw;
    if (hi - lo < 0.5) {
      hi += 0.25;
      lo -= 0.25;
    }
    const pad = (hi - lo) * 0.08;
    lo -= pad;
    hi += pad;
    const x = (t: number) => (t1 === t0 ? 0 : ((t - t0) / (t1 - t0)) * W);
    const y = (v: number) => PAD_T + (1 - (v - lo) / (hi - lo)) * (H - PAD_T - PAD_B);
    const pxy = pp.map((d) => ({ x: x(d.t), y: y(d.pct) }));
    const bxy = bb.map((d) => ({ x: x(d.t), y: y(d.pct) }));
    const line = smoothPath(pxy);
    // Tramo estimado: puntos hasta estT (incluido el de empalme), punteado.
    const cut = Number.isFinite(estT) ? pp.findIndex((d) => d.t > estT) : 0;
    const estCount = cut === -1 ? pp.length : cut;
    const estLine = estCount >= 1 ? smoothPath(pxy.slice(0, Math.min(estCount + 1, pxy.length))) : "";
    const realLine = estCount >= 1 ? smoothPath(pxy.slice(Math.max(estCount - 0, 0))) : line;
    return {
      pp,
      bb,
      pxy,
      line,
      estLine,
      realLine,
      hasEst: estCount >= 1,
      bline: smoothPath(bxy),
      zeroY: y(0),
      last: pp[pp.length - 1].pct,
      t0,
      t1,
      x,
      y,
      yMinRaw,
      yMaxRaw,
    };
  }, [port, bench, lastT, period.days, estT]);

  const [hover, setHover] = useState<number | null>(null);
  // Sin serie utilizable no hay gráfico: ni cifra ni contenedor vacío.
  if (port.length < 2 || usable.length === 0 || !view) return null;

  const hp = hover !== null ? (view.pp[hover] ?? null) : null;
  const hb =
    hp && view.bb.length
      ? view.bb.reduce((a, b) => (Math.abs(b.t - hp.t) < Math.abs(a.t - hp.t) ? b : a))
      : null;
  const displayPct = hp ? hp.pct : view.last;
  const headline = fmtPct(displayPct);
  const benchPct = view.bb.length ? fmtPct(hb ? hb.pct : view.bb[view.bb.length - 1].pct) : null;
  const hoverPort = hp ? fmtPct(hp.pct) : null;
  const hoverBench = hb ? fmtPct(hb.pct) : null;
  const anyLocked = PERIODS.some((p) => isLocked(p.days));
  const showZero = view.yMinRaw < -0.05 && view.yMaxRaw > 0.05;

  const ticks = [view.yMaxRaw, (view.yMinRaw + view.yMaxRaw) / 2, view.yMinRaw].filter(
    (value, index, arr) => arr.findIndex((other) => Math.abs(other - value) < 0.05) === index,
  );

  function onMove(clientX: number, rect: DOMRect) {
    if (!view) return;
    const rel = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestD = Infinity;
    view.pxy.forEach((p, i) => {
      const d = Math.abs(p.x - rel);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover(best);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!view) return;
    const last = view.pxy.length - 1;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      setHover((h) => Math.min(last, (h ?? -1) + 1));
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      setHover((h) => Math.max(0, (h ?? last + 1) - 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      setHover(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setHover(last);
    } else if (event.key === "Escape") {
      setHover(null);
    }
  }

  const summary =
    headline !== null
      ? `Rendimiento ${period.label}: ${headline}${benchPct !== null ? `, ${benchmarkLabel} ${benchPct}` : ""}.`
      : `Rendimiento ${period.label}.`;

  return (
    <section className="app-panel p-5 sm:p-7" aria-labelledby={`${id}-label`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p id={`${id}-label`} className="label-line">
            Rendimiento {"\u00b7"} {period.label}
          </p>
          {headline !== null ? (
            <p
              className={
                "num mt-1 text-[2rem] leading-none " + (displayPct >= 0 ? "text-positive" : "text-negative")
              }
            >
              {headline}
            </p>
          ) : null}
          {benchPct !== null ? (
            <p className="mt-2 text-[13px] text-ink-500">
              {benchmarkLabel}: <span className="num">{benchPct}</span>
            </p>
          ) : null}
        </div>
        <div role="group" aria-label="Período del gráfico" className="inline-flex border border-line">
          {shown.map((p) => {
            const locked = isLocked(p.days);
            const active = p.key === periodKey;
            return (
              <button
                key={p.key}
                type="button"
                disabled={locked}
                aria-pressed={active}
                aria-label={locked ? `${p.label}, disponible en Pro` : p.label}
                title={locked ? "Disponible en Pro" : undefined}
                onClick={() => {
                  setPicked(p.key);
                  setHover(null);
                }}
                className={
                  "inline-flex min-h-10 items-center justify-center gap-1.5 border-l border-line px-2.5 text-[13px] tabular-nums transition-colors first:border-l-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] " +
                  (active
                    ? "bg-ink-900 text-white focus-visible:outline-white"
                    : locked
                      ? "cursor-not-allowed text-ink-400"
                      : "text-ink-500 hover:text-ink-900")
                }
              >
                {p.label}
                {locked ? <span className="text-[11px] font-normal text-ink-500">Pro</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6">
        <div className="grid grid-cols-1 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-x-3">
          <div className="relative hidden h-56 sm:block sm:h-64" aria-hidden="true">
            {ticks.map((tick, index) => (
              <span
                key={index}
                className="num absolute right-0 whitespace-nowrap text-[11px] text-ink-500"
                style={{
                  top: `${(view.y(tick) / H) * 100}%`,
                  transform: index === 0 ? "translateY(0)" : index === ticks.length - 1 ? "translateY(-100%)" : "translateY(-50%)",
                }}
              >
                {formatSignedPct(tick, 1)}
              </span>
            ))}
          </div>

          <div
            className="relative h-56 touch-pan-y sm:h-64"
            tabIndex={0}
            role="group"
            aria-label="Gráfico de rendimiento"
            aria-describedby={`${id}-hint`}
            onPointerMove={(e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect())}
            onPointerDown={(e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect())}
            onPointerLeave={(event) => {
              if (event.pointerType !== "touch") setHover(null);
            }}
            onKeyDown={handleKeyDown}
            onBlur={() => setHover(null)}
          >
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="h-full w-full"
              role="img"
              aria-labelledby={`${id}-title ${id}-desc`}
            >
              <title id={`${id}-title`}>Rendimiento del portafolio, {period.label}</title>
              <desc id={`${id}-desc`}>{summary}</desc>

              {ticks.map((tick, index) => (
                <line
                  key={index}
                  x1="0"
                  x2={W}
                  y1={view.y(tick)}
                  y2={view.y(tick)}
                  className="stroke-line"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {showZero ? (
                <line
                  x1="0"
                  x2={W}
                  y1={view.zeroY}
                  y2={view.zeroY}
                  className="stroke-ink-400"
                  strokeWidth={1}
                  strokeDasharray="2 4"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
              {view.bb.length ? (
                <path
                  d={view.bline}
                  fill="none"
                  className="stroke-ink-500"
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
              {view.hasEst ? (
                <path
                  d={view.estLine}
                  fill="none"
                  className="stroke-ink-400"
                  strokeWidth={1.5}
                  strokeDasharray="2 3"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
              <path
                d={view.realLine}
                fill="none"
                className="stroke-line-strong"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              {hover !== null && view.pxy[hover] ? (
                <line
                  x1={view.pxy[hover].x}
                  x2={view.pxy[hover].x}
                  y1={PAD_T}
                  y2={H - PAD_B}
                  className="stroke-ink-300"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
            </svg>

            {hover !== null && view.pxy[hover] && hp ? (
              <>
                <span
                  className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 border border-app-card bg-ink-900"
                  style={{ left: `${(view.pxy[hover].x / W) * 100}%`, top: `${(view.pxy[hover].y / H) * 100}%` }}
                />
                <div
                  className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 border border-line bg-app-card px-2.5 py-1.5 text-[12px]"
                  aria-hidden="true"
                  style={{ left: `${Math.min(85, Math.max(15, (view.pxy[hover].x / W) * 100))}%` }}
                >
                  <p className="text-[11px] text-ink-500">{fmtDate(hp.t)}</p>
                  {hoverPort !== null ? (
                    <p className="text-[12px] text-ink-900">
                      Portafolio <span className={"num " + (hp.pct >= 0 ? "text-positive" : "text-negative")}>{hoverPort}</span>
                    </p>
                  ) : null}
                  {hoverBench !== null ? (
                    <p className="num text-ink-500">
                      {benchmarkLabel} {hoverBench}
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>

          <div className="hidden sm:block" aria-hidden="true" />
          <div className="num mt-2 flex justify-between gap-3 text-[11px] text-ink-500">
            <span>{fmtDate(view.t0)}</span>
            <span>{fmtDate(view.t1)}</span>
          </div>
        </div>

        {view.bb.length || view.hasEst ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-ink-500">
            {view.hasEst ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0 w-4 border-t border-dotted border-ink-400" aria-hidden="true" />
                Estimado con posiciones actuales
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              <span className="h-px w-4 bg-ink-900" aria-hidden="true" />
              Portafolio
            </span>
            {view.bb.length ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0 w-4 border-t border-dashed border-ink-500" aria-hidden="true" />
                {benchmarkLabel}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <p id={`${id}-hint`} className="sr-only">
        Gráfico interactivo. Usa las flechas izquierda y derecha para recorrer las fechas y Esc para salir.
      </p>
      <p className="sr-only" aria-live="polite">
        {hp ? `${fmtDate(hp.t)}: portafolio ${hoverPort ?? "sin dato"}.` : ""}
        {hb && hoverBench ? ` ${benchmarkLabel} ${hoverBench}.` : ""}
      </p>

      {anyLocked ? (
        <p className="mt-4 text-[13px] text-ink-500">
          El plan gratis muestra hasta 3 meses.{" "}
          <Link href="/upgrade" className="font-medium text-ink-900 underline-offset-4 hover:underline">
            Desbloquear con Pro
          </Link>
        </p>
      ) : null}
    </section>
  );
}
