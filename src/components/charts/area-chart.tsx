"use client";

import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";

export interface AreaChartPoint {
  /** Etiqueta del eje X (fecha del punto). */
  x: string;
  /** Valor del punto. */
  y: number;
}

export interface AreaChartProps {
  /** Puntos de la serie, en orden cronológico. */
  points: AreaChartPoint[];
  /** true = serie en verde (subió); false = rojo (bajó). */
  positive: boolean;
  /**
   * Serie secundaria (benchmark). Se dibuja como línea gris fina, sin área.
   * Comparte la escala vertical con la principal.
   */
  secondary?: AreaChartPoint[];
  /** Etiqueta de la serie secundaria (tooltip y leyenda). */
  secondaryLabel?: string;
  /** Tema oscuro: fondo #111 y textos claros. */
  dark?: boolean;
  /** Alto en px del lienzo. */
  height?: number;
  /** Formatea el valor para el tooltip y el aria-label. */
  formatValue?: (value: number) => string;
  /** Etiqueta accesible: reemplaza el resumen automático. */
  ariaLabel?: string;
  className?: string;
}

const VB_W = 640;
const PAD_Y = 10;

const POSITIVE_COLOR = "#16a34a";
const NEGATIVE_COLOR = "#dc2626";

function parseTime(date: string): number {
  const iso = date.includes("T") ? date : `${date.slice(0, 10)}T00:00:00Z`;
  return Date.parse(iso);
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

function defaultFormat(value: number): string {
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(value);
}

/**
 * Gráfico de área en SVG propio (sin librerías).
 *
 * - Línea de 1.5px: verde #16a34a si la serie sube, roja si baja.
 * - Área con degradado (linearGradient) del color a transparente.
 * - Sin ejes, sin grilla, sin números flotando: solo la forma.
 * - Tooltip mínimo con la fecha y el valor al mover el puntero o con las
 *   flechas del teclado (el contenedor es focusable).
 * - viewBox responsivo: el SVG escala al ancho disponible.
 */
export function AreaChart({
  points,
  positive,
  secondary,
  secondaryLabel,
  dark = false,
  height = 180,
  formatValue = defaultFormat,
  ariaLabel,
  className,
}: AreaChartProps) {
  const gradId = `area-${useId().replace(/:/g, "")}`;
  const [active, setActive] = useState<number | null>(null);

  const clean = useMemo(
    () =>
      points
        .filter((point) => !!point && Number.isFinite(point.y))
        .map((point, index) => ({ x: point.x, y: point.y, index })),
    [points],
  );

  const cleanSecondary = useMemo(
    () =>
      (secondary ?? [])
        .filter((point) => !!point && Number.isFinite(point.y))
        .map((point) => ({ x: point.x, y: point.y })),
    [secondary],
  );

  const geometry = useMemo(() => {
    if (clean.length === 0) return null;

    let min = Infinity;
    let max = -Infinity;
    for (const point of clean) {
      if (point.y < min) min = point.y;
      if (point.y > max) max = point.y;
    }
    for (const point of cleanSecondary) {
      if (point.y < min) min = point.y;
      if (point.y > max) max = point.y;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    if (min === max) {
      min -= 1;
      max += 1;
    }

    const coords = clean.map((point, index) => ({
      ...point,
      px: clean.length === 1 ? VB_W / 2 : (index / (clean.length - 1)) * VB_W,
      py:
        PAD_Y +
        (1 - (point.y - min) / (max - min)) * (height - PAD_Y * 2),
    }));

    const line = coords
      .map((coord, index) => `${index === 0 ? "M" : "L"} ${coord.px.toFixed(2)} ${coord.py.toFixed(2)}`)
      .join(" ");

    const first = coords[0];
    const last = coords[coords.length - 1];
    const area = `${line} L ${last.px.toFixed(2)} ${height} L ${first.px.toFixed(2)} ${height} Z`;

    // Serie secundaria alineada por fecha: se dibuja sobre la misma escala.
    const indexByX = new Map<string, number>();
    coords.forEach((coord, index) => indexByX.set(coord.x, index));
    const secondaryCoords: { x: string; y: number; px: number; py: number }[] = [];
    for (const point of cleanSecondary) {
      const index = indexByX.get(point.x);
      if (index === undefined) continue;
      secondaryCoords.push({
        ...point,
        px: coords[index].px,
        py: PAD_Y + (1 - (point.y - min) / (max - min)) * (height - PAD_Y * 2),
      });
    }
    const secondaryLine =
      secondaryCoords.length >= 2
        ? secondaryCoords
            .map((coord, index) => `${index === 0 ? "M" : "L"} ${coord.px.toFixed(2)} ${coord.py.toFixed(2)}`)
            .join(" ")
        : "";

    return { coords, line, area, min, max, secondaryCoords, secondaryLine };
  }, [clean, cleanSecondary, height]);

  if (!geometry) {
    return (
      <p className={dark ? "px-1 py-6 text-[13px] text-neutral-400" : "px-1 py-6 text-[13px] text-neutral-500"}>
        Sin serie para graficar.
      </p>
    );
  }

  const { coords, line, area, secondaryCoords, secondaryLine } = geometry;
  const color = positive ? POSITIVE_COLOR : NEGATIVE_COLOR;
  const first = coords[0];
  const last = coords[coords.length - 1];
  const change = last.y - first.y;
  const changePct = first.y !== 0 ? (change / Math.abs(first.y)) * 100 : 0;

  const summary =
    ariaLabel ??
    `Serie de ${coords.length} puntos: de ${formatValue(first.y)} el ${formatDate(first.x)} a ${formatValue(
      last.y,
    )} el ${formatDate(last.x)}, ${change >= 0 ? "sube" : "baja"} ${Math.abs(changePct).toFixed(1)}%.`;

  function indexFromClientX(clientX: number, element: HTMLElement): number {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || coords.length === 0) return 0;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(ratio * (coords.length - 1));
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    setActive(indexFromClientX(event.clientX, event.currentTarget));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (coords.length === 0) return;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive((prev) => Math.min(coords.length - 1, (prev ?? -1) + 1));
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      setActive((prev) => Math.max(0, (prev ?? coords.length) - 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(coords.length - 1);
    } else if (event.key === "Escape") {
      setActive(null);
    }
  }

  const tip = active !== null ? coords[active] : undefined;
  const tipLeft = tip ? (tip.px / VB_W) * 100 : 0;
  const tipTop = tip ? (tip.py / height) * 100 : 0;
  const tipSecondary =
    tip !== undefined ? secondaryCoords.find((coord) => coord.x === tip.x) : undefined;

  return (
    <div
      className={className}
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerMove}
      onPointerLeave={() => setActive(null)}
      onKeyDown={handleKeyDown}
      onBlur={() => setActive(null)}
      tabIndex={0}
      role="group"
      aria-label={summary}
      style={{ touchAction: "pan-y" }}
    >
      <div className="relative" style={{ height }}>
        <svg
          viewBox={`0 0 ${VB_W} ${height}`}
          preserveAspectRatio="none"
          className="h-full w-full overflow-visible"
          role="img"
          aria-label={summary}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={dark ? 0.32 : 0.22} />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradId})`} stroke="none" />
          {secondaryLine ? (
            <path
              d={secondaryLine}
              fill="none"
              stroke={dark ? "#8a8a8a" : "#a3a3a3"}
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          <path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {tip ? (
          <>
            <div
              className={
                dark
                  ? "pointer-events-none absolute top-0 bottom-0 w-px bg-white/15"
                  : "pointer-events-none absolute top-0 bottom-0 w-px bg-neutral-200/70"
              }
              style={{ left: `${tipLeft}%` }}
            />
            <div
              className="pointer-events-none absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ left: `${tipLeft}%`, top: `${tipTop}%`, backgroundColor: color }}
            />
            <div
              className={
                dark
                  ? "pointer-events-none absolute z-10 rounded-lg border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-white"
                  : "pointer-events-none absolute z-10 rounded-lg border border-neutral-200/70 bg-white px-2.5 py-1.5 text-neutral-950"
              }
              style={{
                left: `${tipLeft}%`,
                top: `${tipTop}%`,
                transform:
                  tipTop < 30
                    ? tipLeft < 18
                      ? "translate(0, 10px)"
                      : tipLeft > 82
                        ? "translate(-100%, 10px)"
                        : "translate(-50%, 10px)"
                    : tipLeft < 18
                      ? "translate(0, calc(-100% - 10px))"
                      : tipLeft > 82
                        ? "translate(-100%, calc(-100% - 10px))"
                        : "translate(-50%, calc(-100% - 10px))",
              }}
            >
              <p className={dark ? "text-[11px] text-neutral-400" : "text-[11px] text-neutral-500"}>
                {formatDate(tip.x)}
              </p>
              <p className="num text-[13px]">{formatValue(tip.y)}</p>
              {tipSecondary ? (
                <p className="num text-[12px] text-neutral-500">
                  {secondaryLabel ? `${secondaryLabel} ` : ""}
                  {formatValue(tipSecondary.y)}
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      {/* Lectores de pantalla: el punto activo se anuncia al navegar con teclado. */}
      <p className="sr-only" aria-live="polite">
        {tip ? `${formatDate(tip.x)}: ${formatValue(tip.y)}` : ""}
      </p>
    </div>
  );
}
