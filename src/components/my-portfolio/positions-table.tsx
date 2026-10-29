"use client";

import { Pencil, X } from "lucide-react";
import type { ValuedPositionRow } from "@/components/my-portfolio/types";
import { TickerBadge } from "@/components/my-portfolio/ticker-badge";
import {
  formatMoney,
  formatPercent,
  formatPriceDate,
  formatQuantity,
} from "@/components/my-portfolio/format";

const NUMBER_CELL = "py-3 text-right tabular-nums";

/**
 * Tabla de posiciones con filetes de 1px. Sin precio se dice "sin precio":
 * nunca se muestra un 0 que parezca una cotización real.
 */
export function PositionsTable({
  rows,
  disabled,
  onEdit,
  onRemove,
}: {
  rows: ValuedPositionRow[];
  disabled?: boolean;
  onEdit: (symbol: string) => void;
  onRemove: (symbol: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-ink-200 px-6 py-10 text-center">
        <p className="text-[15px] font-medium text-ink-900">Aún no tienes posiciones</p>
        <p className="max-w-sm text-sm text-ink-500">
          Agrega la primera con el formulario o importa un CSV.
        </p>
      </div>
    );
  }

  const pnlTone = (pnl: number | null) =>
    pnl === null
      ? "text-ink-500"
      : pnl > 0
        ? "text-positive"
        : pnl < 0
          ? "text-negative"
          : "text-ink-900";

  return (
    <>
    {/* Móvil: filas tipo broker (logo, ticker, valor y P&L). */}
    <ul className="-mx-1 divide-y divide-ink-100 md:hidden">
      {rows.map((row) => (
        <li key={row.symbol} className="flex items-center gap-3 px-1 py-3">
          <TickerBadge symbol={row.symbol} />
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline gap-2">
              <span className="font-semibold text-ink-900">{row.symbol}</span>
              <span className="text-[12px] tabular-nums text-ink-500">
                {formatPercent(row.weightPct)}
              </span>
            </p>
            <p className="truncate text-[12px] text-ink-500">
              {formatQuantity(row.quantity)} ·{" "}
              {row.price !== null ? formatMoney(row.price, row.currency) : "sin precio"}
            </p>
          </div>
          <div className="text-right tabular-nums">
            <p className="text-[15px] font-medium text-ink-900">
              {formatMoney(row.value, row.currency)}
            </p>
            <p className={`text-[12px] font-medium ${pnlTone(row.pnl)}`}>
              {formatPercent(row.pnlPct, true)}
            </p>
          </div>
          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => onEdit(row.symbol)}
              disabled={disabled}
              aria-label={`Editar ${row.symbol}`}
              className="inline-flex size-8 items-center justify-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-900 disabled:opacity-50"
            >
              <Pencil className="size-3.5" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => onRemove(row.symbol)}
              disabled={disabled}
              aria-label={`Quitar ${row.symbol}`}
              className="inline-flex size-8 items-center justify-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-negative disabled:opacity-50"
            >
              <X className="size-3.5" strokeWidth={1.75} />
            </button>
          </div>
        </li>
      ))}
    </ul>

    {/* Escritorio: tabla densa tipo Koyfin. */}
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-ink-200 text-left text-[11px] font-medium uppercase tracking-wide text-ink-500">
            <th className="pb-2 pr-3">Ticker</th>
            <th className={`${NUMBER_CELL} pb-2`}>Cantidad</th>
            <th className={`${NUMBER_CELL} pb-2`}>Costo prom.</th>
            <th className={`${NUMBER_CELL} pb-2`}>Último precio</th>
            <th className={`${NUMBER_CELL} pb-2`}>Valor</th>
            <th className={`${NUMBER_CELL} pb-2`}>P&amp;L</th>
            <th className={`${NUMBER_CELL} pb-2`}>P&amp;L %</th>
            <th className={`${NUMBER_CELL} pb-2`}>Peso</th>
            <th className="pb-2 pl-3 text-right" aria-label="Acciones" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((row) => {
            const priced = row.price !== null;
            const pnlClass =
              row.pnl === null
                ? "text-ink-500"
                : row.pnl > 0
                  ? "text-positive"
                  : row.pnl < 0
                    ? "text-negative"
                    : "text-ink-900";

            return (
              <tr key={row.symbol} className="transition-colors hover:bg-ink-50">
                <td className="py-3 pr-3">
                  <div className="flex items-center gap-3">
                    <TickerBadge symbol={row.symbol} className="size-8 text-[10px]" />
                    <div className="min-w-0">
                      <span className="font-semibold text-ink-900">{row.symbol}</span>
                      <span className="mt-0.5 block max-w-[180px] truncate text-[12px] text-ink-500">
                        {row.name || row.market || "—"}
                      </span>
                    </div>
                  </div>
                </td>
                <td className={`${NUMBER_CELL} text-ink-900`}>
                  {formatQuantity(row.quantity)}
                </td>
                <td className={`${NUMBER_CELL} text-ink-600`}>
                  {row.avgCost === null
                    ? "—"
                    : formatMoney(row.avgCost, row.currency)}
                </td>
                <td className={`${NUMBER_CELL} text-ink-900`}>
                  {priced ? (
                    <>
                      {formatMoney(row.price, row.currency)}
                      {row.priceDate && (
                        <span className="mt-0.5 block text-[11px] font-normal text-ink-500">
                          {formatPriceDate(row.priceDate)}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-[12px] font-normal text-ink-500">
                      sin precio
                    </span>
                  )}
                </td>
                <td className={`${NUMBER_CELL} text-ink-900`}>
                  {formatMoney(row.value, row.currency)}
                </td>
                <td className={`${NUMBER_CELL} ${pnlClass}`}>
                  {formatMoney(row.pnl, row.currency)}
                </td>
                <td className={`${NUMBER_CELL} ${pnlClass}`}>
                  {formatPercent(row.pnlPct, true)}
                </td>
                <td className={`${NUMBER_CELL} text-ink-900`}>
                  {formatPercent(row.weightPct)}
                </td>
                <td className="py-3 pl-3 text-right">
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onEdit(row.symbol)}
                      disabled={disabled}
                      aria-label={`Editar ${row.symbol}`}
                      className="inline-flex size-9 items-center justify-center text-ink-500 transition-colors hover:text-ink-900 disabled:opacity-50"
                    >
                      <Pencil className="size-4" strokeWidth={1.5} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(row.symbol)}
                      disabled={disabled}
                      aria-label={`Quitar ${row.symbol}`}
                      className="inline-flex size-9 items-center justify-center text-ink-500 transition-colors hover:text-negative disabled:opacity-50"
                    >
                      <X className="size-4" strokeWidth={1.5} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}
