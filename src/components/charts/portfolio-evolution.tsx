"use client";

import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { formatCompact } from "@/lib/utils";

export interface EvolutionPoint {
  date: string;
  value: number;
}

export interface PortfolioEvolutionProps {
  data: EvolutionPoint[];
}

const VB_W = 640;
const VB_H = 240;
const PAD_Y = 8;

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

function formatExact(value: number): string {
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(value);
}

function formatAxis(value: number): string {
  if (Math.abs(value) >= 100_000) return formatCompact(value);
  return formatExact(value);
}

function orderPoints(data: EvolutionPoint[]): EvolutionPoint[] {
  const rows = data
    .filter((point) => Number.isFinite(point.value))
    .map((point, index) => ({ point, index, time: parseTime(point.date) }));
  if (rows.length === 0 || rows.some((row) => !Number.isFinite(row.time))) {
    return rows.map((row) => row.point);
  }
  return [...rows]
    .sort((a, b) => a.time - b.time || a.index - b.index)
    .map((row) => row.point);
}

/**
 * Área del valor del portafolio. Trazo negro 2px, relleno al 8%,
 * dibujado al entrar en viewport (mismo ritmo que Sparkline).
 */
export function PortfolioEvolution({ data }: PortfolioEvolutionProps) {
  const pathRef = useRef<SVGPathElement>(null);
  const areaRef = useRef<SVGPathElement>(null);
  const gradId = `evo-${useId().replace(/:/g, "")}`;
  const [active, setActive] = useState<number | null>(null);

  const points = orderPoints(data);
  let min = Infinity;
  let max = -Infinity;
  for (const point of points) {
    if (point.value < min) min = point.value;
    if (point.value > max) max = point.value;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0;
    max = 0;
  }
  const mid = (min + max) / 2;
  const flat = min === max;

  function yOf(value: number): number {
    if (flat) return VB_H / 2;
    return PAD_Y + (1 - (value - min) / (max - min)) * (VB_H - PAD_Y * 2);
  }

  const coords = points.map((point, index) => {
    const x = points.length === 1 ? VB_W / 2 : (index / (points.length - 1)) * VB_W;
    return { x, y: yOf(point.value) };
  });

  const linePath =
    coords.length < 2
      ? ""
      : coords
          .map((coord, index) => `${index === 0 ? "M" : "L"} ${coord.x.toFixed(2)} ${coord.y.toFixed(2)}`)
          .join(" ");

  const lastCoord = coords[coords.length - 1];
  const firstCoord = coords[0];
  const areaPath =
    linePath && lastCoord && firstCoord
      ? `${linePath} L ${lastCoord.x.toFixed(2)} ${VB_H} L ${firstCoord.x.toFixed(2)} ${VB_H} Z`
      : "";

  useEffect(() => {
    const path = pathRef.current;
    const area = areaRef.current;
    if (!path) return;
    const measured = path.getTotalLength();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    path.style.transition = "none";
    path.style.strokeDasharray = `${measured}`;
    path.style.strokeDashoffset = reduce ? "0" : `${measured}`;
    if (area) {
      area.style.transition = "none";
      area.style.opacity = reduce ? "1" : "0";
    }
    if (reduce) return;

    let frame = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          frame = requestAnimationFrame(() => {
            path.style.transition = "stroke-dashoffset 1.4s cubic-bezier(0.16, 1, 0.3, 1)";
            path.style.strokeDashoffset = "0";
            if (area) {
              area.style.transition = "opacity 1.4s cubic-bezier(0.16, 1, 0.3, 1)";
              area.style.opacity = "1";
            }
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
    const index = Math.round(ratio * (points.length - 1));
    setActive((prev) => (prev === index ? prev : index));
  }

  if (points.length === 0) {
    return (
      <p className="border border-ink-200 px-3 py-10 text-[13px] text-ink-500">Sin serie de valor.</p>
    );
  }

  const tip = active !== null ? points[active] : undefined;
  const tipCoord = active !== null ? coords[active] : undefined;
  const tipX = tipCoord ? (tipCoord.x / VB_W) * 100 : 0;
  const tipY = tipCoord ? (tipCoord.y / VB_H) * 100 : 0;
  const first = points[0];
  const last = points[points.length - 1];
  const marks = [
    { value: max, y: yOf(max) },
    { value: mid, y: yOf(mid) },
    { value: min, y: yOf(min) },
  ];

  return (
    <figure className="w-full">
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3">
        <div className="relative h-44 sm:h-64" aria-hidden="true">
          {marks.map((mark, index) => (
            <span
              key={index}
              className="absolute right-0 -translate-y-1/2 text-[11px] tabular-nums text-ink-500"
              style={{ top: `${(mark.y / VB_H) * 100}%` }}
            >
              {formatAxis(mark.value)}
            </span>
          ))}
        </div>
        <div
          className="relative h-44 sm:h-64"
          onPointerMove={selectAt}
          onPointerDown={selectAt}
          onPointerLeave={() => setActive(null)}
        >
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            className="h-full w-full overflow-visible"
            preserveAspectRatio="none"
            role="img"
            aria-label={`Evolución del portafolio, de ${formatExact(first.value)} a ${formatExact(last.value)}`}
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0a0a0a" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#0a0a0a" stopOpacity="0" />
              </linearGradient>
            </defs>
            {areaPath ? <path ref={areaRef} d={areaPath} fill={`url(#${gradId})`} stroke="none" /> : null}
            {linePath ? (
              <path
                ref={pathRef}
                d={linePath}
                fill="none"
                stroke="#0a0a0a"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </svg>
          {points.length === 1 && coords[0] ? (
            <div
              className="pointer-events-none absolute size-1.5 -translate-x-1/2 -translate-y-1/2 bg-ink-900"
              style={{
                left: `${(coords[0].x / VB_W) * 100}%`,
                top: `${(coords[0].y / VB_H) * 100}%`,
              }}
            />
          ) : null}
          {tip && tipCoord ? (
            <>
              <div
                className="pointer-events-none absolute top-0 bottom-0 w-px bg-ink-200"
                style={{ left: `${tipX}%` }}
              />
              <div
                className="pointer-events-none absolute size-1.5 -translate-x-1/2 -translate-y-1/2 bg-ink-900"
                style={{ left: `${tipX}%`, top: `${tipY}%` }}
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
                <p className="num text-[13px] text-ink-900">{formatExact(tip.value)}</p>
              </div>
            </>
          ) : null}
        </div>
        <div />
        <div className="mt-2 flex justify-between gap-3 text-[11px] tabular-nums text-ink-500">
          <span>{formatDate(first.date)}</span>
          {first.date !== last.date ? <span>{formatDate(last.date)}</span> : null}
        </div>
      </div>
    </figure>
  );
}
