import { getPortfolioBySlug } from "@/lib/queries";
import { PortfolioView } from "@/components/portfolio/portfolio-view";

export const instant = false;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const portfolio = await getPortfolioBySlug(slug);
  return {
    title: portfolio?.name ?? "Portafolio",
    robots: { index: false },
    alternates: portfolio ? { canonical: `/portfolio/${portfolio.slug}` } : undefined,
  };
}

export default async function AppPortfolioPage({ params }: Props) {
  const { slug } = await params;
  return <PortfolioView slug={slug} inApp />;
}