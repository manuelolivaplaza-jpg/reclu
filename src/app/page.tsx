import { Suspense } from "react";
import { connection } from "next/server";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Hero } from "@/components/sections/hero";
import { PortfolioRankings } from "@/components/sections/portfolio-rankings";
import { Statement } from "@/components/sections/statement";
import { HowItWorks } from "@/components/sections/how-it-works";
import { Pricing } from "@/components/sections/pricing";
import { FAQ } from "@/components/sections/faq";
import { Close } from "@/components/sections/close";
import { getPortfolios } from "@/lib/queries";
import { buildHeroCards } from "@/lib/hero-portfolios";
import { buildFeaturedHeroCards, FEATURED_HERO_SLUGS } from "@/lib/hero-featured";
import { getPerformanceSeriesAdmin } from "@/lib/queries";

import { getPortfolioRankings } from "@/lib/portfolio-rankings";

// Lee cookies de sesión (perfil/plan) para el muro de pago del ranking.
// Nunca se prerenderiza.
export const instant = false;

export default async function HomePage() {
  await connection();

  const rankings = await getPortfolioRankings();

  return (
    <>
      <SiteHeader />
      <main id="main">
        {/* El hero lee los portafolios del catálogo: va en un límite
            Suspense para que el resto de la home siga siendo estático. */}
        <Suspense fallback={<HeroFallback />}>
          <HeroWithPortfolios />
        </Suspense>
        <PortfolioRankings data={rankings} />
        <Statement />
        <HowItWorks />
        <Pricing />
        <FAQ />
        <Close />
      </main>
      <SiteFooter />
    </>
  );
}

/**
 * Datos del hero: hasta tres portafolios reales (no premium y con retorno
 * YTD conocido). Si el catálogo no entrega suficientes, se completa con la
 * muestra ilustrativa de `portfolio-data.ts`, marcada como "Ejemplo".
 */
async function HeroWithPortfolios() {
  await connection();
  const portfolios = await getPortfolios();
  // D28: Berkshire, Trump dice (centro) e IBIT con su serie real.
  const featuredIds = portfolios
    .filter((p) => (FEATURED_HERO_SLUGS as readonly string[]).includes(p.slug))
    .map((p) => p.id);
  const series = await getPerformanceSeriesAdmin(featuredIds);
  const featured = buildFeaturedHeroCards(portfolios, series);
  const cards = featured.length >= 3 ? featured : buildHeroCards(portfolios);
  return <Hero cards={cards} />;
}

/** Esqueleto mientras llegan los portafolios (misma altura que el hero). */
function HeroFallback() {
  return (
    <section className="bg-white pt-16 pb-20 md:pt-24 md:pb-28">
      <div className="container-page">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <div className="h-12 w-full max-w-2xl animate-pulse rounded-2xl bg-neutral-100 md:h-16" />
          <div className="mt-6 h-6 w-full max-w-xl animate-pulse rounded-full bg-neutral-100" />
        </div>
      </div>
    </section>
  );
}
