/**
 * Lectura mínima para el sitemap (D75).
 *
 * Antes `src/app/sitemap.ts` llamaba `getPortfolios()` completo — `select("*")`
 * con todos los campos y filtros de la tabla — en cada request: 8,4 s de TTFB
 * en staging. Aquí se pide solo lo que el sitemap usa (`slug`, `updated_at`)
 * y se cachea con `"use cache"` + `cacheLife("hours")`, igual que el resto de
 * las lecturas públicas (D36).
 *
 * Mismas reglas que `getPortfolios()`:
 * - Sin Supabase configurado -> lista demo sin los slugs ocultos (la aplica
 *   `getPortfolios`, no se duplica aquí).
 * - Con Supabase: solo filas activas (`is_active = true`); con el cliente
 *   anónimo sin cookies la RLS `portfolios public read` ya limita a activas.
 * - Con error o base vacía, se cae a `getPortfolios()`: respeta
 *   `demoFallbackAllowed()` y nunca lanza, así el build no rompe.
 */

import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { PORTFOLIOS_TAG, PUBLIC_DATA_TAG } from "@/lib/cache-tags";
import { getPortfolios } from "@/lib/queries";

/** Entrada mínima del sitemap: lo único que necesita la ruta de metadata. */
export type SitemapPortfolio = {
  slug: string;
  /** `portfolios.updated_at` tal cual lo devuelve PostgREST (ISO 8601). */
  updatedAt: string | null;
};

/** True cuando Supabase está configurado con valores reales (no placeholder). */
function isSupabaseLive(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return url.startsWith("https://") && !url.includes("placeholder");
}

/**
 * Consulta mínima cacheada (1 h, tags `public-data` + `portfolios`, los
 * mismos que invalida el pipeline diario vía /api/revalidate).
 *
 * Un error se lanza en vez de devolver [] para no cachear una lista vacía
 * por un fallo puntual; el llamador decide el fallback.
 */
async function getSitemapPortfoliosCached(): Promise<SitemapPortfolio[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(PUBLIC_DATA_TAG, PORTFOLIOS_TAG);

  const supabase = createPublicClient();
  // Mismo orden que `getPortfolios()` (followers desc) para que el XML salga
  // con las mismas entradas y en el mismo orden que antes. PostgREST permite
  // ordenar por una columna que no se pide en el select.
  const { data, error } = await supabase
    .from("portfolios")
    .select("slug,updated_at")
    .eq("is_active", true)
    .order("followers", { ascending: false });

  if (error) throw new Error(error.message);

  const rows: SitemapPortfolio[] = [];
  for (const row of data ?? []) {
    const raw = row as { slug?: unknown; updated_at?: unknown };
    if (typeof raw.slug !== "string" || raw.slug.length === 0) continue;
    rows.push({
      slug: raw.slug,
      updatedAt: typeof raw.updated_at === "string" ? raw.updated_at : null,
    });
  }
  return rows;
}

/**
 * Respaldo con la ruta actual: `getPortfolios()` ya aplica los filtros de
 * ocultos/demos y nunca lanza (devuelve [] si todo falla).
 */
async function getSitemapPortfoliosFallback(): Promise<SitemapPortfolio[]> {
  try {
    const list = await getPortfolios();
    return list.map((portfolio) => ({
      slug: portfolio.slug,
      updatedAt:
        typeof portfolio.updated_at === "string" ? portfolio.updated_at : null,
    }));
  } catch (err) {
    console.warn(
      "[reclu] getSitemapPortfolios fallback error:",
      err instanceof Error ? err.message : String(err),
    );
    return [];
  }
}

/**
 * Portafolios del sitemap: activos de la base (solo slug + updated_at),
 * cacheados 1 h. Sin Supabase, con error o con la base vacía cae a la lista
 * que ya servía el sitemap (`getPortfolios`), así las URLs no cambian.
 */
export async function getSitemapPortfolios(): Promise<SitemapPortfolio[]> {
  // Modo demo puro (o tests): no hay consulta que cachear.
  if (!isSupabaseLive()) return getSitemapPortfoliosFallback();

  try {
    const rows = await getSitemapPortfoliosCached();
    if (rows.length > 0) return rows;
  } catch (err) {
    console.warn(
      "[reclu] getSitemapPortfolios error:",
      err instanceof Error ? err.message : String(err),
    );
  }

  // Base vacía (seed sin correr en staging) o error: mismo fallback que hoy.
  return getSitemapPortfoliosFallback();
}
