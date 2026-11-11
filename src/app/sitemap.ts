import type { MetadataRoute } from "next";
import {
  MAX_SITEMAP_TICKERS,
  SITEMAP_STATIC_LAST_MODIFIED,
  getSitemapPortfolios,
} from "@/lib/sitemap-data";
import { getKnownTickerSymbols } from "@/lib/public-tickers";
import { isLegacyPortfolioSlug } from "@/lib/portfolio-canonical";
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
 * Los tickers vienen de `@/lib/public-tickers` con la misma cache (1 h).
 */

/**
 * Sitemap dinámico: páginas estáticas + todas las páginas de ticker reales
 * + todas las páginas de portafolio activas (con lastModified desde la
 * última actualización del dato).
 *
 * Los tickers salen de `getKnownTickerSymbols()` (cacheada 1 h): todos los
 * símbolos reales del último snapshot más los de `ticker_profile`, ordenados
 * por número de carteras y en minúsculas, que es la forma canónica de
 * `/accion/[symbol]`. Se cortan en `MAX_SITEMAP_TICKERS` porque el resto se
 * descubre por enlaces internos.
 *
 * Si la base está vacía, sin configurar o falla, `getSitemapPortfolios` cae
 * a la lista demo y el sitemap igual lista los portafolios de ejemplo; los
 * tickers simplemente no se listan (sin datos no hay páginas que anunciar).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Fecha de contenido fija (ver `SITEMAP_STATIC_LAST_MODIFIED`): las rutas
  // estáticas no cambian entre requests, así que no se anuncia "ahora".
  const staticLastModified = new Date(SITEMAP_STATIC_LAST_MODIFIED);
  const base = absoluteUrl("/");

  const staticEntries: MetadataRoute.Sitemap = [
    { url: base, lastModified: staticLastModified, changeFrequency: "weekly", priority: 1.0 },
    { url: absoluteUrl("/explore"), lastModified: staticLastModified, changeFrequency: "daily", priority: 0.9 },
    { url: absoluteUrl("/ranking"), lastModified: staticLastModified, changeFrequency: "weekly", priority: 0.9 },
    // /login y /signup no se listan: robots los bloquea y no aportan a SEO.
    { url: absoluteUrl("/planes"), lastModified: staticLastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: absoluteUrl("/terminos"), lastModified: staticLastModified, changeFrequency: "yearly", priority: 0.2 },
    { url: absoluteUrl("/privacidad"), lastModified: staticLastModified, changeFrequency: "yearly", priority: 0.2 },
    { url: absoluteUrl("/disclaimer"), lastModified: staticLastModified, changeFrequency: "yearly", priority: 0.2 },
    // Contenido editorial estático. Solo rutas que existen en src/app:
    // si se agrega una ficha o herramienta nueva, sumarla aquí.
    { url: absoluteUrl("/aprende"), lastModified: staticLastModified, changeFrequency: "monthly", priority: 0.7 },
    { url: absoluteUrl("/metodologia"), lastModified: staticLastModified, changeFrequency: "monthly", priority: 0.6 },
    { url: absoluteUrl("/trump-dice"), lastModified: staticLastModified, changeFrequency: "weekly", priority: 0.7 },
    { url: absoluteUrl("/herramientas"), lastModified: staticLastModified, changeFrequency: "monthly", priority: 0.6 },
    { url: absoluteUrl("/herramientas/backtest"), lastModified: staticLastModified, changeFrequency: "monthly", priority: 0.6 },
    { url: absoluteUrl("/herramientas/impuestos"), lastModified: staticLastModified, changeFrequency: "monthly", priority: 0.6 },
    { url: absoluteUrl("/medios"), lastModified: staticLastModified, changeFrequency: "monthly", priority: 0.5 },
    ...FICHAS_APRENDE.map((ficha) => ({
      url: absoluteUrl(`/aprende/${ficha.slug}`),
      lastModified: staticLastModified,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    // Encendidos por flag: si la función está apagada, la ruta responde 404
    // (o queda sin uso), así que no debe anunciarse en el sitemap.
    ...(apiPublicEnabled()
      ? [
          {
            url: absoluteUrl("/api-docs"),
            lastModified: staticLastModified,
            changeFrequency: "monthly" as const,
            priority: 0.6,
          },
        ]
      : []),
    ...(communityEnabled()
      ? [
          {
            url: absoluteUrl("/creadores"),
            lastModified: staticLastModified,
            changeFrequency: "weekly" as const,
            priority: 0.5,
          },
        ]
      : []),
  ];

  // Ambas lecturas están cacheadas (1 h) y ninguna debe romper el sitemap:
  // `getSitemapPortfolios` ya cae a la lista demo y `safeKnownTickers` a [].
  const [tickers, portfolios] = await Promise.all([
    safeKnownTickers(),
    // D75: lectura mínima cacheada (solo slug + updated_at). Antes esta ruta
    // llamaba getPortfolios() completo sin caché en cada request (8,4 s TTFB).
    getSitemapPortfolios(),
  ]);

  // Páginas de ticker: solo símbolos reales, en minúsculas (forma canónica
  // de /accion/[symbol]), sin duplicados y cortadas en MAX_SITEMAP_TICKERS.
  // El orden es el de `getKnownTickerSymbols()`: portfolioCount desc.
  const seenSymbols = new Set<string>();
  const tickerEntries: MetadataRoute.Sitemap = [];
  for (const row of tickers) {
    const raw =
      typeof row.symbol === "string" ? row.symbol.trim().toLowerCase() : "";
    // Solo lo que cabe en un segmento de URL: letras, dígitos, punto y guion.
    // Un símbolo con "/" o espacios apuntaría a una ruta que no existe.
    const symbol = /^[a-z0-9][a-z0-9.-]*$/.test(raw) ? raw : "";
    if (!symbol || seenSymbols.has(symbol)) continue;
    seenSymbols.add(symbol);
    if (tickerEntries.length >= MAX_SITEMAP_TICKERS) break;
    tickerEntries.push({
      url: absoluteUrl(`/accion/${symbol}`),
      changeFrequency: "daily",
      priority: 0.8,
    });
  }

  const portfolioEntries: MetadataRoute.Sitemap = [];
  for (const portfolio of portfolios) {
    // Slugs viejos: /portfolio/<slug-antiguo> no es la URL canónica, así que
    // anunciarlo duplicaría contenido y repartiría señales entre dos URLs.
    if (isLegacyPortfolioSlug(portfolio.slug)) continue;
    const entry: MetadataRoute.Sitemap[number] = {
      url: absoluteUrl(`/portfolio/${portfolio.slug}`),
      changeFrequency: "weekly",
      priority: 0.8,
    };
    // Mismo lastModified que hoy (updated_at); si la columna viniera nula se
    // omite en vez de emitir una fecha inválida en el XML.
    if (portfolio.updatedAt) entry.lastModified = new Date(portfolio.updatedAt);
    portfolioEntries.push(entry);
  }

  return [...staticEntries, ...tickerEntries, ...portfolioEntries];
}

/**
 * Tickers del sitemap a prueba de fallos: el contrato de
 * `getKnownTickerSymbols()` ya devuelve [] con error o sin Supabase, pero si
 * igual lanzara, el sitemap sigue sirviendo el resto de las rutas.
 */
async function safeKnownTickers(): Promise<
  Awaited<ReturnType<typeof getKnownTickerSymbols>>
> {
  try {
    return await getKnownTickerSymbols();
  } catch (err) {
    console.warn(
      "[reclu] sitemap tickers error:",
      err instanceof Error ? err.message : String(err),
    );
    return [];
  }
}
