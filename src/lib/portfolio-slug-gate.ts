import { HIDDEN_DEMO_SLUGS } from "@/lib/demo-data";

/**
 * d65: 404 real para /portfolio/<slug-inexistente>.
 *
 * Con cacheComponents la ficha se transmite por streaming (loading.tsx): el
 * notFound() de la página llega cuando la respuesta ya salió con HTTP 200
 * (soft-404). El proxy decide antes de renderizar: si el slug no está entre
 * los portafolios activos (lectura pública, misma RLS que la ficha), reescribe
 * a una ruta inexistente y Next responde la página 404 con estado 404.
 *
 * Ante cualquier duda (sin Supabase, error de red, respuesta rara) NO bloquea:
 * deja pasar y la página resuelve como antes.
 */

const TTL_MS = 5 * 60 * 1000;
const SLUG_RE = /^\/portfolio\/([^/]+)\/?$/;

let cache: { at: number; slugs: Set<string> } | null = null;
let inflight: Promise<Set<string> | null> | null = null;

/** Slug de /portfolio/<slug> (un solo segmento), o null si la ruta es otra. */
export function portfolioSlugFromPath(pathname: string): string | null {
  const m = SLUG_RE.exec(pathname);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

function supabaseEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url.startsWith("https://") || url.includes("placeholder") || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

async function fetchActiveSlugs(): Promise<Set<string> | null> {
  const env = supabaseEnv();
  if (!env) return null;
  try {
    const res = await fetch(`${env.url}/rest/v1/portfolios?select=slug&is_active=eq.true`, {
      headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as unknown;
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const slugs = new Set<string>();
    for (const r of rows) {
      if (r && typeof (r as { slug?: unknown }).slug === "string") slugs.add((r as { slug: string }).slug);
    }
    return slugs.size ? slugs : null;
  } catch {
    return null;
  }
}

async function activeSlugs(now = Date.now()): Promise<Set<string> | null> {
  if (cache && now - cache.at < TTL_MS) return cache.slugs;
  inflight ??= fetchActiveSlugs().finally(() => {
    inflight = null;
  });
  const slugs = await inflight;
  if (slugs) cache = { at: now, slugs };
  // Si falla el refresco, se reutiliza la última lista conocida.
  return slugs ?? cache?.slugs ?? null;
}

/**
 * true solo si estamos SEGUROS de que el slug no existe: lista de activos
 * obtenida, el slug no está y tampoco es un slug oculto con redirección 308.
 */
export async function isUnknownPortfolioSlug(slug: string): Promise<boolean> {
  if (Object.prototype.hasOwnProperty.call(HIDDEN_DEMO_SLUGS, slug)) return false;
  const slugs = await activeSlugs();
  if (!slugs) return false;
  return !slugs.has(slug);
}

/** Solo para pruebas. */
export function __resetPortfolioSlugGate(): void {
  cache = null;
  inflight = null;
}
