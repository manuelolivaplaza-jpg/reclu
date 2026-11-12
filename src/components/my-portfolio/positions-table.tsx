"use client";

import Link from "next/link";
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
/** Dato que no existe: se dice con palabras, nunca con un guion suelto. */
const MUTED = "text-[12px] font-normal text-ink-400";

function tickerHref(symbol: string): string {
  return `/accion/${encodeURIComponent(symbol.toLowerCase())}`;
}

/**
 * Tabla de posiciones con filetes de 1px. Sin precio se dice "sin precio" y
 * todo dato ausente se nombra ("Sin costo", "Sin valor", "Sin P&L"): nunca se
 * muestra un 0 ni un guion que parezca una cifra real.
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
      <div className="flex flex-col items-center gap-2 border border-ink-200 bg-white px-6 py-12 text-center">
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
      {/* Móvil: filas tipo broker (badge, ticker, valor y P&L). */}
      <ul className="divide-y divide-ink-200 border-y border-ink-200 md:hidden">
        {rows.map((row) => {
          const subline = [row.name, row.market].filter(Boolean).join(" · ");
          const weightLabel =
            row.weightPct === null ? (
              <span className="text-[11px] text-ink-400">Sin peso</span>
            ) : (
              <span className="num text-[12px] text-ink-500">
                {formatPercent(row.weightPct)}
              </span>
            );
          return (
            <li key={row.symbol} className="py-3">
              <div className="flex items-start gap-3">
                <Link
                  href={tickerHref(row.symbol)}
                  aria-label={`Ver ${row.symbol}`}
                  className="shrink-0"
                >
                  <TickerBadge symbol={row.symbol} />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <Link
                      href={tickerHref(row.symbol)}
                      className="truncate font-semibold text-ink-900 underline-offset-4 hover:underline"
                    >
                      {row.symbol}
                    </Link>
                    {weightLabel}
                  </div>
                  <p className="num mt-1 text-[15px] leading-none text-ink-900">
                    {row.value === null ? (
                      <span className={MUTED}>Sin valor</span>
                    ) : (
                      formatMoney(row.value, row.currency)
                    )}
                  </p>
                  <p className="num mt-1.5 text-[12px] text-ink-500">
                    {row.quantity === null ? "Sin cantidad" : formatQuantity(row.quantity)}
                    {" · "}
                    {row.price !== null
                      ? formatMoney(row.price, row.currency)
                      : "sin precio"}
                  </p>
                  {subline && (
                    <p className="mt-0.5 truncate text-[11px] text-ink-400">{subline}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className={`num text-[13px] font-medium ${pnlTone(row.pnl)}`}>
                    {row.pnlPct === null ? (
                      <span className={MUTED}>Sin P&amp;L</span>
                    ) : (
                      formatPercent(row.pnlPct, true)
                    )}
                  </p>
                  <p
                    className={`num mt-1 text-[11px] ${
                      row.pnl === null ? "text-ink-400" : pnlTone(row.pnl)
                    }`}
                  >
                    {row.pnl === null ? "Sin P&L" : formatMoney(row.pnl, row.currency)}
                  </p>
                </div>
              </div>
              <div className="mt-2.5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => onEdit(row.symbol)}
                  disabled={disabled}
                  aria-label={`Editar ${row.symbol}`}
                  className="inline-flex size-10 items-center justify-center border border-ink-200 text-ink-600 transition-colors hover:border-ink-900 hover:text-ink-900 disabled:opacity-45"
                >
                  <Pencil className="size-4" strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(row.symbol)}
                  disabled={disabled}
                  aria-label={`Quitar ${row.symbol}`}
                  className="inline-flex size-10 items-center justify-center border border-ink-200 text-ink-600 transition-colors hover:border-ink-900 hover:text-ink-900 disabled:opacity-45"
                >
                  <X className="size-4" strokeWidth={1.5} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Escritorio: tabla densa tipo Koyfin. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-ink-200 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-ink-500">
              <th className="pb-2.5 pr-3 font-medium">Ticker</th>
              <th className={`${NUMBER_CELL} pb-2.5 font-medium`}>Cantidad</th>
              <th className={`${NUMBER_CELL} pb-2.5 font-medium`}>Costo prom.</th>
              <th className={`${NUMBER_CELL} pb-2.5 font-medium`}>Último precio</th>
              <th className={`${NUMBER_CELL} pb-2.5 font-medium`}>Valor</th>
              <th className={`${NUMBER_CELL} pb-2.5 font-medium`}>P&amp;L</th>
              <th className={`${NUMBER_CELL} pb-2.5 font-medium`}>P&amp;L %</th>
              <th className={`${NUMBER_CELL} pb-2.5 font-medium`}>Peso</th>
              <th className="pb-2.5 pl-3 text-right" aria-label="Acciones" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200">
            {rows.map((row) => {
              const priced = row.price !== null;
              const subline = [row.name, row.market].filter(Boolean).join(" · ");
              const pnlClass = pnlTone(row.pnl);
              const weightWidth =
                row.weightPct === null ? 0 : Math.max(0, Math.min(100, row.weightPct));

              return (
                <tr key={row.symbol} className="transition-colors hover:bg-ink-50">
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-3">
                      <Link href={tickerHref(row.symbol)} aria-label={`Ver ${row.symbol}`}>
                        <TickerBadge symbol={row.symbol} className="size-8 text-[10px]" />
                      </Link>
                      <div className="min-w-0">
                        <Link
                          href={tickerHref(row.symbol)}
                          className="font-semibold text-ink-900 underline-offset-4 hover:underline"
                        >
                          {row.symbol}
                        </Link>
                        {subline && (
                          <span className="mt-0.5 block max-w-[180px] truncate text-[12px] text-ink-500">
                            {subline}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className={`${NUMBER_CELL} text-ink-900`}>
                    {row.quantity === null ? (
                      <span className={MUTED}>Sin cantidad</span>
                    ) : (
                      formatQuantity(row.quantity)
                    )}
                  </td>
                  <td className={`${NUMBER_CELL} text-ink-600`}>
                    {row.avgCost === null ? (
                      <span className="text-xs font-normal text-ink-400">Sin costo</span>
                    ) : (
                      formatMoney(row.avgCost, row.currency)
                    )}
                  </td>
                  <td className={`${NUMBER_CELL} text-ink-900`}>
                    {priced ? (
                      <>
                        {formatMoney(row.price, row.currency)}
                        {row.priceDate && (
                          <span className="mt-0.5 block text-[11px] font-normal text-ink-400">
                            {formatPriceDate(row.priceDate)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-[12px] font-normal text-ink-400">
                        sin precio
                      </span>
                    )}
                  </td>
                  <td className={`${NUMBER_CELL} text-ink-900`}>
                    {row.value === null ? (
                      <span className={MUTED}>Sin valor</span>
                    ) : (
                      formatMoney(row.value, row.currency)
                    )}
                  </td>
                  <td className={`${NUMBER_CELL} ${pnlClass}`}>
                    {row.pnl === null ? (
                      <span className={MUTED}>Sin P&amp;L</span>
                    ) : (
                      formatMoney(row.pnl, row.currency)
                    )}
                  </td>
                  <td className={`${NUMBER_CELL} ${pnlClass}`}>
                    {row.pnlPct === null ? (
                      <span className={MUTED}>Sin P&amp;L</span>
                    ) : (
                      formatPercent(row.pnlPct, true)
                    )}
                  </td>
                  <td className={`${NUMBER_CELL} text-ink-900`}>
                    {row.weightPct === null ? (
                      <span className={MUTED}>Sin peso</span>
                    ) : (
                      <div className="flex flex-col items-end gap-1.5">
                        <span>{formatPercent(row.weightPct)}</span>
                        <span
                          aria-hidden="true"
                          className="block h-px w-16 overflow-hidden bg-ink-200"
                        >
                          <span
                            className="block h-px bg-ink-900"
                            style={{ width: `${weightWidth}%` }}
                          />
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="py-3 pl-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onEdit(row.symbol)}
                        disabled={disabled}
                        aria-label={`Editar ${row.symbol}`}
                        className="inline-flex size-9 items-center justify-center text-ink-500 transition-colors hover:text-ink-900 disabled:opacity-45"
                      >
                        <Pencil className="size-4" strokeWidth={1.5} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemove(row.symbol)}
                        disabled={disabled}
                        aria-label={`Quitar ${row.symbol}`}
                        className="inline-flex size-9 items-center justify-center text-ink-500 transition-colors hover:text-ink-900 disabled:opacity-45"
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
