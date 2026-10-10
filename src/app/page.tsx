import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Hero } from "@/components/sections/hero";
import { Features } from "@/components/sections/features";
import { SocialProof, PortfoliosTeaser } from "@/components/sections/social-proof";
import { LivePortfolios } from "@/components/sections/live-portfolios";
import { HowItWorks } from "@/components/sections/how-it-works";
import { Pricing } from "@/components/sections/pricing";
import { FAQ, FinalCTA } from "@/components/sections/faq";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        <Hero />
        <SocialProof />
        <LivePortfolios />
        <Features />
        <HowItWorks />
        <PortfoliosTeaser />
        <Pricing />
        <FAQ />
        <FinalCTA />
      </main>
      <SiteFooter />
    </>
  );
}
