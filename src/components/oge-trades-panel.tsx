import Link from "next/link";
import {
  formatClDate,
  formatUsdRange,
  OGE_TRUMP_PDF,
  type OgeTradeView,
} from "@/lib/disclosure-trades";

const SIDE_LABEL = { purchase: "Compra", sale: "Venta", exchange: "Canje" };

export function OgeTradesPanel({
  trades,
  demo,
}: {
  trades: OgeTradeView[];
  demo: boolean;
}) {
  const reportUrl = trades[0]?.reportUrl || OGE_TRUMP_PDF;
  return (
    <section className="mb-12">
      <h2 className="text-[15px] font-medium text-ink-900">Declaración OGE 278-T</h2>
      <p className="mt-3 text-[15px] text-ink-600">
        La OGE publica con hasta 45 días de atraso. El rendimiento se mide desde la publicación.
      </p>
      <p className="mt-1 text-[15px] text-ink-600">
        Simulación histórica con fines informativos. No es recomendación de inversión.
      </p>
      <p className="mt-3 text-[13px] text-ink-500">
        Los montos son tramos del formulario, no un precio exacto.
        {demo
          ? " Este borrador viene del OCR y sigue pendiente de revisión: no genera alerta."
          : " Solo se muestran filas revisadas contra el PDF."}
      </p>
      <Link
        href={reportUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-block text-[13px] font-medium text-ink-900 underline-offset-4 hover:underline"
      >
        PDF OGE
      </Link>
      {trades.length === 0 ? (
        <p className="mt-4 text-[15px] text-ink-500">
          Aún no hay operaciones verificadas. La composición se publica después de la revisión manual.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-[15px]">
          <thead>
            <tr className="border-b border-ink-200 text-left text-[13px] text-ink-500">
              <th className="py-3 font-normal">Activo</th>
              <th className="py-3 font-normal">Operación</th>
              <th className="py-3 font-normal">Fecha operación</th>
              <th className="py-3 font-normal">Publicación</th>
              <th className="py-3 text-right font-normal">Tramo</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => (
              <tr key={`${trade.reportUrl}-${trade.lineNo}`} className="border-b border-ink-200">
                <td className="py-3.5">
                  <div className="font-medium text-ink-900">{trade.symbol ?? "Sin ticker"}</div>
                  <div className="text-[13px] text-ink-500">{trade.description}</div>
                </td>
                <td className="py-3.5 text-ink-900">{SIDE_LABEL[trade.side]}</td>
                <td className="py-3.5 text-ink-900">
                  {trade.transDateUncertain ? "Fecha dudosa" : formatClDate(trade.transDate)}
                </td>
                <td className="py-3.5 text-ink-900">{formatClDate(trade.reportPublished)}</td>
                <td className="py-3.5 text-right tabular-nums text-ink-900">
                  {formatUsdRange(trade.amountMin, trade.amountMax)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </section>
  );
}
