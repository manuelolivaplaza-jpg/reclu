import Link from "next/link";

/**
 * B1/T3 — resumen público de un ticker (regla 1b de Manu).
 *
 * Se muestra en /accion/<símbolo> cuando el rol actual ve 0 carteras (caso
 * normal de un anónimo o de un plan gratis: las posiciones son de pago) pero
 * el ticker existe.
 *
 * Solo lleva: símbolo, nombre del activo, sector (si existe) y cuántos
 * portafolios activos lo tienen, más el CTA a /planes. PROHIBIDO aquí: pesos,
 * montos, cantidades, fechas de compra o entrada, cambios, y nombres o slugs
 * de las carteras que lo tienen.
 *
 * Sin bloques vacíos: si no hay nombre distinto del símbolo no hay segunda
 * línea; sin sector no hay fila de sector; con 0 portafolios no se muestra la
 * frase ni el CTA. Componente puro (sin hooks) para poder renderizarlo en
 * cualquier contexto y probarlo con `renderToStaticMarkup`.
 */

export interface AccionPublicSummaryProps {
  symbol: string;
  name?: string | null;
  sector?: string | null;
  portfolioCount?: number | null;
}

export function AccionPublicSummary({
  symbol,
  name,
  sector,
  portfolioCount,
}: AccionPublicSummaryProps) {
  const cleanName = (name ?? "").trim();
  const showName =
    cleanName.length > 0 && cleanName.toUpperCase() !== symbol.trim().toUpperCase();

  const cleanSector = (sector ?? "").trim();

  const count =
    typeof portfolioCount === "number" && Number.isFinite(portfolioCount)
      ? Math.max(0, Math.trunc(portfolioCount))
      : 0;

  return (
    <header>
      <p className="label-line">Acción · Ticker</p>
      <h1 className="type-section mt-3 text-ink-900">{symbol}</h1>
      {showName && <p className="type-body mt-2 text-ink-500">{cleanName}</p>}

      {cleanSector && (
        <dl className="mt-8 flex items-baseline gap-3 border-t border-ink-200 pt-4">
          <dt className="text-[11px] uppercase tracking-[0.08em] text-ink-500">
            Sector
          </dt>
          <dd className="text-[15px] text-ink-900">{cleanSector}</dd>
        </dl>
      )}

      {count > 0 && (
        <p className="mt-8 text-[17px] leading-snug text-ink-900">
          Está en <span className="num">{count}</span>{" "}
          {count === 1 ? "portafolio" : "portafolios"} de Fraccion.
        </p>
      )}

      {count > 0 && (
        <div className="mt-6 border border-ink-200 p-6 md:p-8">
          <p className="text-[15px] font-medium text-ink-900">
            El detalle de cada cartera es para suscriptores
          </p>
          <p className="mt-2 max-w-[52ch] text-[13px] leading-relaxed text-ink-500">
            Quién la tiene, con qué peso y desde cuándo se ve en cada cartera.
            Este resumen público solo muestra datos agregados.
          </p>
          <Link
            href="/planes"
            className="mt-4 inline-flex h-11 items-center rounded-full bg-ink-900 px-5 text-sm font-medium text-white transition-colors hover:bg-black"
          >
            Suscríbete para ver quién la tiene
          </Link>
        </div>
      )}
    </header>
  );
}
