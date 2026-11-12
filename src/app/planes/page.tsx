import type { Metadata } from "next";
import Link from "next/link";
import { aiEnabled } from "@/lib/ai-flags";
import { BRAND_NAME } from "@/lib/brand";
import { withSeo } from "@/lib/seo";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Pricing } from "@/components/sections/pricing";
import { FAQ } from "@/components/sections/faq";
import { JsonLd } from "@/components/json-ld";
import { PLANS, formatClp } from "@/lib/plans";
import { absoluteUrl } from "@/lib/site";

/**
 * /planes — página pública de planes y precios (/pricing y /precios
 * redirigen aquí). Precios y beneficios salen de lib/plans.ts, la misma
 * fuente que el checkout (/upgrade): no hay cifras propias en esta página.
 */
export const metadata: Metadata = withSeo("/planes", {
  title: "Planes y precios",
  description: `Carteras de corredoras gratis. Pro por ${formatClp(PLANS.pro.monthlyPrice)} al mes o ${formatClp(PLANS.pro.annualTotalPrice)} al año; Elite por ${formatClp(PLANS.elite.monthlyPrice)} al mes. Sigue portafolios de políticos, fondos y ETFs. Consulta todas sus posiciones.`,
});

function offer(plan: "pro" | "elite") {
  return {
    "@type": "Offer",
    name: PLANS[plan].name,
    price: PLANS[plan].monthlyPrice,
    priceCurrency: "CLP",
    url: absoluteUrl(`/signup?plan=${plan}`),
  };
}

export default function PlanesPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="bg-white dark:bg-ink-950">
        <header className="container-page pb-5 pt-6 md:pb-8 md:pt-10">
          <nav aria-label="Migas de pan">
            <ol className="flex flex-wrap items-center gap-2 text-[12px] text-ink-500 dark:text-neutral-400">
              <li>
                <Link
                  href="/"
                  className="transition-colors hover:text-ink-900 focus-visible:outline-ink-900 dark:hover:text-white dark:focus-visible:outline-white"
                >
                  Inicio
                </Link>
              </li>
              <li aria-hidden className="text-ink-400 dark:text-neutral-500">
                /
              </li>
              <li aria-current="page" className="text-ink-900 dark:text-white">
                Planes
              </li>
            </ol>
          </nav>
        </header>

        {/* Único h1 de /planes: la sección de precios lo emite como tal. */}
        <Pricing aiOn={aiEnabled()} titleAs="h1" />

        <FAQ />

        <div className="container-page">
          <p className="border-t border-ink-300 pt-8 pb-12 text-[12px] leading-relaxed text-ink-500 dark:border-white/12 dark:text-neutral-400 md:pb-16">
            Precios en pesos chilenos (CLP). El plan anual se paga una vez y cubre 12 meses.{" "}
            {BRAND_NAME} no ejecuta órdenes ni entrega asesoría de inversión.
          </p>
        </div>
      </main>
      <SiteFooter />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "OfferCatalog",
          name: `Planes de ${BRAND_NAME}`,
          url: absoluteUrl("/planes"),
          itemListElement: [
            { "@type": "Offer", name: PLANS.free.name, price: PLANS.free.monthlyPrice, priceCurrency: "CLP", url: absoluteUrl("/signup") },
            offer("pro"),
            offer("elite"),
          ],
        }}
      />
    </>
  );
}
