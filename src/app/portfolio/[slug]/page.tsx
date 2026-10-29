import { getPortfolioBySlug } from "@/lib/queries";
import { INFOPROBIDAD_SLUG } from "@/lib/infoprobidad";
import { absoluteUrl } from "@/lib/site";
import { PortfolioView } from "@/components/portfolio/portfolio-view";

export const instant = false;

interface PortfolioPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PortfolioPageProps) {
  const { slug } = await params;
  const portfolio = await getPortfolioBySlug(slug);
  if (!portfolio) return { title: "Portafolio no encontrado" };
  const year = new Date().getFullYear();
  const esInfo = portfolio.slug === INFOPROBIDAD_SLUG;
  const title = esInfo
    ? `Empresas declaradas por autoridades — ${year} | Reclu`
    : `Qué compró ${portfolio.name} — cartera ${year} | Reclu`;
  const description = esInfo
    ? portfolio.description
    : `Composición, pesos y movimientos de ${portfolio.name}. ${portfolio.description}`;
  return {
    title,
    description,
    alternates: {
      canonical: `/portfolio/${portfolio.slug}`,
    },
    openGraph: {
      title,
      description,
      url: absoluteUrl(`/portfolio/${portfolio.slug}`),
      type: "article",
      locale: "es_CL",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function PortfolioDetailPage({ params }: PortfolioPageProps) {
  const { slug } = await params;
  return <PortfolioView slug={slug} />;
}
