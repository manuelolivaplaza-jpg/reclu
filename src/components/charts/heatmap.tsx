"use client";

import { useRef, useState } from "react";
import { formatPercent } from "@/lib/utils";

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

/** Negro = mejor retorno del tablero. Blanco = peor. */
function shade(returnPct: number, min: number, max: number): string {
  if (max === min) return "#0a0a0a";
  const t = (returnPct - min) / (max - min);
  const channel = Math.round(255 - t * (255 - 10));
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
 * Holding × mes. El tono es el retorno real de esa celda.
 * Si el mes no viene en la fila, la celda queda vacía con borde gris.
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

  if (rows.length === 0 || months.length === 0) {
    return (
      <p className="border border-ink-200 px-3 py-10 text-[13px] text-ink-500">
        Sin retornos mensuales.
      </p>
    );
  }

  const edge = tip ? tip.edge : 0.5;

  return (
    <figure className="w-full">
      <div ref={wrapRef} className="relative" onPointerLeave={() => setTip(null)}>
        <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-px text-left">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white" scope="col" />
              {months.map((month) => (
                <th
                  key={month}
                  scope="col"
                  className="min-w-9 px-1 pb-2 text-center text-[11px] font-normal whitespace-nowrap tabular-nums text-ink-500"
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
                    className="sticky left-0 z-10 bg-white pr-3 text-left text-[13px] font-medium whitespace-nowrap text-ink-900"
                  >
                    {row.symbol}
                  </th>
                  {months.map((month) => {
                    const returnPct = byMonth.get(month);
                    if (returnPct === undefined || !hasScale) {
                      return (
                        <td key={month} className="border border-ink-200 bg-white p-0">
                          <span className="block h-8 min-w-9" />
                        </td>
                      );
                    }
                    return (
                      <td key={month} className="p-0">
                        <button
                          type="button"
                          className="block h-8 w-full min-w-9 p-0"
                          style={{ backgroundColor: shade(returnPct, min, max) }}
                          aria-label={`${row.symbol}, ${formatMonth(month)}, ${formatPercent(returnPct)}`}
                          onPointerEnter={(event) =>
                            showTip(event.currentTarget, { symbol: row.symbol, month, returnPct })
                          }
                          onFocus={(event) =>
                            showTip(event.currentTarget, { symbol: row.symbol, month, returnPct })
                          }
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
        {tip ? (
          <div
            className="pointer-events-none absolute z-20 border border-ink-200 bg-white px-2.5 py-1.5"
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
            <p className={"num text-[13px] " + (tip.returnPct >= 0 ? "text-positive" : "text-negative")}>
              {formatPercent(tip.returnPct)}
            </p>
          </div>
        ) : null}
      </div>
    </figure>
  );
}
