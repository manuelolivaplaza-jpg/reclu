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

const HEAD = "whitespace-nowrap pb-2.5 text-[13px] font-normal text-ink-500";
const HEAD_NUM = `${HEAD} pl-4 text-right`;
const NUM_CELL = "py-3 pl-4 text-right num";
/** Dato que no existe: se dice con palabras, nunca con un guion suelto. */
const MUTED = "text-[12px] font-normal text-ink-500";

function tickerHref(symbol: string): string {
  return `/accion/${encodeURIComponent(symbol.toLowerCase())}`;
}

function pnlTone(pnl: number | null): string {
  return pnl === null
    ? "text-ink-500"
    : pnl > 0
      ? "text-positive"
      : pnl < 0
        ? "text-negative"
        : "text-ink-900";
}

/**
 * Tabla de posiciones con filetes de 1px. Sin precio se dice "sin precio" y
 * todo dato ausente se nombra ("Sin costo", "Sin valor", "Sin P&L"): nunca se
 * muestra un 0 ni un guion que parezca una cifra real.
 *
 * En móvil se usa una lista de filas (sin scroll horizontal); desde `md` la
 * tabla completa vive en una región desplazable y enfocable con teclado.
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
      <div className="py-6 sm:py-8">
        <p className="text-[15px] font-medium leading-snug text-ink-900">
          Aún no tienes posiciones
        </p>
        <p className="mt-1 max-w-md text-[13px] leading-relaxed text-ink-500">
          Agrega la primera con el formulario de arriba. Si ya tienes la cartera
          en una planilla, puedes importarla desde Cruzar con portafolios.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Móvil: una fila por posición, sin scroll horizontal. */}
      <ul className="divide-y divide-ink-200 border-y border-line md:hidden">
        {rows.map((row) => {
          const subline = [row.name, row.market].filter(Boolean).join(" · ");
          return (
            <li key={row.symbol} className="py-4">
              <div className="flex items-start gap-3">
                <TickerBadge symbol={row.symbol} />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <Link
                      href={tickerHref(row.symbol)}
                      className="break-all font-medium text-ink-900 underline-offset-4 hover:underline"
                    >
                      {row.symbol}
                    </Link>
                    {row.weightPct === null ? (
                      <span className="text-[12px] text-ink-500">Sin peso</span>
                    ) : (
                      <span className="num text-[12px] text-ink-500">
                        {formatPercent(row.weightPct)}
                      </span>
                    )}
                  </div>

                  <p className="num mt-1.5 text-[16px] leading-none text-ink-900">
                    {row.value !== null && <span className="sr-only">Valor: </span>}
                    {row.value === null ? (
                      <span className={MUTED}>Sin valor</span>
                    ) : (
                      formatMoney(row.value, row.currency)
                    )}
                  </p>

                  <p className="num mt-1.5 text-[12px] leading-snug text-ink-500">
                    <span className="sr-only">Cantidad y precio: </span>
                    {row.quantity === null ? "Sin cantidad" : formatQuantity(row.quantity)}
                    {" · "}
                    {row.price !== null
                      ? formatMoney(row.price, row.currency)
                      : "sin precio"}
                  </p>

                  {subline && (
                    <p className="mt-0.5 truncate text-[12px] text-ink-500">{subline}</p>
                  )}
                </div>

                <div className="shrink-0 text-right">
                  <p className={`num text-[13px] font-medium ${pnlTone(row.pnl)}`}>
                    {row.pnlPct !== null && <span className="sr-only">P&amp;L: </span>}
                    {row.pnlPct === null ? (
                      <span className={MUTED}>Sin P&amp;L</span>
                    ) : (
                      formatPercent(row.pnlPct, true)
                    )}
                  </p>
                  <p
                    className={`num mt-1 text-[12px] ${
                      row.pnl === null ? "text-ink-500" : pnlTone(row.pnl)
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
                  className="inline-flex size-11 items-center justify-center border border-line text-ink-600 transition-colors hover:border-ink-900 hover:text-ink-900 disabled:pointer-events-none disabled:opacity-45"
                >
                  <Pencil className="size-4" strokeWidth={1.5} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(row.symbol)}
                  disabled={disabled}
                  aria-label={`Quitar ${row.symbol}`}
                  className="inline-flex size-11 items-center justify-center border border-line text-ink-600 transition-colors hover:border-ink-900 hover:text-ink-900 disabled:pointer-events-none disabled:opacity-45"
                >
                  <X className="size-4" strokeWidth={1.5} aria-hidden />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Escritorio: tabla densa en una región desplazable con teclado. */}
      <div
        role="region"
        aria-label="Tabla de posiciones"
        tabIndex={0}
        className="hidden overflow-x-auto md:block"
      >
        <table className="w-full min-w-[720px] text-sm">
          <caption className="sr-only">
            Posiciones de tu cartera con cantidad, costo promedio, último precio,
            valor, P&amp;L y peso.
          </caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className={`${HEAD} pr-3 text-left`}>
                Ticker
              </th>
              <th scope="col" className={HEAD_NUM}>
                Cantidad
              </th>
              <th scope="col" className={HEAD_NUM}>
                Costo prom.
              </th>
              <th scope="col" className={HEAD_NUM}>
                Último precio
              </th>
              <th scope="col" className={HEAD_NUM}>
                Valor
              </th>
              <th scope="col" className={HEAD_NUM}>
                P&amp;L
              </th>
              <th scope="col" className={HEAD_NUM}>
                P&amp;L %
              </th>
              <th scope="col" className={HEAD_NUM}>
                Peso
              </th>
              <th scope="col" className="pb-2.5 pl-3 text-right">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200">
            {rows.map((row) => {
              const subline = [row.name, row.market].filter(Boolean).join(" · ");
              const tone = pnlTone(row.pnl);
              const weightWidth =
                row.weightPct === null ? 0 : Math.max(0, Math.min(100, row.weightPct));

              return (
                <tr key={row.symbol} className="transition-colors hover:bg-ink-50">
                  <th scope="row" className="py-3 pr-3 text-left font-normal">
                    <div className="flex items-center gap-3">
                      <TickerBadge symbol={row.symbol} className="size-8 text-[10px]" />
                      <div className="min-w-0">
                        <Link
                          href={tickerHref(row.symbol)}
                          className="font-medium text-ink-900 underline-offset-4 hover:underline"
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
                  </th>
                  <td className={`${NUM_CELL} text-ink-900`}>
                    {row.quantity === null ? (
                      <span className={MUTED}>Sin cantidad</span>
                    ) : (
                      formatQuantity(row.quantity)
                    )}
                  </td>
                  <td className={`${NUM_CELL} text-ink-600`}>
                    {row.avgCost === null ? (
                      <span className={MUTED}>Sin costo</span>
                    ) : (
                      formatMoney(row.avgCost, row.currency)
                    )}
                  </td>
                  <td className={`${NUM_CELL} text-ink-900`}>
                    {row.price !== null ? (
                      <>
                        {formatMoney(row.price, row.currency)}
                        {row.priceDate && (
                          <span className="mt-0.5 block text-[12px] font-normal tracking-normal text-ink-500">
                            {formatPriceDate(row.priceDate)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className={MUTED}>Sin precio</span>
                    )}
                  </td>
                  <td className={`${NUM_CELL} text-ink-900`}>
                    {row.value === null ? (
                      <span className={MUTED}>Sin valor</span>
                    ) : (
                      formatMoney(row.value, row.currency)
                    )}
                  </td>
                  <td className={`${NUM_CELL} ${tone}`}>
                    {row.pnl === null ? (
                      <span className={MUTED}>Sin P&amp;L</span>
                    ) : (
                      formatMoney(row.pnl, row.currency)
                    )}
                  </td>
                  <td className={`${NUM_CELL} ${tone}`}>
                    {row.pnlPct === null ? (
                      <span className={MUTED}>Sin P&amp;L</span>
                    ) : (
                      formatPercent(row.pnlPct, true)
                    )}
                  </td>
                  <td className={`${NUM_CELL} text-ink-900`}>
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
                        className="inline-flex size-10 items-center justify-center text-ink-500 transition-colors hover:text-ink-900 disabled:pointer-events-none disabled:opacity-45"
                      >
                        <Pencil className="size-4" strokeWidth={1.5} aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemove(row.symbol)}
                        disabled={disabled}
                        aria-label={`Quitar ${row.symbol}`}
                        className="inline-flex size-10 items-center justify-center text-ink-500 transition-colors hover:text-ink-900 disabled:pointer-events-none disabled:opacity-45"
                      >
                        <X className="size-4" strokeWidth={1.5} aria-hidden />
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
