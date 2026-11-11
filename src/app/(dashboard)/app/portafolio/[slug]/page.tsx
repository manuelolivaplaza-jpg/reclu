import type { Metadata } from "next";
import { getPortfolioBySlug } from "@/lib/queries";
import { PortfolioView } from "@/components/portfolio/portfolio-view";

export const instant = false;

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * Ficha dentro de la app. No se indexa (vive detrás de sesión) y su canónico
 * apunta a la ficha pública para no competir consigo misma en buscadores.
 * El título queda limpio: el template del layout raíz agrega la marca
 * (`%s · fraccion.si`).
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const portfolio = await getPortfolioBySlug(slug);
  const name = String(portfolio?.name ?? "").trim();
  const description = String(portfolio?.description ?? "").replace(/\s+/g, " ").trim();
  const title = name.length > 0 ? name : "Portafolio";
  return {
    title,
    ...(description ? { description } : {}),
    robots: { index: false, follow: true },
    alternates: portfolio ? { canonical: `/portfolio/${portfolio.slug}` } : undefined,
    openGraph: {
      title,
      ...(description ? { description } : {}),
      locale: "es_CL",
      type: "website",
      siteName: "fraccion.si",
    },
  };
}

export default async function AppPortfolioPage({ params }: Props) {
  const { slug } = await params;
  return <PortfolioView slug={slug} inApp />;
}
