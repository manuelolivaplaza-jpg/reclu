"use client";

import { useRef, useState } from "react";
import { cn, formatPercent } from "@/lib/utils";

export interface HeatmapMonth {
  month: string;
  returnPct: number;
}

export interface HeatmapRow {
  symbol: string;
  monthly: HeatmapMonth[];
}

export interface HeatmapProps {
  rows: HeatmapRow[];
}

interface Tip {
  symbol: string;
  month: string;
  returnPct: number;
  x: number;
  y: number;
  edge: number;
}

function monthTime(month: string): number {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(month.trim());
  if (!match) {
    const parsed = Date.parse(month);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = match[3] ? Number(match[3]) : 1;
  return Date.UTC(year, monthIndex, day);
}

function formatMonth(month: string): string {
  const time = monthTime(month);
  if (!Number.isFinite(time)) return month;
  return new Intl.DateTimeFormat("es-CL", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(new Date(time));
}

/** Negro = mejor retorno del tablero. Gris claro = peor. Escala de grises pura. */
function shade(returnPct: number, min: number, max: number): string {
  if (max === min) return "#8f8f8f";
  const t = (returnPct - min) / (max - min);
  // El extremo claro baja a #f6f6f6 para no confundirse con una celda vacía.
  const channel = Math.round(246 - t * (246 - 10));
  const hex = channel.toString(16).padStart(2, "0");
  return `#${hex}${hex}${hex}`;
}

function columnOrder(rows: HeatmapRow[]): string[] {
  const seen: string[] = [];
  for (const row of rows) {
    for (const cell of row.monthly) {
      if (!seen.includes(cell.month)) seen.push(cell.month);
    }
  }
  const dated = seen.every((month) => Number.isFinite(monthTime(month)));
  if (!dated) return seen;
  return [...seen].sort((a, b) => monthTime(a) - monthTime(b));
}

/**
 * Holding × mes. El tono de cada celda es el retorno real de ese mes, en
 * escala de grises (más oscuro = mayor retorno). Si el mes no viene en la
 * fila, la celda queda vacía con su filete. Cada celda es un botón con
 * aria-label y foco visible: el detalle también se lee sin puntero.
 */
export function Heatmap({ rows }: HeatmapProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const months = columnOrder(rows);

  let min = Infinity;
  let max = -Infinity;
  for (const row of rows) {
    for (const cell of row.monthly) {
      if (!Number.isFinite(cell.returnPct)) continue;
      if (cell.returnPct < min) min = cell.returnPct;
      if (cell.returnPct > max) max = cell.returnPct;
    }
  }
  const hasScale = Number.isFinite(min) && Number.isFinite(max);

  function showTip(cellEl: HTMLButtonElement, next: Omit<Tip, "x" | "y" | "edge">) {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const cell = cellEl.getBoundingClientRect();
    const board = wrap.getBoundingClientRect();
    const x = cell.left - board.left + cell.width / 2;
    setTip({
      ...next,
      x,
      y: cell.top - board.top,
      edge: board.width > 0 ? x / board.width : 0.5,
    });
  }

  if (rows.length === 0 || months.length === 0 || !hasScale) {
    return <p className="label-line py-8">Sin retornos mensuales.</p>;
  }

  const edge = tip ? tip.edge : 0.5;

  return (
    <figure className="w-full">
      <div
        ref={wrapRef}
        className="relative"
        onPointerLeave={(event) => {
          if (event.pointerType !== "touch") setTip(null);
        }}
      >
        <div
          className="overflow-x-auto focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-ink-900"
          role="region"
          aria-label="Retornos mensuales por activo"
          tabIndex={0}
        >
          <table className="w-full border-separate border-spacing-px text-left">
            <caption className="sr-only">
              Retornos mensuales por activo. Escala de grises: más oscuro es mayor retorno.
            </caption>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 bg-app-card">
                  <span className="sr-only">Activo</span>
                </th>
                {months.map((month) => (
                  <th
                    key={month}
                    scope="col"
                    className="num min-w-9 px-1 pb-2 text-center text-[11px] font-normal whitespace-nowrap text-ink-500"
                  >
                    {formatMonth(month)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => {
                const byMonth = new Map<string, number>();
                for (const cell of row.monthly) {
                  if (Number.isFinite(cell.returnPct)) byMonth.set(cell.month, cell.returnPct);
                }
                return (
                  <tr key={`${row.symbol}-${rowIndex}`}>
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-app-card pr-3 text-left text-[13px] font-medium whitespace-nowrap text-ink-900"
                    >
                      {row.symbol}
                    </th>
                    {months.map((month) => {
                      const returnPct = byMonth.get(month);
                      if (returnPct === undefined) {
                        return (
                          <td key={month} className="border border-line bg-app-card p-0">
                            <span className="block h-8 min-w-9" />
                          </td>
                        );
                      }
                      const tone = max > min ? (returnPct - min) / (max - min) : 0.5;
                      return (
                        <td key={month} className="p-0">
                          <button
                            type="button"
                            className={cn(
                              "block h-8 w-full min-w-9 p-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px]",
                              tone > 0.55 ? "focus-visible:outline-white" : "focus-visible:outline-ink-900",
                            )}
                            style={{ backgroundColor: shade(returnPct, min, max) }}
                            aria-label={`${row.symbol}, ${formatMonth(month)}, ${formatPercent(returnPct)}`}
                            onPointerEnter={(event) =>
                              showTip(event.currentTarget, { symbol: row.symbol, month, returnPct })
                            }
                            onFocus={(event) => showTip(event.currentTarget, { symbol: row.symbol, month, returnPct })}
                            onBlur={() => setTip(null)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {max > min ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-500" aria-hidden="true">
            <span>Menor</span>
            <span className="num">{formatPercent(min)}</span>
            <span className="flex gap-px">
              {[0, 0.25, 0.5, 0.75, 1].map((step) => (
                <span
                  key={step}
                  className="block size-3 border border-line"
                  style={{ backgroundColor: shade(min + step * (max - min), min, max) }}
                />
              ))}
            </span>
            <span className="num">{formatPercent(max)}</span>
            <span>Mayor</span>
          </div>
        ) : null}

        {tip ? (
          <div
            className="pointer-events-none absolute z-20 border border-line bg-app-card px-2.5 py-1.5"
            aria-hidden="true"
            style={{
              left: tip.x,
              top: tip.y,
              transform:
                edge < 0.2
                  ? "translate(0, calc(-100% - 8px))"
                  : edge > 0.8
                    ? "translate(-100%, calc(-100% - 8px))"
                    : "translate(-50%, calc(-100% - 8px))",
            }}
          >
            <p className="text-[11px] text-ink-500">
              {tip.symbol} · {formatMonth(tip.month)}
            </p>
            <p className={cn("num text-[13px]", tip.returnPct >= 0 ? "text-positive" : "text-negative")}>
              {formatPercent(tip.returnPct)}
            </p>
          </div>
        ) : null}
      </div>
    </figure>
  );
}
