"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
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
 * Portafolio (negro, 2px) contra el S&P 500 (gris punteado, 1.5px).
 * Ambas series parten de retorno acumulado 0%.
 */
export function Comparison({ portfolio, benchmark }: ComparisonProps) {
  const portRef = useRef<SVGPathElement>(null);
  const benchRef = useRef<SVGPathElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);

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
    return (
      <p className="border border-ink-200 px-3 py-10 text-[13px] text-ink-500">
        Sin serie para comparar.
      </p>
    );
  }

  const portEnd = portPts.length > 0 ? portPts[portPts.length - 1].ret : null;
  const benchEnd = benchPts.length > 0 ? benchPts[benchPts.length - 1].ret : null;
  const yMarks = [yMax, (yMin + yMax) / 2, yMin];
  const firstDate = all.reduce((a, b) => (a.time <= b.time ? a : b)).date;
  const lastDate = all.reduce((a, b) => (a.time >= b.time ? a : b)).date;

  const pointerX = hoverX !== null ? (hoverX / VB_W) * VB_W : null;
  const portHit = pointerX !== null ? nearest(portPts, pointerX) : undefined;
  const benchHit = pointerX !== null ? nearest(benchPts, pointerX) : undefined;
  const hoverPct = hoverX !== null ? (hoverX / VB_W) * 100 : 0;

  function selectAt(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    setHoverX(ratio * VB_W);
  }

  return (
    <figure className="w-full">
      <ul className="mb-4 flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
        <li className="flex items-center gap-2 text-ink-900">
          <span className="inline-block h-0.5 w-6 bg-ink-900" aria-hidden="true" />
          <span>Portafolio</span>
          {portEnd !== null ? (
            <span className={"num " + (portEnd >= 0 ? "text-positive" : "text-negative")}>
              {formatPercent(portEnd)}
            </span>
          ) : null}
        </li>
        <li className="flex items-center gap-2 text-ink-500">
          <svg width="24" height="8" aria-hidden="true" className="shrink-0">
            <line
              x1="0"
              y1="4"
              x2="24"
              y2="4"
              stroke="#6b6b6b"
              strokeWidth="1.5"
              strokeDasharray="3 2"
            />
          </svg>
          <span>S&P 500</span>
          {benchEnd !== null ? (
            <span className={"num " + (benchEnd >= 0 ? "text-positive" : "text-negative")}>
              {formatPercent(benchEnd)}
            </span>
          ) : null}
        </li>
      </ul>

      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3">
        <div className="relative h-44 sm:h-64" aria-hidden="true">
          {yMarks.map((mark, index) => (
            <span
              key={index}
              className="absolute right-0 -translate-y-1/2 text-[11px] tabular-nums text-ink-500"
              style={{ top: `${(yOf(mark) / VB_H) * 100}%` }}
            >
              {formatPercent(mark)}
            </span>
          ))}
        </div>
        <div
          className="relative h-44 sm:h-64"
          onPointerMove={selectAt}
          onPointerDown={selectAt}
          onPointerLeave={() => setHoverX(null)}
        >
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            className="h-full w-full overflow-visible"
            preserveAspectRatio="none"
            role="img"
            aria-label="Retorno acumulado del portafolio contra el S&P 500"
          >
            <line
              x1={0}
              x2={VB_W}
              y1={yOf(0)}
              y2={yOf(0)}
              stroke="#e6e6e6"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            {benchD ? (
              <path
                ref={benchRef}
                d={benchD}
                fill="none"
                stroke="#6b6b6b"
                strokeWidth={1.5}
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
                stroke="#0a0a0a"
                strokeWidth={2}
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
              <div
                className="pointer-events-none absolute top-0 bottom-0 w-px bg-ink-200"
                style={{ left: `${hoverPct}%` }}
              />
              <div
                className="pointer-events-none absolute z-10 border border-ink-200 bg-white px-2.5 py-1.5"
                style={{
                  left: `${hoverPct}%`,
                  top: 8,
                  transform:
                    hoverPct < 18 ? "translateX(0)" : hoverPct > 82 ? "translateX(-100%)" : "translateX(-50%)",
                }}
              >
                {portHit ? (
                  <p className="text-[12px] text-ink-900">
                    Portafolio{" "}
                    <span className="text-ink-500">{formatDate(portHit.date)}</span>{" "}
                    <span className={"num " + (portHit.ret >= 0 ? "text-positive" : "text-negative")}>
                      {formatPercent(portHit.ret)}
                    </span>
                  </p>
                ) : null}
                {benchHit ? (
                  <p className="text-[12px] text-ink-500">
                    S&P 500 {formatDate(benchHit.date)}{" "}
                    <span className={"num " + (benchHit.ret >= 0 ? "text-positive" : "text-negative")}>
                      {formatPercent(benchHit.ret)}
                    </span>
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
        <div />
        <div className="mt-2 flex justify-between gap-3 text-[11px] tabular-nums text-ink-500">
          <span>{formatDate(firstDate)}</span>
          {firstDate !== lastDate ? <span>{formatDate(lastDate)}</span> : null}
        </div>
      </div>
    </figure>
  );
}
