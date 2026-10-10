import Link from "next/link";
import { PortfolioRow } from "@/components/portfolio-row";
import { STAGE_PORTFOLIOS } from "./portfolio-data";

/**
 * PortfolioStage — "Lo que está moviéndose." Las filas del hero más una cuarta.
 */
export function PortfolioStage() {
  return (
    <section id="portafolios" className="bg-white py-20 md:py-28">
      <div className="container-page">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="label-line">Esta semana</p>
            <h2 className="type-section mt-3 text-ink-900">Lo que está moviéndose.</h2>
          </div>
          <Link
            href="/explore"
            className="hidden shrink-0 text-[15px] text-ink-900 underline-offset-4 hover:underline md:block"
          >
            Ver todos →
          </Link>
        </div>

        <div className="mt-10">
          {STAGE_PORTFOLIOS.map((p, i) => (
            <PortfolioRow
              key={p.slug}
              portfolio={p}
              isLast={i === STAGE_PORTFOLIOS.length - 1}
            />
          ))}
        </div>

        <Link
          href="/explore"
          className="mt-8 inline-block text-[15px] text-ink-900 underline-offset-4 hover:underline md:hidden"
        >
          Ver todos →
        </Link>
      </div>
    </section>
  );
}
