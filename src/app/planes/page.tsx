import type { Metadata } from "next";
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
  description: `Carteras de corredoras gratis. Plan Pro desde ${formatClp(PLANS.pro.monthlyPrice)} CLP al mes y Elite desde ${formatClp(PLANS.elite.monthlyPrice)} CLP al mes para seguir portafolios y ver todas sus acciones.`,
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
      <main id="main">
        <h1 className="sr-only">Planes y precios de reclu.cl</h1>
        <Pricing />
        <FAQ />
      </main>
      <SiteFooter />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "OfferCatalog",
          name: "Planes de reclu.cl",
          url: absoluteUrl("/planes"),
          itemListElement: [
            { "@type": "Offer", name: "Gratis", price: 0, priceCurrency: "CLP", url: absoluteUrl("/signup") },
            offer("pro"),
            offer("elite"),
          ],
        }}
      />
    </>
  );
}
