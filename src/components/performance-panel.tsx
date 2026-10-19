"use client";

import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from "react";
import Link from "next/link";
import type { PerformanceMetrics, SeriesPoint } from "@/lib/performance";

export interface PerformancePanelProps {
  /** Métricas ya calculadas en el servidor. null => estado vacío. */
  metrics: PerformanceMetrics | null;
  /** Serie del portafolio normalizada a base 100 (alineada con benchmark). */
  portfolioSeries: SeriesPoint[];
  /** Serie del benchmark normalizada a base 100. */
  benchmarkSeries: SeriesPoint[];
  /** Etiqueta del benchmark ("S&P 500", "IPSA"). */
  benchmarkLabel: string;
  /** Cómo se obtuvieron los datos (transparencia metodológica). */
  method: "precalculado" | "calculado-al-vuelo" | "sin-datos" | "demo";
  /** Fecha del último dato (YYYY-MM-DD) para "al día X". */
  asOf?: string | null;
  /** Aviso cuando los datos no son reales (modo demo). */
  demo?: boolean;
}

const VB_W = 640;
const VB_H = 220;
const PAD_Y = 10;

function parseTime(date: string): number {
  const iso = date.includes("T") ? date : `${date.slice(0, 10)}T00:00:00Z`;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? time : Number.NaN;
}

function formatDate(date: string): string {
  const time = parseTime(date);
  if (!Number.isFinite(time)) return date;
  return new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(time));
}

function fmt(value: number | null | undefined, digits = 1, suffix = "%"): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}${suffix}`;
}

/** Curva comparativa portafolio (negro) vs benchmark (gris punteado). */
function BenchmarkChart({
  portfolio,
  benchmark,
  benchmarkLabel,
}: {
  portfolio: SeriesPoint[];
  benchmark: SeriesPoint[];
  benchmarkLabel: string;
}) {
  const pathRef = useRef<SVGPathElement>(null);
  const gradId = `perf-${useId().replace(/:/g, "")}`;
  const [active, setActive] = useState<number | null>(null);

  const points = useMemo(
    () =>
      portfolio
        .filter((p) => Number.isFinite(p.value) && Number.isFinite(parseTime(p.date)))
        .sort((x, y) => parseTime(x.date) - parseTime(y.date)),
    [portfolio],
  );
  const benchMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of benchmark) map.set(p.date, p.value);
    return map;
  }, [benchmark]);

  const all = useMemo(
    () => [...points.map((p) => p.value), ...[...benchMap.values()]],
    [points, benchMap],
  );
  let min = Math.min(...(all.length ? all : [0]));
  let max = Math.max(...(all.length ? all : [1]));
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    min = Math.min(0, min);
    max = min + 1;
  }
  const mid = (min + max) / 2;

  function yOf(value: number): number {
    return PAD_Y + (1 - (value - min) / (max - min)) * (VB_H - PAD_Y * 2);
  }

  const coords = points.map((point, index) => ({
    x: points.length === 1 ? VB_W / 2 : (index / (points.length - 1)) * VB_W,
    y: yOf(point.value),
  }));
  const linePath =
    coords.length < 2
      ? ""
      : coords
          .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`)
          .join(" ");

  const benchCoords = points.map((point, index) => {
    const value = benchMap.get(point.date);
    return {
      x: points.length === 1 ? VB_W / 2 : (index / (points.length - 1)) * VB_W,
      y: value === undefined ? null : yOf(value),
    };
  });
  const benchPath =
    benchCoords.length < 2
      ? ""
      : benchCoords
          .filter((c) => c.y !== null)
          .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(2)} ${(c.y as number).toFixed(2)}`)
          .join(" ");

  useEffect(() => {
    const path = pathRef.current;
    if (!path || !linePath) return;
    const measured = path.getTotalLength();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    path.style.transition = "none";
    path.style.strokeDasharray = `${measured}`;
    path.style.strokeDashoffset = reduce ? "0" : `${measured}`;
    if (reduce) return;
    let frame = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          frame = requestAnimationFrame(() => {
            path.style.transition = "stroke-dashoffset 1.4s cubic-bezier(0.16, 1, 0.3, 1)";
            path.style.strokeDashoffset = "0";
          });
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(path);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [linePath]);

  function selectAt(event: PointerEvent<HTMLDivElement>) {
    if (points.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    setActive(Math.round(ratio * (points.length - 1)));
  }

  if (points.length === 0) return null;

  const tipIndex = active;
  const tip = tipIndex !== null ? points[tipIndex] : undefined;
  const tipCoord = tipIndex !== null ? coords[tipIndex] : undefined;
  const tipX = tipCoord ? (tipCoord.x / VB_W) * 100 : 0;
  const tipY = tipCoord ? (tipCoord.y / VB_H) * 100 : 0;
  const tipBench = tipIndex !== null ? benchMap.get(points[tipIndex].date) : undefined;
  const zeroY = yOf(100);

  return (
    <figure className="w-full">
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3">
        <div className="relative h-44 sm:h-56" aria-hidden="true">
          {[
            { value: max },
            { value: mid },
            { value: min },
          ].map((mark, i) => (
            <span
              key={i}
              className="absolute right-0 -translate-y-1/2 text-[11px] tabular-nums text-ink-500"
              style={{ top: `${(yOf(mark.value) / VB_H) * 100}%` }}
            >
              {mark.value.toFixed(0)}
            </span>
          ))}
        </div>
        <div
          className="relative h-44 sm:h-56"
          onPointerMove={selectAt}
          onPointerDown={selectAt}
          onPointerLeave={() => setActive(null)}
        >
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            className="h-full w-full overflow-visible"
            preserveAspectRatio="none"
            role="img"
            aria-label={`Rendimiento acumulado del portafolio contra ${benchmarkLabel}`}
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0a0a0a" stopOpacity="0.07" />
                <stop offset="100%" stopColor="#0a0a0a" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* Línea base 100 */}
            {min < 100 && max > 100 ? (
              <line
                x1="0"
                y1={zeroY}
                x2={VB_W}
                y2={zeroY}
                stroke="#0a0a0a"
                strokeWidth="1"
                strokeDasharray="2 4"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {benchPath ? (
              <path
                d={benchPath}
                fill="none"
                stroke="#8a8a8a"
                strokeWidth="1.5"
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {linePath ? (
              <>
                <path
                  d={`${linePath} L ${VB_W} ${VB_H} L 0 ${VB_H} Z`}
                  fill={`url(#${gradId})`}
                  stroke="none"
                />
                <path
                  ref={pathRef}
                  d={linePath}
                  fill="none"
                  stroke="#0a0a0a"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </>
            ) : null}
          </svg>
          {tip && tipCoord ? (
            <>
              <div
                className="pointer-events-none absolute top-0 bottom-0 w-px bg-ink-200"
                style={{ left: `${tipX}%` }}
              />
              <div
                className="pointer-events-none absolute z-10 border border-ink-200 bg-white px-2.5 py-1.5"
                style={{
                  left: `${tipX}%`,
                  top: `${tipY}%`,
                  transform:
                    tipY < 28
                      ? tipX < 18
                        ? "translate(0, 10px)"
                        : tipX > 82
                          ? "translate(-100%, 10px)"
                          : "translate(-50%, 10px)"
                      : tipX < 18
                        ? "translate(0, calc(-100% - 10px))"
                        : tipX > 82
                          ? "translate(-100%, calc(-100% - 10px))"
                          : "translate(-50%, calc(-100% - 10px))",
                }}
              >
                <p className="text-[11px] text-ink-500">{formatDate(tip.date)}</p>
                <p className="num text-[13px] text-ink-900">
                  Portafolio {tip.value.toFixed(1)}
                </p>
                {tipBench !== undefined ? (
                  <p className="num text-[13px] text-ink-500">
                    {benchmarkLabel} {tipBench.toFixed(1)}
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
        <div />
        <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-ink-500">
          <span>{formatDate(points[0].date)}</span>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-px w-4 bg-ink-900" aria-hidden="true" />
              Portafolio
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-px w-4 border-t border-dashed border-ink-400" aria-hidden="true" />
              {benchmarkLabel}
            </span>
          </span>
          <span>{formatDate(points[points.length - 1].date)}</span>
        </div>
      </div>
    </figure>
  );
}

/**
 * Panel de rendimiento vs benchmark: curva comparativa, Sharpe, máxima
 * caída, volatilidad y exceso de retorno. Muestra el motivo cuando no hay
 * datos suficientes — nunca un número inventado.
 */
export function PerformancePanel({
  metrics,
  portfolioSeries,
  benchmarkSeries,
  benchmarkLabel,
  method,
  asOf,
  demo = false,
}: PerformancePanelProps) {
  const hasMetrics = metrics !== null;
  const hasChart = portfolioSeries.length >= 2;

  if (!hasMetrics && !hasChart) {
    return (
      <section aria-labelledby="perf-heading">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="perf-heading" className="text-[15px] font-medium text-ink-900">
            Rendimiento vs {benchmarkLabel}
          </h2>
        </div>
        <p className="mt-4 border border-ink-200 px-3 py-8 text-[13px] text-ink-500">
          Sin datos suficientes todavía. La comparación contra {benchmarkLabel} aparece
          cuando este portafolio acumula historial de precios.{" "}
          <Link href="/metodologia" className="underline underline-offset-4 hover:text-ink-900">
            Ver metodología
          </Link>
          .
        </p>
      </section>
    );
  }

  const excess = metrics?.excessReturnPct ?? null;
  const sharpe = metrics?.sharpe ?? null;
  const drawdown = metrics?.maxDrawdownPct ?? null;
  const volatility = metrics?.volatilityPct ?? null;
  const total = metrics?.totalReturnPct ?? null;
  const winRate = metrics?.winRatePct ?? null;

  const methodLabel =
    method === "precalculado"
      ? "Métricas precalculadas por el scraper"
      : method === "calculado-al-vuelo"
        ? "Calculado al vuelo desde la serie de precios"
        : method === "demo"
          ? "Datos de ejemplo"
          : "";

  return (
    <section aria-labelledby="perf-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 id="perf-heading" className="text-[15px] font-medium text-ink-900">
          Rendimiento vs {benchmarkLabel}
        </h2>
        <p className="text-[13px] text-ink-500">
          {demo ? (
            <span>Datos de ejemplo · </span>
          ) : null}
          {asOf ? `Al ${formatDate(asOf)} · ` : ""}
          {methodLabel ? (
            <span>
              {methodLabel} ·{" "}
              <Link href="/metodologia" className="underline underline-offset-4 hover:text-ink-900">
                metodología
              </Link>
            </span>
          ) : (
            <Link href="/metodologia" className="underline underline-offset-4 hover:text-ink-900">
              metodología
            </Link>
          )}
        </p>
      </div>

      {demo ? (
        <p className="mt-2 text-[13px] text-ink-500">Datos de ejemplo, no reales.</p>
      ) : null}

      {hasChart ? (
        <div className="mt-6">
          <BenchmarkChart
            portfolio={portfolioSeries}
            benchmark={benchmarkSeries}
            benchmarkLabel={benchmarkLabel}
          />
        </div>
      ) : null}

      <dl className="mt-8 grid grid-cols-2 gap-px border border-ink-200 bg-ink-200 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCell label="Retorno" value={fmt(total)} tone={total !== null ? (total > 0 ? "positive" : "negative") : undefined} />
        <MetricCell label={`vs ${benchmarkLabel}`} value={fmt(excess, 1, " pp")} tone={excess !== null ? (excess > 0 ? "positive" : excess < 0 ? "negative" : undefined) : undefined} />
        <MetricCell label="Sharpe" value={sharpe !== null ? sharpe.toFixed(2) : null} tone={sharpe !== null ? (sharpe > 0 ? "positive" : "negative") : undefined} />
        <MetricCell label="Máx. caída" value={drawdown !== null ? `-${drawdown.toFixed(1)}%` : null} tone="negative" />
        <MetricCell label="Volatilidad" value={fmt(volatility, 1, "%")} />
        <MetricCell label="Le gana al índice" value={winRate !== null ? `${winRate.toFixed(0)}% de los días` : null} />
      </dl>

      {metrics && metrics.reasons.length > 0 ? (
        <p className="mt-3 text-[12px] leading-relaxed text-ink-500">
          {metrics.reasons.join(" ")}
        </p>
      ) : null}

      <p className="mt-6 text-xs leading-relaxed text-ink-500">
        Estimación basada en información pública y precios de cierre; no constituye
        asesoría de inversión. Reclu no ejecuta órdenes.{" "}
        <Link href="/metodologia" className="underline underline-offset-4 hover:text-ink-900">
          Cómo calculamos estos números
        </Link>
        .
      </p>
    </section>
  );
}

function MetricCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | null;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="bg-white p-4">
      <dt className="text-[12px] text-ink-500">{label}</dt>
      <dd
        className={
          "num mt-1.5 text-[17px] leading-none tracking-[-0.02em] " +
          (tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "text-ink-900")
        }
      >
        {value ?? <span className="text-ink-400">—</span>}
      </dd>
    </div>
  );
}
