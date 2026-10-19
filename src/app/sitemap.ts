import type { MetadataRoute } from "next";
import { getPortfolios } from "@/lib/queries";
import { absoluteUrl } from "@/lib/site";

// El sitemap consulta la base por request; con cacheComponents no puede
// quedar prerenderizado con datos viejos.
export const instant = false;

/**
 * Sitemap dinámico: páginas estáticas + todas las páginas de portafolio
 * activas (con lastModified desde la última actualización del dato).
 * Si la base está vacía o sin configurar, getPortfolios cae a demo y el
 * sitemap igual lista los portafolios de ejemplo.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const base = absoluteUrl("/");

  const staticEntries: MetadataRoute.Sitemap = [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: absoluteUrl("/explore"), lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: absoluteUrl("/login"), lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: absoluteUrl("/signup"), lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: absoluteUrl("/terminos"), lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: absoluteUrl("/privacidad"), lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: absoluteUrl("/disclaimer"), lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];

  const portfolios = await getPortfolios().catch(() => []);

  const portfolioEntries: MetadataRoute.Sitemap = portfolios.map((portfolio) => ({
    url: absoluteUrl(`/portfolio/${portfolio.slug}`),
    lastModified: new Date(portfolio.updated_at),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticEntries, ...portfolioEntries];
}
