import Link from "next/link";
import { ShowcaseList } from "./showcase-list";
import { STAGE_PORTFOLIOS } from "./portfolio-data";

const textLink =
  "text-[15px] text-ink-900 underline decoration-transparent underline-offset-[0.35em] [text-decoration-thickness:1px] transition-[text-decoration-color] duration-200 hover:decoration-ink-900";

/**
 * PortfolioStage — "Lo que está moviéndose." Las filas del hero más una cuarta.
 */
export function PortfolioStage() {
  return (
    <section id="portafolios" className="bg-white py-28 md:py-36">
      <div className="container-page">
        <div className="flex items-end justify-between gap-8">
          <div>
            <p className="label-line">Esta semana</p>
            <h2 className="type-section mt-4 text-ink-900">Lo que está moviéndose.</h2>
          </div>
          <Link href="/explore" className={"mb-2 hidden shrink-0 md:inline " + textLink}>
            Ver todos →
          </Link>
        </div>

        <div className="mt-14 md:mt-16">
          <ShowcaseList portfolios={STAGE_PORTFOLIOS} />
        </div>

        <Link href="/explore" className={"mt-10 inline-block md:hidden " + textLink}>
          Ver todos →
        </Link>
      </div>
    </section>
  );
}
