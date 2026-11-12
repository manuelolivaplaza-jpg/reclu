import Link from "next/link";
import { FadeIn, StaggerList } from "@/components/ui/reveal";
import { ShowcaseList } from "./showcase-list";
import { STAGE_PORTFOLIOS } from "./portfolio-data";

const textLink =
  "text-[15px] text-ink-900 underline decoration-ink-300 underline-offset-[0.35em] [text-decoration-thickness:1px] transition-[text-decoration-color] duration-200 hover:decoration-ink-900 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-ink-900 dark:text-white dark:decoration-white/30 dark:hover:decoration-white dark:focus-visible:outline-white";

/**
 * PortfolioStage — "Lo que está moviéndose." Las filas del hero más una cuarta.
 * Titular tipográfico y filas separadas por filetes de 1px: sin tarjetas.
 */
export function PortfolioStage() {
  return (
    <section id="portafolios" className="pub-canvas section-y">
      <div className="container-page">
        <FadeIn>
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between md:gap-10">
            <div>
              <p className="label-line">Esta semana</p>
              <h2 className="type-section mt-4 text-ink-900 dark:text-white">Lo que está moviéndose.</h2>
            </div>
            <Link href="/explore" className={"hidden shrink-0 items-center gap-1 md:inline-flex md:pb-3 " + textLink}>
              Ver todos <span aria-hidden>→</span>
            </Link>
          </div>
        </FadeIn>

        <StaggerList className="mt-12 md:mt-16">
          <ShowcaseList portfolios={STAGE_PORTFOLIOS} />
        </StaggerList>

        <Link href="/explore" className={"mt-8 inline-flex items-center gap-1 md:hidden " + textLink}>
          Ver todos <span aria-hidden>→</span>
        </Link>
      </div>
    </section>
  );
}
