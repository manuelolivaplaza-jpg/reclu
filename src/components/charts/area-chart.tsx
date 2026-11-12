"use client";

import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn, formatSignedPct } from "@/lib/utils";

export interface AreaChartPoint {
  /** Etiqueta del eje X (fecha del punto). */
  x: string;
  /** Valor del punto. */
  y: number;
}

export interface AreaChartProps {
  /** Puntos de la serie, en orden cronológico. */
  points: AreaChartPoint[];
  /** Dirección de la serie; se usa en el título accesible. */
  positive: boolean;
  /**
   * Serie secundaria (benchmark). Se dibuja como línea gris de 1px y
   * punteada, sin área. Comparte la escala vertical con la principal.
   */
  secondary?: AreaChartPoint[];
  /** Etiqueta de la serie secundaria (tooltip). */
  secondaryLabel?: string;
  /** Alto en px del lienzo. */
  height?: number;
  /** Formatea el valor para el tooltip, los ejes y el aria-label. */
  formatValue?: (value: number) => string;
  /** Formato serializable (usable desde Server Components). Gana sobre formatValue. */
  format?: "usd" | "pct" | "number";
  /** Etiqueta accesible: reemplaza el resumen automático. */
  ariaLabel?: string;
  className?: string;
}

const VB_W = 640;
const PAD_Y = 12;

const PRESET_FORMATS: Record<"usd" | "pct" | "number", (value: number) => string> = {
  usd: (v) => `${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(Number.isFinite(v) ? v : 0)} USD`,
  pct: (v) => formatSignedPct(Number.isFinite(v) ? v : 0, 1),
  number: (v) => new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(Number.isFinite(v) ? v : 0),
};

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
 * Gráfico de línea en SVG propio (sin librerías).
 *
 * - Trazo negro de 1.5px, sin relleno de área y sin degradados.
 * - Grilla y ejes en filetes de 1px (#e6e6e6); etiquetas de 11px tabulares.
 * - Serie secundaria (benchmark) en gris de 1px, punteada.
 * - Tooltip con fecha y valor al mover el puntero o con las flechas del
 *   teclado; el contenedor es focusable y anuncia el punto activo.
 * - viewBox responsivo: el SVG escala al ancho disponible sin desbordar.
 */
export function AreaChart({
  points,
  positive,
  secondary,
  secondaryLabel,
  height = 180,
  formatValue: formatValueProp,
  format,
  ariaLabel,
  className,
}: AreaChartProps) {
  const formatValue = format ? PRESET_FORMATS[format] : (formatValueProp ?? defaultFormat);
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
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

    const yFor = (value: number) => PAD_Y + (1 - (value - min) / (max - min)) * (height - PAD_Y * 2);

    const coords = clean.map((point, index) => ({
      ...point,
      px: clean.length === 1 ? VB_W / 2 : (index / (clean.length - 1)) * VB_W,
      py: yFor(point.y),
    }));

    const line = coords
      .map((coord, index) => `${index === 0 ? "M" : "L"} ${coord.px.toFixed(2)} ${coord.py.toFixed(2)}`)
      .join(" ");

    // Serie secundaria alineada por fecha: se dibuja sobre la misma escala.
    const indexByX = new Map<string, number>();
    coords.forEach((coord, index) => indexByX.set(coord.x, index));
    const secondaryCoords: { x: string; y: number; px: number; py: number }[] = [];
    for (const point of cleanSecondary) {
      const index = indexByX.get(point.x);
      if (index === undefined) continue;
      secondaryCoords.push({ ...point, px: coords[index].px, py: yFor(point.y) });
    }
    const secondaryLine =
      secondaryCoords.length >= 2
        ? secondaryCoords
            .map((coord, index) => `${index === 0 ? "M" : "L"} ${coord.px.toFixed(2)} ${coord.py.toFixed(2)}`)
            .join(" ")
        : "";

    let minPoint = coords[0];
    let maxPoint = coords[0];
    for (const coord of coords) {
      if (coord.y < minPoint.y) minPoint = coord;
      if (coord.y > maxPoint.y) maxPoint = coord;
    }

    return { coords, line, min, max, yFor, secondaryCoords, secondaryLine, minPoint, maxPoint };
  }, [clean, cleanSecondary, height]);

  if (!geometry) {
    return <p className={cn("label-line py-6", className)}>Sin datos suficientes para graficar la serie.</p>;
  }

  const { coords, line, min, max, yFor, secondaryCoords, secondaryLine, minPoint, maxPoint } = geometry;
  const first = coords[0];
  const last = coords[coords.length - 1];
  const change = last.y - first.y;
  const changePct = first.y !== 0 ? (change / Math.abs(first.y)) * 100 : 0;

  const titleText = `${positive ? "Serie al alza" : "Serie a la baja"}: ${coords.length} ${
    coords.length === 1 ? "punto" : "puntos"
  }`;
  const summary =
    ariaLabel ??
    `De ${formatValue(first.y)} el ${formatDate(first.x)} a ${formatValue(last.y)} el ${formatDate(
      last.x,
    )}; ${change >= 0 ? "sube" : "baja"}${first.y !== 0 ? ` ${Math.abs(changePct).toFixed(1)}%` : ""}.`;

  const ticks = [max, (min + max) / 2, min];
  const hasZero = min < 0 && max > 0;

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
  const tipSecondary = tip !== undefined ? secondaryCoords.find((coord) => coord.x === tip.x) : undefined;

  return (
    <div className={cn("min-w-0", className)}>
      <div className="grid grid-cols-1 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-x-3">
        <div className="relative hidden sm:block" style={{ height }} aria-hidden="true">
          {ticks.map((tick, index) => (
            <span
              key={index}
              className="num absolute right-0 whitespace-nowrap text-[11px] text-ink-500"
              style={{
                top: `${(yFor(tick) / height) * 100}%`,
                transform:
                  index === 0 ? "translateY(0)" : index === ticks.length - 1 ? "translateY(-100%)" : "translateY(-50%)",
              }}
            >
              {formatValue(tick)}
            </span>
          ))}
        </div>

        <div
          className="relative touch-pan-y"
          style={{ height }}
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerMove}
          onPointerLeave={(event) => {
            if (event.pointerType !== "touch") setActive(null);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => setActive(null)}
          tabIndex={0}
          role="group"
          aria-label="Gráfico de la serie"
          aria-describedby={`${id}-hint`}
        >
          <svg
            viewBox={`0 0 ${VB_W} ${height}`}
            preserveAspectRatio="none"
            className="h-full w-full"
            role="img"
            aria-labelledby={`${id}-title ${id}-desc`}
          >
            <title id={`${id}-title`}>{titleText}</title>
            <desc id={`${id}-desc`}>{summary}</desc>

            {ticks.map((tick, index) => (
              <line
                key={index}
                x1={0}
                x2={VB_W}
                y1={yFor(tick)}
                y2={yFor(tick)}
                className="stroke-line"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {hasZero ? (
              <line
                x1={0}
                x2={VB_W}
                y1={yFor(0)}
                y2={yFor(0)}
                className="stroke-ink-400"
                strokeWidth={1}
                strokeDasharray="2 4"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {secondaryLine ? (
              <path
                d={secondaryLine}
                fill="none"
                className="stroke-ink-500"
                strokeWidth={1}
                strokeDasharray="4 3"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            <path
              d={line}
              fill="none"
              className="stroke-line-strong"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {tip ? (
            <>
              <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-line" style={{ left: `${tipLeft}%` }} />
              <div
                className="pointer-events-none absolute size-1.5 -translate-x-1/2 -translate-y-1/2 bg-ink-900"
                style={{ left: `${tipLeft}%`, top: `${tipTop}%` }}
              />
              <div
                className="pointer-events-none absolute z-10 border border-line bg-app-card px-2.5 py-1.5"
                aria-hidden="true"
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
                <p className="text-[11px] text-ink-500">{formatDate(tip.x)}</p>
                <p className="num text-[13px] text-ink-900">{formatValue(tip.y)}</p>
                {tipSecondary ? (
                  <p className="num text-[12px] text-ink-500">
                    {secondaryLabel ? `${secondaryLabel} ` : ""}
                    {formatValue(tipSecondary.y)}
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-1 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-x-3">
        <div className="hidden sm:block" aria-hidden="true" />
        <div className="num flex justify-between gap-3 text-[11px] text-ink-500">
          <span>{formatDate(first.x)}</span>
          {first.x !== last.x ? <span>{formatDate(last.x)}</span> : null}
        </div>
      </div>

      <p id={`${id}-hint`} className="sr-only">
        Gráfico interactivo. Usa las flechas izquierda y derecha para recorrer los puntos y Esc para salir.
      </p>

      {/* Alternativa textual: los hitos reales de la serie, sin muestreo. */}
      <table className="sr-only">
        <caption>
          Resumen de la serie, {formatDate(first.x)} a {formatDate(last.x)}
        </caption>
        <thead>
          <tr>
            <th scope="col">Hito</th>
            <th scope="col">Fecha</th>
            <th scope="col">Valor</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Inicio</th>
            <td>{formatDate(first.x)}</td>
            <td>{formatValue(first.y)}</td>
          </tr>
          <tr>
            <th scope="row">Mínimo</th>
            <td>{formatDate(minPoint.x)}</td>
            <td>{formatValue(minPoint.y)}</td>
          </tr>
          <tr>
            <th scope="row">Máximo</th>
            <td>{formatDate(maxPoint.x)}</td>
            <td>{formatValue(maxPoint.y)}</td>
          </tr>
          <tr>
            <th scope="row">Último</th>
            <td>{formatDate(last.x)}</td>
            <td>{formatValue(last.y)}</td>
          </tr>
        </tbody>
      </table>

      <p className="sr-only" aria-live="polite">
        {tip ? `${formatDate(tip.x)}: ${formatValue(tip.y)}` : ""}
      </p>
    </div>
  );
}
