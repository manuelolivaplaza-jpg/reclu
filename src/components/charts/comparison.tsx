"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatPercent } from "@/lib/utils";

export interface ComparisonPoint {
  date: string;
  value: number;
}

export interface ComparisonProps {
  portfolio: ComparisonPoint[];
  benchmark: ComparisonPoint[];
}

interface NormalizedPoint {
  time: number;
  date: string;
  ret: number;
}

interface PlottedPoint extends NormalizedPoint {
  x: number;
  y: number;
}

const VB_W = 640;
const VB_H = 240;
const PAD_X = 2;
const PAD_Y = 10;

function parseTime(date: string): number {
  const iso = date.includes("T") ? date : `${date}T00:00:00Z`;
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

interface RawPoint {
  time: number;
  date: string;
  value: number;
  index: number;
}

function rawSeries(series: ComparisonPoint[]): RawPoint[] {
  return series
    .filter((point) => Number.isFinite(point.value))
    .map((point, index) => ({
      time: parseTime(point.date),
      date: point.date,
      value: point.value,
      index,
    }));
}

/** Retorno acumulado % desde el primer valor real. Base 0. Sin valor base, no hay serie. */
function toReturns(rows: RawPoint[], positional: boolean): NormalizedPoint[] {
  const ordered = positional
    ? rows.map((row, index) => ({ ...row, time: index }))
    : [...rows]
        .filter((row) => Number.isFinite(row.time))
        .sort((a, b) => a.time - b.time || a.index - b.index);
  const base = ordered[0]?.value;
  if (base === undefined || base === 0) return [];
  return ordered.map((row) => ({
    time: row.time,
    date: row.date,
    ret: (row.value / base - 1) * 100,
  }));
}

function linePath(points: PlottedPoint[]): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
}

function nearest(points: PlottedPoint[], x: number): PlottedPoint | undefined {
  let best: PlottedPoint | undefined;
  let bestDist = Infinity;
  for (const point of points) {
    const dist = Math.abs(point.x - x);
    if (dist < bestDist) {
      bestDist = dist;
      best = point;
    }
  }
  return best;
}

/**
 * Portafolio (negro, 1.5px) contra el S&P 500 (gris punteado, 1px).
 * Ambas series parten de retorno acumulado 0%. Sin relleno ni degradado.
 * El lienzo es focusable: las flechas recorren las fechas y el lector de
 * pantalla anuncia los dos valores.
 */
export function Comparison({ portfolio, benchmark }: ComparisonProps) {
  const portRef = useRef<SVGPathElement>(null);
  const benchRef = useRef<SVGPathElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  const portRaw = rawSeries(portfolio);
  const benchRaw = rawSeries(benchmark);
  const portDated = portRaw.length === 0 || portRaw.every((row) => Number.isFinite(row.time));
  const benchDated = benchRaw.length === 0 || benchRaw.every((row) => Number.isFinite(row.time));
  const positional = !(portDated && benchDated);
  const port = toReturns(portRaw, positional);
  const bench = toReturns(benchRaw, positional);
  const all = [...port, ...bench];

  let tMin = Infinity;
  let tMax = -Infinity;
  let yMin = 0;
  let yMax = 0;
  for (const point of all) {
    if (point.time < tMin) tMin = point.time;
    if (point.time > tMax) tMax = point.time;
    if (point.ret < yMin) yMin = point.ret;
    if (point.ret > yMax) yMax = point.ret;
  }

  function xOf(time: number): number {
    if (!Number.isFinite(tMin) || tMax === tMin) return VB_W / 2;
    return PAD_X + ((time - tMin) / (tMax - tMin)) * (VB_W - PAD_X * 2);
  }

  function yOf(ret: number): number {
    if (yMax === yMin) return VB_H / 2;
    return PAD_Y + (1 - (ret - yMin) / (yMax - yMin)) * (VB_H - PAD_Y * 2);
  }

  const portPts: PlottedPoint[] = port.map((point) => ({
    ...point,
    x: xOf(point.time),
    y: yOf(point.ret),
  }));
  const benchPts: PlottedPoint[] = bench.map((point) => ({
    ...point,
    x: xOf(point.time),
    y: yOf(point.ret),
  }));

  const portD = portPts.length >= 2 ? linePath(portPts) : "";
  const benchD = benchPts.length >= 2 ? linePath(benchPts) : "";

  useEffect(() => {
    const path = portRef.current;
    const benchPath = benchRef.current;
    if (!path && !benchPath) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (path && portD) {
      const measured = path.getTotalLength();
      path.style.transition = "none";
      path.style.strokeDasharray = `${measured}`;
      path.style.strokeDashoffset = reduce ? "0" : `${measured}`;
    }
    if (benchPath) {
      benchPath.style.transition = "none";
      benchPath.style.opacity = reduce ? "1" : "0";
    }
    if (reduce) return;

    const target = path ?? benchPath;
    if (!target) return;
    let frame = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          frame = requestAnimationFrame(() => {
            if (path && portD) {
              path.style.transition = "stroke-dashoffset 1.4s cubic-bezier(0.16, 1, 0.3, 1)";
              path.style.strokeDashoffset = "0";
            }
            if (benchPath) {
              benchPath.style.transition = "opacity 1.4s cubic-bezier(0.16, 1, 0.3, 1)";
              benchPath.style.opacity = "1";
            }
          });
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(target);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [portD, benchD]);

  if (all.length === 0) {
    return <p className="label-line py-8">Sin datos suficientes para comparar el portafolio con el índice.</p>;
  }

  const portEnd = portPts.length > 0 ? portPts[portPts.length - 1].ret : null;
  const benchEnd = benchPts.length > 0 ? benchPts[benchPts.length - 1].ret : null;
  const yMarks = [yMax, (yMin + yMax) / 2, yMin];
  const firstDate = all.reduce((a, b) => (a.time <= b.time ? a : b)).date;
  const lastDate = all.reduce((a, b) => (a.time >= b.time ? a : b)).date;

  const pointerX = hoverX;
  const portHit = pointerX !== null ? nearest(portPts, pointerX) : undefined;
  const benchHit = pointerX !== null ? nearest(benchPts, pointerX) : undefined;
  const hoverPct = hoverX !== null ? (hoverX / VB_W) * 100 : 0;

  const xs = Array.from(new Set([...portPts, ...benchPts].map((point) => point.x))).sort((a, b) => a - b);

  const summary = `Retorno acumulado del portafolio contra el S&P 500, de ${formatDate(firstDate)} a ${formatDate(
    lastDate,
  )}. Portafolio ${portEnd === null ? "sin dato" : formatPercent(portEnd)}${
    benchEnd === null ? "" : `, S&P 500 ${formatPercent(benchEnd)}`
  }.`;

  function selectAt(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    setHoverX(ratio * VB_W);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (xs.length === 0) return;
    const current = hoverX;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = xs.find((x) => current === null || x > current);
      setHoverX(next ?? xs[xs.length - 1]);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      const prev = [...xs].reverse().find((x) => current === null || x < current);
      setHoverX(prev ?? xs[0]);
    } else if (event.key === "Home") {
      event.preventDefault();
      setHoverX(xs[0]);
    } else if (event.key === "End") {
      event.preventDefault();
      setHoverX(xs[xs.length - 1]);
    } else if (event.key === "Escape") {
      setHoverX(null);
    }
  }

  return (
    <figure className="w-full min-w-0">
      <ul className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-ink-500">
        <li className="flex items-center gap-2">
          <span className="inline-block h-px w-5 bg-ink-900" aria-hidden="true" />
          <span className="text-ink-900">Portafolio</span>
          {portEnd !== null ? (
            <span className={"num " + (portEnd >= 0 ? "text-positive" : "text-negative")}>{formatPercent(portEnd)}</span>
          ) : null}
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block h-px w-5 border-t border-dashed border-ink-500" aria-hidden="true" />
          <span>S&amp;P 500</span>
          {benchEnd !== null ? (
            <span className={"num " + (benchEnd >= 0 ? "text-positive" : "text-negative")}>{formatPercent(benchEnd)}</span>
          ) : null}
        </li>
      </ul>

      <div className="grid grid-cols-1 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-x-3">
        <div className="relative hidden h-52 sm:block sm:h-64" aria-hidden="true">
          {yMarks.map((mark, index) => (
            <span
              key={index}
              className="num absolute right-0 whitespace-nowrap text-[11px] text-ink-500"
              style={{
                top: `${(yOf(mark) / VB_H) * 100}%`,
                transform: index === 0 ? "translateY(0)" : index === yMarks.length - 1 ? "translateY(-100%)" : "translateY(-50%)",
              }}
            >
              {formatPercent(mark)}
            </span>
          ))}
        </div>
        <div
          className="relative h-52 touch-pan-y sm:h-64"
          onPointerMove={selectAt}
          onPointerDown={selectAt}
          onPointerLeave={(event) => {
            if (event.pointerType !== "touch") setHoverX(null);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => setHoverX(null)}
          tabIndex={0}
          role="group"
          aria-label="Comparación de retorno acumulado"
          aria-describedby={`${id}-hint`}
        >
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            className="h-full w-full"
            preserveAspectRatio="none"
            role="img"
            aria-labelledby={`${id}-title ${id}-desc`}
          >
            <title id={`${id}-title`}>Portafolio contra S&amp;P 500</title>
            <desc id={`${id}-desc`}>{summary}</desc>

            {yMarks.map((mark, index) => (
              <line
                key={index}
                x1={0}
                x2={VB_W}
                y1={yOf(mark)}
                y2={yOf(mark)}
                className="stroke-line"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {yMin < 0 && yMax > 0 ? (
              <line
                x1={0}
                x2={VB_W}
                y1={yOf(0)}
                y2={yOf(0)}
                className="stroke-ink-400"
                strokeWidth={1}
                strokeDasharray="2 4"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}

            {benchD ? (
              <path
                ref={benchRef}
                d={benchD}
                fill="none"
                className="stroke-ink-500"
                strokeWidth={1}
                strokeDasharray="4 3"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {portD ? (
              <path
                ref={portRef}
                d={portD}
                fill="none"
                className="stroke-line-strong"
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </svg>

          {portPts.length === 1 ? (
            <div
              className="pointer-events-none absolute size-1.5 -translate-x-1/2 -translate-y-1/2 bg-ink-900"
              style={{
                left: `${(portPts[0].x / VB_W) * 100}%`,
                top: `${(portPts[0].y / VB_H) * 100}%`,
              }}
            />
          ) : null}
          {benchPts.length === 1 ? (
            <div
              className="pointer-events-none absolute size-1.5 -translate-x-1/2 -translate-y-1/2 bg-ink-500"
              style={{
                left: `${(benchPts[0].x / VB_W) * 100}%`,
                top: `${(benchPts[0].y / VB_H) * 100}%`,
              }}
            />
          ) : null}

          {hoverX !== null && (portHit || benchHit) ? (
            <>
              <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-line" style={{ left: `${hoverPct}%` }} />
              <div
                className="pointer-events-none absolute z-10 border border-line bg-app-card px-2.5 py-1.5"
                aria-hidden="true"
                style={{
                  left: `${hoverPct}%`,
                  top: 8,
                  transform:
                    hoverPct < 18 ? "translateX(0)" : hoverPct > 82 ? "translateX(-100%)" : "translateX(-50%)",
                }}
              >
                {portHit ? (
                  <p className="text-[12px] text-ink-900">
                    Portafolio <span className="text-ink-500">{formatDate(portHit.date)}</span>{" "}
                    <span className={"num " + (portHit.ret >= 0 ? "text-positive" : "text-negative")}>
                      {formatPercent(portHit.ret)}
                    </span>
                  </p>
                ) : null}
                {benchHit ? (
                  <p className="text-[12px] text-ink-500">
                    S&amp;P 500 {formatDate(benchHit.date)}{" "}
                    <span className={"num " + (benchHit.ret >= 0 ? "text-positive" : "text-negative")}>
                      {formatPercent(benchHit.ret)}
                    </span>
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
        <div className="hidden sm:block" aria-hidden="true" />
        <div className="num mt-2 flex justify-between gap-3 text-[11px] text-ink-500">
          <span>{formatDate(firstDate)}</span>
          {firstDate !== lastDate ? <span>{formatDate(lastDate)}</span> : null}
        </div>
      </div>

      <p id={`${id}-hint`} className="sr-only">
        Gráfico interactivo. Usa las flechas izquierda y derecha para recorrer las fechas y Esc para salir.
      </p>

      <p className="sr-only" aria-live="polite">
        {portHit ? `${formatDate(portHit.date)}: portafolio ${formatPercent(portHit.ret)}.` : ""}
        {benchHit ? ` S&P 500 ${formatPercent(benchHit.ret)}.` : ""}
      </p>

      <table className="sr-only">
        <caption>
          Retorno acumulado, {formatDate(firstDate)} a {formatDate(lastDate)}
        </caption>
        <thead>
          <tr>
            <th scope="col">Serie</th>
            <th scope="col">Inicio</th>
            <th scope="col">Último</th>
          </tr>
        </thead>
        <tbody>
          {portEnd !== null && portPts.length > 0 ? (
            <tr>
              <th scope="row">Portafolio</th>
              <td>{formatPercent(portPts[0].ret)}</td>
              <td>{formatPercent(portEnd)}</td>
            </tr>
          ) : null}
          {benchEnd !== null && benchPts.length > 0 ? (
            <tr>
              <th scope="row">S&P 500</th>
              <td>{formatPercent(benchPts[0].ret)}</td>
              <td>{formatPercent(benchEnd)}</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}
