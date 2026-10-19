import Link from "next/link";
import { DemoBadge } from "@/components/demo-badge";
import { PaywallGate } from "@/components/paywall-gate";
import {
  INSIDER_BACKTEST,
  INSIDER_DISCLAIMER,
  filingHref,
  formatIsoDate,
  formatSignedPct,
  formatUsd,
  ownerRoleLabel,
  type InsiderTrade,
} from "@/lib/insider-queries";

/**
 * Compras Form 4 del portafolio `sec_form4`.
 * El backtest y el aviso quedan visibles. La tabla de filings sigue
 * el mismo muro que la composición: un anónimo no recibe las filas.
 */
export function InsiderTradesList({
  trades,
  demo = false,
  locked,
}: {
  trades: InsiderTrade[];
  demo?: boolean;
  locked: boolean;
}) {
  const rows = locked ? [] : trades;

  return (
    <section className="mb-12">
      <h2 className="text-[15px] font-medium text-ink-900">Últimas compras</h2>

      <BacktestNote />

      <PaywallGate locked={locked} label="compras de ejecutivos" className="mt-4">
        {rows.length > 0 ? (
          <>
            {demo ? (
              <p className="mb-3">
                <DemoBadge />
              </p>
            ) : null}
            <table className="w-full text-[15px]">
              <thead>
                <tr className="border-b border-ink-200 text-left text-[13px] text-ink-500">
                  <th className="py-3 font-normal">Fecha</th>
                  <th className="py-3 font-normal">Ticker</th>
                  <th className="py-3 font-normal">Cargo</th>
                  <th className="py-3 text-right font-normal">Monto</th>
                  <th className="py-3 text-right font-normal">Filing</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((trade) => {
                  const href = filingHref(trade.sourceUrl);
                  return (
                    <tr key={trade.id} className="border-b border-ink-200">
                      <td className="py-3.5 align-top text-ink-900">
                        <div>{formatIsoDate(trade.transDate)}</div>
                        {trade.filedAt.slice(0, 10) !== trade.transDate.slice(0, 10) ? (
                          <div className="text-[13px] text-ink-500">
                            Presentado {formatIsoDate(trade.filedAt)}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-3.5 align-top">
                        <Link
                          href={`/accion/${encodeURIComponent(trade.symbol.toLowerCase())}`}
                          className="font-medium text-ink-900 underline-offset-4 hover:underline"
                        >
                          {trade.symbol}
                        </Link>
                      </td>
                      <td className="py-3.5 align-top">
                        <div className="text-ink-900">{ownerRoleLabel(trade)}</div>
                        <div className="text-[13px] text-ink-500">{trade.ownerName}</div>
                      </td>
                      <td className="num py-3.5 text-right align-top text-ink-900">
                        {formatUsd(trade.valueUsd)}
                      </td>
                      <td className="py-3.5 text-right align-top">
                        {href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-ink-900 underline-offset-4 hover:underline"
                          >
                            Filing SEC
                          </a>
                        ) : (
                          <span className="text-ink-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        ) : (
          <p className="text-[15px] text-ink-500">
            Aún no hay compras de US$1 millón o más en esta ventana.
          </p>
        )}
      </PaywallGate>
    </section>
  );
}

function BacktestNote() {
  const backtest = INSIDER_BACKTEST;
  return (
    <div className="mt-4 border-t border-ink-200 pt-4">
      <p className="text-[15px] font-medium text-ink-900">
        Señal informativa, no una estrategia ganadora.
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-500">
        Backtest del {backtest.periodLabel}. Corte de precios el{" "}
        {formatIsoDate(backtest.priceAsOf)}. Corrida del {formatIsoDate(backtest.runOn)}.
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-500">
        {backtest.events} eventos (se excluyeron {backtest.excluded}). Promedio{" "}
        <SignedPct value={backtest.avgPct} /> (mediana <SignedPct value={backtest.medianPct} />
        ), contra SPY <SignedPct value={backtest.spyAvgPct} />. Le ganó al SPY en{" "}
        {backtest.beatSpy} de {backtest.events}. A 1 semana <SignedPct value={backtest.weekAvgPct} />
        . A 1 mes <SignedPct value={backtest.monthAvgPct} />.
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-500">
        {formatUsd(backtest.stakeUsd)} por evento: {formatUsd(backtest.valueUsd)}, contra{" "}
        {formatUsd(backtest.spyValueUsd)} en el SPY.
      </p>
      <p className="mt-3 text-[13px] leading-relaxed text-ink-900">{INSIDER_DISCLAIMER}</p>
    </div>
  );
}

function SignedPct({ value }: { value: number }) {
  const tone = value > 0 ? "text-positive" : value < 0 ? "text-negative" : "text-ink-900";
  return <span className={`num ${tone}`}>{formatSignedPct(value)}</span>;
}
