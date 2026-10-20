/**
 * SourceLine — una sola línea con las fuentes, entre dos filetes.
 * Sin chips, sin sombras, sin stats.
 *
 * Solo fuentes vivas o archivos curados: Capitol Trades y LarrainVial están
 * obsoletas (login wall) y no se anuncian. Lista completa en docs/sources.md.
 */
export function SourceLine() {
  return (
    <div className="border-y border-ink-200 py-6 md:py-7">
      <p className="label-line container-page text-center text-pretty tracking-[0.015em]">
        House Disclosure · Senate eFD · OGE 278-T · SEC EDGAR (13F, Form 4, 13D, 10-12B, XBRL) · ARK Invest · Global X · iShares · VanEck · Renta 4 · BTG Pactual · BICE · MBI · CMF · Superintendencia de Pensiones · InfoProbidad · Polymarket · Truth Social · X (@elonmusk) · CNBC
      </p>
    </div>
  );
}
