import { withSeo } from "@/lib/seo";
import { Suspense } from "react";
import { connection } from "next/server";
import { PhoneMockups, PhoneMockupsSkeleton } from "@/components/sections/phone-mockups";
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
import { buildFeaturedHeroCards, featuredSeriesSlugs } from "@/lib/hero-featured";
import { getPerformanceSeriesAdmin } from "@/lib/queries";

import { getPortfolioRankings } from "@/lib/portfolio-rankings";

// d65: shell estático prerenderizado (header, hero, secciones fijas y footer).
// Solo el ranking (cookies: muro de pago) y las tarjetas del hero van en
// streaming dentro de Suspense.

export const metadata = withSeo("/", {
  title: { absolute: "reclu.cl — Seguimiento de portafolios y alertas inteligentes" },
  description:
    "Sigue los portafolios de políticos de EE.UU., corredoras chilenas y fondos. Recibe alertas por email con análisis AI cuando hay cambios.",
});

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        {/* El hero lee los portafolios del catálogo: va en un límite
            Suspense para que el resto de la home siga siendo estático. */}
        <Hero
          mockups={
            <Suspense fallback={<PhoneMockupsSkeleton />}>
              <HeroMockups />
            </Suspense>
          }
        />
        <Suspense fallback={<RankingsFallback />}>
          <RankingsWithSession />
        </Suspense>
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

/** Ranking: depende del plan del usuario (cookies), por eso va en streaming. */
async function RankingsWithSession() {
  await connection();
  const rankings = await getPortfolioRankings();
  return <PortfolioRankings data={rankings} />;
}

/** Reserva el alto aproximado del ranking para no mover la página (CLS). */
function RankingsFallback() {
  return (
    <section className="bg-white py-24 md:py-32" aria-busy="true">
      <div className="mx-auto h-[720px] w-full max-w-[1200px] animate-pulse rounded-3xl bg-neutral-50 px-4 sm:px-6 md:px-8" />
    </section>
  );
}

/**
 * Tarjetas del hero: hasta tres portafolios reales (no premium y con retorno
 * YTD conocido). Si el catálogo no entrega suficientes, se completa con la
 * muestra ilustrativa de `portfolio-data.ts`, marcada como "Ejemplo".
 * Lecturas públicas cacheadas ("use cache"), sin cookies.
 */
async function HeroMockups() {
  await connection();
  const portfolios = await getPortfolios();
  // D28: Berkshire, Trump dice (centro) e IBIT con su serie real.
  const featuredIds = portfolios
    .filter((p) => featuredSeriesSlugs().includes(p.slug))
    .map((p) => p.id);
  const series = await getPerformanceSeriesAdmin(featuredIds);
  const featured = buildFeaturedHeroCards(portfolios, series);
  const cards = featured.length >= 3 ? featured : buildHeroCards(portfolios);
  return <PhoneMockups cards={cards} />;
}
