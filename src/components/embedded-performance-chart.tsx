"use client";
import { formatPctPlain } from "@/lib/utils";

import { useMemo } from "react";
import type { PerformanceMetrics, SeriesPoint } from "@/lib/performance";

/**
 * Mini gráfico de rendimiento para iframes (medios/creadores).
 * Autónomo: sin header/nav, marca "Datos de reclu.cl" siempre visible,
 * curva negra del portafolio vs benchmark punteado.
 */
export function EmbeddedPerformanceChart({
  name,
  slug,
  benchmarkLabel,
  portfolioSeries,
  benchmarkSeries,
  metrics,
}: {
  name: string;
  slug: string;
  benchmarkLabel: string;
  portfolioSeries: SeriesPoint[];
  benchmarkSeries: SeriesPoint[];
  metrics: PerformanceMetrics | null;
}) {
  const VB_W = 640;
  const VB_H = 200;
  const PAD = 12;

  const { path, benchPath, min, max, firstDate, lastDate } = useMemo(() => {
    const parse = (date: string) => Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
    const points = portfolioSeries
      .filter((p) => Number.isFinite(p.value) && Number.isFinite(parse(p.date)))
      .sort((a, b) => parse(a.date) - parse(b.date));
    const benchMap = new Map<string, number>();
    for (const p of benchmarkSeries) benchMap.set(p.date, p.value);

    if (points.length < 2) {
      return { path: "", benchPath: "", min: 0, max: 1, firstDate: "", lastDate: "" };
    }

    const values = [
      ...points.map((p) => p.value),
      ...points.map((p) => benchMap.get(p.date) ?? Number.NaN).filter(Number.isFinite),
    ];
    let mn = Math.min(...values);
    let mx = Math.max(...values);
    if (!Number.isFinite(mn) || !Number.isFinite(mx) || mn === mx) {
      mn = Math.min(100, mn);
      mx = mn + 1;
    }

    const yOf = (v: number) => PAD + (1 - (v - mn) / (mx - mn)) * (VB_H - PAD * 2);
    const d = points
      .map((p, i) => {
        const x = (i / (points.length - 1)) * VB_W;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${yOf(p.value).toFixed(2)}`;
      })
      .join(" ");
    const benchD = points
      .map((p, i) => {
        const v = benchMap.get(p.date);
        if (v === undefined) return null;
        const x = (i / (points.length - 1)) * VB_W;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${yOf(v).toFixed(2)}`;
      })
      .filter(Boolean)
      .join(" ");

    return {
      path: d,
      benchPath: benchD,
      min: mn,
      max: mx,
      firstDate: points[0].date,
      lastDate: points[points.length - 1].date,
    };
  }, [portfolioSeries, benchmarkSeries]);

  const total = metrics?.totalReturnPct ?? null;
  const excess = metrics?.excessReturnPct ?? null;

  function fmtDate(date: string): string {
    if (!date) return "";
    return new Intl.DateTimeFormat("es-CL", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${date}T00:00:00Z`));
  }

  return (
    <div className="flex h-screen w-full flex-col bg-white px-5 py-4">
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-medium tracking-[-0.02em] text-ink-900">
            {name}
          </h1>
          <p className="mt-0.5 text-[11px] text-ink-500">
            Rendimiento estimado vs {benchmarkLabel}
            {lastDate ? ` · al ${fmtDate(lastDate)}` : ""}
          </p>
        </div>
        {total !== null ? (
          <p
            className={
              "num shrink-0 text-[22px] font-medium leading-none tracking-[-0.02em] " +
              (total > 0 ? "text-positive" : total < 0 ? "text-negative" : "text-ink-900")
            }
          >
            {total > 0 ? "+" : ""}
            {formatPctPlain(total, 1)}
          </p>
        ) : null}
      </div>

      {path ? (
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="mt-3 w-full flex-1"
          preserveAspectRatio="none"
          role="img"
          aria-label={`Rendimiento de ${name} contra ${benchmarkLabel}`}
        >
          {min < 100 && max > 100 ? (
            <line
              x1="0"
              y1={PAD + (1 - (100 - min) / (max - min)) * (VB_H - PAD * 2)}
              x2={VB_W}
              y2={PAD + (1 - (100 - min) / (max - min)) * (VB_H - PAD * 2)}
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
          <path
            d={path}
            fill="none"
            stroke="#0a0a0a"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : (
        <div className="mt-3 flex flex-1 items-center justify-center border border-ink-200">
          <p className="px-4 text-center text-[12px] text-ink-500">
            Sin datos de rendimiento suficientes para {name}.
          </p>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-ink-500">
        <span className="flex items-center gap-3">
          {excess !== null ? (
            <span>
              vs {benchmarkLabel}:{" "}
              <span className={excess > 0 ? "text-positive" : "text-negative"}>
                {excess > 0 ? "+" : ""}
                {excess.toFixed(1)} pp
              </span>
            </span>
          ) : (
            <span>Estimación con información pública</span>
          )}
        </span>
        <span className="flex items-center gap-1.5">
          {path ? <span>{fmtDate(firstDate)} – {fmtDate(lastDate)}</span> : null}
          <a
            href={`/portfolio/${slug}`}
            className="font-medium text-ink-900 underline underline-offset-4"
            target="_top"
            rel="noreferrer"
          >
            Datos de fraccion.si
          </a>
        </span>
      </div>
    </div>
  );
}
