"use client";

import { useMemo, useState } from "react";
import { AppLink as Link } from "@/components/app/app-link";
import { cn, formatPercent } from "@/lib/utils";
import type { BeatMarketRow } from "@/lib/performance-queries";

/**
 * F5: "Le ganan al mercado" — ranking de portafolios por exceso de retorno
 * contra su benchmark (S&P 500 / IPSA), ordenable por Sharpe. Componente
 * cliente: el toggle de orden es interactivo. Los datos llegan ya validados
 * desde el servidor; sin datos el componente no se renderiza.
 */
export function BeatMarketRanking({ rows }: { rows: BeatMarketRow[] }) {
  const [sortBy, setSortBy] = useState<"excess" | "sharpe">("excess");

  const sorted = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) =>
      sortBy === "sharpe"
        ? (b.sharpe ?? -Infinity) - (a.sharpe ?? -Infinity) ||
          b.excess_return_pct - a.excess_return_pct
        : b.excess_return_pct - a.excess_return_pct ||
          (b.sharpe ?? -Infinity) - (a.sharpe ?? -Infinity),
    );
    return list.slice(0, 7);
  }, [rows, sortBy]);

  return (
    <div className="mt-14 border-t border-ink-200 pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h3 className="text-[15px] font-medium text-ink-900">Le ganan al mercado</h3>
        <div className="flex items-center gap-4">
          <div role="group" aria-label="Ordenar por" className="flex gap-3 text-[13px]">
            <button
              type="button"
              onClick={() => setSortBy("excess")}
              aria-pressed={sortBy === "excess"}
              className={
                "underline-offset-4 " +
                (sortBy === "excess"
                  ? "font-medium text-ink-900 underline"
                  : "text-ink-500 hover:text-ink-900")
              }
            >
              Exceso de retorno
            </button>
            <button
              type="button"
              onClick={() => setSortBy("sharpe")}
              aria-pressed={sortBy === "sharpe"}
              className={
                "underline-offset-4 " +
                (sortBy === "sharpe"
                  ? "font-medium text-ink-900 underline"
                  : "text-ink-500 hover:text-ink-900")
              }
            >
              Sharpe
            </button>
          </div>
          <Link
            href="/metodologia"
            className="text-[13px] text-ink-500 underline underline-offset-4 hover:text-ink-900"
          >
            Metodología
          </Link>
        </div>
      </div>

      <ul className="mt-5">
        {sorted.map((row) => (
          <li
            key={`${row.portfolio_id}-${row.benchmark_symbol}`}
            className="border-t border-ink-200"
          >
            <Link
              href={`/portfolio/${row.slug}`}
              className="group flex items-baseline justify-between gap-4 py-3"
            >
              <span className="min-w-0 text-[15px] text-ink-900 group-hover:underline">
                {row.name}
                <span className="ml-2 text-[12px] text-ink-400">
                  vs {row.benchmark_symbol === "^IPSA" ? "IPSA" : "S&P 500"}
                </span>
              </span>
              <span className="flex shrink-0 items-baseline gap-4">
                <span className="num text-[13px] text-ink-500">
                  {row.sharpe !== null ? `Sharpe ${row.sharpe.toFixed(2)}` : "Sharpe —"}
                </span>
                <span
                  className={cn(
                    "num text-[15px]",
                    row.excess_return_pct > 0
                      ? "text-positive"
                      : row.excess_return_pct < 0
                        ? "text-negative"
                        : "text-ink-900",
                  )}
                >
                  {formatPercent(row.excess_return_pct, 1).replace("%", " pp")}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[12px] leading-relaxed text-ink-500">
        Exceso de retorno estimado, desde la serie precalculada al {sorted[0]?.as_of ?? "—"}.
        Información pública, no asesoría de inversión.
      </p>
    </div>
  );
}
