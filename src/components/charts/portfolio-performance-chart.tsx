"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";

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
  /** Plan gratis: periodos con mas dias quedan bloqueados. null = sin limite. */
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

function fmtPct(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function fmtDate(t: number): string {
  try {
    return new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(t));
  } catch {
    return "";
  }
}

export function PortfolioPerformanceChart({
  series,
  benchmark,
  benchmarkLabel = "S&P 500",
  maxFreeDays = null,
  estimatedUntil = null,
}: PortfolioPerformanceChartProps) {
  const estT = estimatedUntil ? Date.parse(estimatedUntil) : NaN;
  const port = useMemo(() => clean(series), [series]);
  const bench = useMemo(() => clean(benchmark), [benchmark]);
  const lastT = port.length ? port[port.length - 1].t : 0;

  const isLocked = (days: number) => maxFreeDays != null && days > maxFreeDays;
  const hasData = (days: number) => port.filter((p) => p.t >= lastT - days * DAY).length >= 2;

  const defaultKey: PeriodKey = useMemo(() => {
    const usable = PERIODS.filter((p) => !isLocked(p.days));
    const withData = [...usable].reverse().find((p) => hasData(p.days));
    return (withData ?? usable[usable.length - 1] ?? PERIODS[0]).key;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [port, maxFreeDays]);
  const [picked, setPicked] = useState<PeriodKey | null>(null);
  const periodKey = picked ?? defaultKey;
  const period = PERIODS.find((p) => p.key === periodKey) ?? PERIODS[2];

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
    let lo = Math.min(...all);
    let hi = Math.max(...all);
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
    const area = `${line} L ${W} ${H - PAD_B} L 0 ${H - PAD_B} Z`;
    return { pp, bb, pxy, line, area, estLine, realLine, hasEst: estCount >= 1, bline: smoothPath(bxy), zeroY: y(0), last: pp[pp.length - 1].pct, t0, t1, x, y };
  }, [port, bench, lastT, period.days, estT]);

  const [hover, setHover] = useState<number | null>(null);
  const positive = (view?.last ?? 0) >= 0;
  const color = positive ? "var(--color-positive, #0f7a32)" : "var(--color-negative, #c81e1e)";
  const gradId = positive ? "rc-grad-pos" : "rc-grad-neg";

  const onMove = (clientX: number, rect: DOMRect) => {
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
  };

  const hp = view && hover !== null ? view.pp[hover] : null;
  const hb =
    hp && view && view.bb.length
      ? view.bb.reduce((a, b) => (Math.abs(b.t - hp.t) < Math.abs(a.t - hp.t) ? b : a))
      : null;
  const anyLocked = PERIODS.some((p) => isLocked(p.days));

  return (
    <section className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_rgba(16,24,40,0.08)] sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[13px] text-ink-500">Rendimiento {"\u00b7"} {period.label}</p>
          <p
            className="num mt-1 text-[2rem] font-semibold leading-none tracking-[-0.02em]"
            style={{ color: view ? color : undefined }}
          >
            {view ? fmtPct(hp ? hp.pct : view.last) : "—"}
          </p>
          {view && view.bb.length ? (
            <p className="mt-2 text-[13px] text-ink-500">
              {benchmarkLabel}: {fmtPct(hb ? hb.pct : view.bb[view.bb.length - 1].pct)}
            </p>
          ) : null}
        </div>
        <div className="flex gap-1 rounded-full bg-neutral-100 p-1">
          {PERIODS.map((p) => {
            const locked = isLocked(p.days);
            const active = p.key === periodKey;
            return (
              <button
                key={p.key}
                type="button"
                disabled={locked}
                onClick={() => {
                  setPicked(p.key);
                  setHover(null);
                }}
                title={locked ? "Disponible en Pro" : undefined}
                className={
                  "inline-flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-medium transition-colors " +
                  (active
                    ? "bg-white text-ink-900 shadow-sm"
                    : locked
                      ? "cursor-not-allowed text-ink-400"
                      : "text-ink-500 hover:text-ink-900")
                }
              >
                {locked ? <Lock className="size-3" strokeWidth={2} aria-hidden /> : null}
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {view ? (
        <div className="mt-6">
          <div className="relative">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="h-56 w-full touch-pan-y sm:h-64"
            onMouseMove={(e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect())}
            onMouseLeave={() => setHover(null)}
            onTouchMove={(e) => e.touches[0] && onMove(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}
            onTouchEnd={() => setHover(null)}
            role="img"
            aria-label={`Rendimiento ${period.label}: ${fmtPct(view.last)}`}
          >
            <defs>
              <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.22" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <line x1="0" x2={W} y1={view.zeroY} y2={view.zeroY} stroke="#e5e5e5" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
            <path d={view.area} fill={`url(#${gradId})`} />
            {view.bb.length ? (
              <path d={view.bline} fill="none" stroke="#a3a3a3" strokeWidth="1.5" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
            ) : null}
            {view.hasEst ? (
              <path d={view.estLine} fill="none" stroke="#a3a3a3" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            ) : null}
            <path d={view.realLine} fill="none" stroke={color} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {hover !== null && view.pxy[hover] ? (
              <line x1={view.pxy[hover].x} x2={view.pxy[hover].x} y1={PAD_T} y2={H - PAD_B} stroke="#d4d4d4" vectorEffect="non-scaling-stroke" />
            ) : null}
          </svg>
          {hover !== null && view.pxy[hover] && hp ? (
            <>
              <span
                className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                style={{ left: `${(view.pxy[hover].x / W) * 100}%`, top: `${(view.pxy[hover].y / H) * 100}%`, background: color }}
              />
              <div
                className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-xl bg-ink-900 px-3 py-2 text-[12px] text-white shadow-lg"
                style={{ left: `${Math.min(85, Math.max(15, (view.pxy[hover].x / W) * 100))}%` }}
              >
                <p className="text-white/70">{fmtDate(hp.t)}</p>
                <p className="num font-medium">Portafolio {fmtPct(hp.pct)}</p>
                {hb ? <p className="num text-white/80">{benchmarkLabel} {fmtPct(hb.pct)}</p> : null}
              </div>
            </>
          ) : null}
          </div>
          <div className="mt-2 flex justify-between text-[12px] text-ink-400">
            <span>{fmtDate(view.t0)}</span>
            <span>{fmtDate(view.t1)}</span>
          </div>
          {view.bb.length || view.hasEst ? (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-500">
              {view.hasEst ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-0 w-4 border-t-2 border-dotted border-neutral-400" /> Estimado con posiciones actuales
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded-full" style={{ background: color }} /> Portafolio
              </span>
              {view.bb.length ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0 w-4 border-t-2 border-dashed border-neutral-400" /> {benchmarkLabel}
              </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-6 flex h-48 flex-col items-center justify-center rounded-xl bg-neutral-50 text-center">
          <p className="text-[15px] font-medium text-ink-900">Aún no hay datos de rendimiento para este portafolio.</p>
          <p className="mt-1 max-w-sm text-[13px] text-ink-500">
            El gráfico aparecerá cuando tengamos precios suficientes de sus posiciones.
          </p>
        </div>
      )}

      {anyLocked ? (
        <p className="mt-4 text-[13px] text-ink-500">
          <Lock className="mr-1 inline size-3" strokeWidth={2} aria-hidden />
          El plan gratis muestra hasta 3 meses.{" "}
          <Link href="/upgrade" className="font-medium text-ink-900 underline-offset-4 hover:underline">
            Desbloquear con Pro
          </Link>
        </p>
      ) : null}
    </section>
  );
}
