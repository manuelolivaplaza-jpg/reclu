import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Hero } from "@/components/sections/hero";
import { SourceLine } from "@/components/sections/source-line";
import { PortfolioStage } from "@/components/sections/portfolio-stage";
import { Statement } from "@/components/sections/statement";
import { HowItWorks } from "@/components/sections/how-it-works";
import { Pricing } from "@/components/sections/pricing";
import { FAQ } from "@/components/sections/faq";
import { Close } from "@/components/sections/close";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <Hero />
        <SourceLine />
        <PortfolioStage />
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
