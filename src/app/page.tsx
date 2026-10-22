import { connection } from "next/server";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Hero } from "@/components/sections/hero";
import { SourceLine } from "@/components/sections/source-line";
import { PortfolioRankings } from "@/components/sections/portfolio-rankings";
import { Statement } from "@/components/sections/statement";
import { HowItWorks } from "@/components/sections/how-it-works";
import { Pricing } from "@/components/sections/pricing";
import { FAQ } from "@/components/sections/faq";
import { Close } from "@/components/sections/close";

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
        <Hero />
        <SourceLine />
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
