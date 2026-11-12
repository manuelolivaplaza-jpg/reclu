import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPortfolioBySlug } from "@/lib/queries";
import { INFOPROBIDAD_SLUG } from "@/lib/infoprobidad";
import { withSeo } from "@/lib/seo";
import { CATEGORY_META } from "@/lib/types";
import { PortfolioView } from "@/components/portfolio/portfolio-view";

export const instant = false;

interface PortfolioPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Meta description: una línea, sin cortar palabras y dentro del largo que
 * muestran los buscadores (~158 caracteres). Las descripciones de la base
 * pueden ser bastante más largas.
 */
function metaDescription(text: string | null | undefined, max = 158): string {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  const base = (space > 80 ? cut.slice(0, space) : cut).replace(/[\s,;:.·-]+$/, "");
  return `${base}…`;
}

/**
 * Título honesto según el tipo de cartera: a un político se le sigue lo que
 * compró; a un fondo, su libro; a una corredora, su cartera recomendada.
 * El nombre del portafolio siempre va primero para que el título sirva en
 * resultados y en pestañas. La marca la agrega el template del layout raíz
 * (`%s · fraccion.si`), nunca a mano.
 */
function portfolioTitle(input: {
  name: string;
  category: string;
  source: string;
  esInfo: boolean;
  year: number;
}): string {
  const { name, category, source, esInfo, year } = input;
  if (esInfo) return `Empresas declaradas por autoridades — ${year}`;
  // Solo se habla de 13F cuando la fuente realmente es un 13F.
  const is13F = /^sec_?13f$/i.test(source);
  switch (category) {
    case "broker_cl":
      return `Cartera recomendada de ${name} — ${year}`;
    case "hedge_fund":
      return is13F
        ? `${name}: cartera 13F y pesos — ${year}`
        : `${name}: posiciones y pesos — ${year}`;
    case "model":
      return `${name}: cartera modelo y pesos — ${year}`;
    case "thematic":
      return `${name}: composición y pesos — ${year}`;
    case "public_disclosure":
      return `${name}: declaraciones y empresas — ${year}`;
    default:
      return `Qué compró ${name} — cartera ${year}`;
  }
}

export async function generateMetadata({ params }: PortfolioPageProps): Promise<Metadata> {
  const { slug } = await params;
  const portfolio = await getPortfolioBySlug(slug);
  if (!portfolio) notFound();
  const year = new Date().getFullYear();
  const esInfo = portfolio.slug === INFOPROBIDAD_SLUG;
  // Sin nombre no se arma un título con doble espacio: cae a "Portafolio".
  const name = String(portfolio.name ?? "").trim() || "Portafolio";
  const title = portfolioTitle({
    name,
    category: String(portfolio.category ?? ""),
    source: String(portfolio.source ?? ""),
    esInfo,
    year,
  });
  // Sin relleno: si la fuente no trae descripción, se usa solo la frase base.
  const rawDescription = esInfo
    ? metaDescription(portfolio.description)
    : metaDescription(
        `Composición, pesos y movimientos de ${name}. ${portfolio.description ?? ""}`,
      );
  const description = rawDescription.length > 0 ? rawDescription : undefined;
  // Frescura honesta: `dateModified` solo si updated_at es una fecha válida.
  const updatedTime = Date.parse(String(portfolio.updated_at ?? ""));
  const modifiedTime =
    Number.isFinite(updatedTime) ? new Date(updatedTime).toISOString() : null;
  // Palabras clave sin repetir la etiqueta de categoría (misma regla que el JSON-LD).
  const keywords = [
    ...new Set(
      [CATEGORY_META[portfolio.category]?.label, ...(portfolio.tags ?? [])].filter(
        (word): word is string => !!word && word.trim().length > 0,
      ),
    ),
  ];

  return withSeo(`/portfolio/${portfolio.slug}`, {
    title,
    ...(description ? { description } : {}),
    keywords,
    openGraph: {
      title,
      ...(description ? { description } : {}),
      type: "article",
      locale: "es_CL",
      siteName: "fraccion.si",
      ...(modifiedTime ? { modifiedTime } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      ...(description ? { description } : {}),
    },
  });
}

/**
 * La página solo aporta metadata y monta la ficha. El H1 y la jerarquía del
 * retorno viven en PortfolioView (hero + resumen), el mismo componente que usa
 * /app/portafolio/[slug]: así no se duplica el marcado entre público y app.
 */
export default async function PortfolioDetailPage({ params }: PortfolioPageProps) {
  const { slug } = await params;
  return <PortfolioView slug={slug} />;
}
