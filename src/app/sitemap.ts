import type { MetadataRoute } from "next";
import { getSitemapPortfolios } from "@/lib/sitemap-data";
import { absoluteUrl } from "@/lib/site";
import { apiPublicEnabled } from "@/lib/api-keys";
import { communityEnabled } from "@/lib/community";
import { FICHAS_APRENDE } from "@/content/aprende";

/**
 * Sin segment config: `instant` y `revalidate` no son compatibles con
 * cacheComponents en rutas de metadata (Next 16 los rechaza en build).
 * La lectura de portafolios vive en `@/lib/sitemap-data`: pide solo
 * `slug` + `updated_at` y se cachea 1 h con los tags públicos, así que el
 * pipeline diario la invalida vía /api/revalidate y el sitemap se regenera.
 */

/**
 * Sitemap dinámico: páginas estáticas + todas las páginas de portafolio
 * activas (con lastModified desde la última actualización del dato).
 * Si la base está vacía, sin configurar o falla, `getSitemapPortfolios`
 * cae a la lista demo y el sitemap igual lista los portafolios de ejemplo.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const base = absoluteUrl("/");

  const staticEntries: MetadataRoute.Sitemap = [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: absoluteUrl("/explore"), lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: absoluteUrl("/ranking"), lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    // /login y /signup no se listan: robots los bloquea y no aportan a SEO.
    { url: absoluteUrl("/planes"), lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: absoluteUrl("/terminos"), lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: absoluteUrl("/privacidad"), lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: absoluteUrl("/disclaimer"), lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    // Contenido editorial estático. Solo rutas que existen en src/app:
    // si se agrega una ficha o herramienta nueva, sumarla aquí.
    { url: absoluteUrl("/aprende"), lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: absoluteUrl("/herramientas"), lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: absoluteUrl("/herramientas/backtest"), lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: absoluteUrl("/herramientas/impuestos"), lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: absoluteUrl("/medios"), lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    ...FICHAS_APRENDE.map((ficha) => ({
      url: absoluteUrl(`/aprende/${ficha.slug}`),
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    // Encendidos por flag: si la función está apagada, la ruta responde 404
    // (o queda sin uso), así que no debe anunciarse en el sitemap.
    ...(apiPublicEnabled()
      ? [
          {
            url: absoluteUrl("/api-docs"),
            lastModified: now,
            changeFrequency: "monthly" as const,
            priority: 0.6,
          },
        ]
      : []),
    ...(communityEnabled()
      ? [
          {
            url: absoluteUrl("/creadores"),
            lastModified: now,
            changeFrequency: "weekly" as const,
            priority: 0.5,
          },
        ]
      : []),
    // Tickers más comunes (páginas por acción, F7) — el resto se descubre
    // vía enlaces internos y canonical.
    ...[
      "nvda", "aapl", "msft", "tsla", "amzn", "googl",
      "meta", "pltr", "sqm-b", "copec", "xom", "ba",
    ].map((symbol) => ({
      url: absoluteUrl(`/accion/${symbol}`),
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];

  // D75: lectura mínima cacheada (solo slug + updated_at). Antes esta ruta
  // llamaba getPortfolios() completo sin caché en cada request (8,4 s TTFB).
  const portfolios = await getSitemapPortfolios();

  const portfolioEntries: MetadataRoute.Sitemap = portfolios.map((portfolio) => {
    const entry: MetadataRoute.Sitemap[number] = {
      url: absoluteUrl(`/portfolio/${portfolio.slug}`),
      changeFrequency: "weekly",
      priority: 0.8,
    };
    // Mismo lastModified que hoy (updated_at); si la columna viniera nula se
    // omite en vez de emitir una fecha inválida en el XML.
    if (portfolio.updatedAt) entry.lastModified = new Date(portfolio.updatedAt);
    return entry;
  });

  return [...staticEntries, ...portfolioEntries];
}
