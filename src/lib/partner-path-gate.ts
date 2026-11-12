/**
 * B1/T3 — 404 real para /p/<socio>/<tipo> inexistente.
 *
 * Mismo patrón que `portfolio-slug-gate.ts` (d65): la página `/p/[socio]/[tipo]`
 * hace `await connection()` y recién después `notFound()`, así que con
 * streaming el 404 llega dentro de una respuesta HTTP 200 (soft-404). El proxy
 * decide antes de renderizar y reescribe a una ruta inexistente para que Next
 * responda la página 404 con estado 404.
 *
 * Reglas:
 *  - `tipo` fuera del catálogo de widgets del socio => 404, sin consultar nada
 *    (misma función que usa la página: `isPartnerWidgetTipo`).
 *  - `socio` con formato inválido => 404 (la página tampoco lo sirve).
 *  - Socio ausente de la lista de socios activos => 404, solo si la lista
 *    llegó con datos.
 *  - Ante cualquier duda (sin Supabase, error de red, timeout, respuesta
 *    vacía) NO bloquea: deja pasar y la página resuelve como siempre.
 *
 * La lista se lee con la clave anónima (política RLS "partners public read
 * active") y se cachea 5 min, igual que la lista de slugs de portafolios.
 */

import {
  isPartnerWidgetTipo,
  isValidPartnerSlug,
  normalizePartnerSlug,
} from "@/lib/partners";

const TTL_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 1500;
const PARTNER_PATH_RE = /^\/p\/([^/]+)\/([^/]+)\/?$/;

export interface PartnerPath {
  socio: string;
  tipo: string;
}

/** Segmentos de /p/<socio>/<tipo>, o null si la ruta es otra. */
export function partnerPathFromPath(pathname: string): PartnerPath | null {
  const match = PARTNER_PATH_RE.exec(pathname);
  if (!match) return null;
  try {
    return {
      socio: decodeURIComponent(match[1]),
      tipo: decodeURIComponent(match[2]),
    };
  } catch {
    return null;
  }
}

function supabaseEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url.startsWith("https://") || url.includes("placeholder") || !key) {
    return null;
  }
  return { url: url.replace(/\/$/, ""), key };
}

let cache: { at: number; slugs: Set<string> } | null = null;
let inflight: Promise<Set<string> | null> | null = null;

async function fetchActivePartnerSlugs(): Promise<Set<string> | null> {
  const env = supabaseEnv();
  if (!env) return null;
  try {
    const res = await fetch(
      `${env.url}/rest/v1/partners?select=slug&activo=eq.true`,
      {
        headers: {
          apikey: env.key,
          Authorization: `Bearer ${env.key}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as unknown;
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const slugs = new Set<string>();
    for (const row of rows) {
      const slug = (row as { slug?: unknown }).slug;
      if (typeof slug === "string" && slug.length > 0) {
        slugs.add(normalizePartnerSlug(slug));
      }
    }
    return slugs.size > 0 ? slugs : null;
  } catch {
    return null;
  }
}

async function activePartnerSlugs(now = Date.now()): Promise<Set<string> | null> {
  if (cache && now - cache.at < TTL_MS) return cache.slugs;
  inflight ??= fetchActivePartnerSlugs().finally(() => {
    inflight = null;
  });
  const slugs = await inflight;
  if (slugs) cache = { at: now, slugs };
  // Si falla el refresco, se reutiliza la última lista conocida.
  return slugs ?? cache?.slugs ?? null;
}

/**
 * true solo si estamos seguros de que la ruta no existe: `tipo` inválido,
 * `socio` con formato inválido, o socio ausente de una lista que llegó con
 * datos. Cualquier duda => false (no bloquea).
 */
export async function isUnknownPartnerPath(
  socio: string,
  tipo: string,
): Promise<boolean> {
  if (!isPartnerWidgetTipo(tipo)) return true;

  const slug = normalizePartnerSlug(socio);
  if (!isValidPartnerSlug(slug)) return true;

  const slugs = await activePartnerSlugs();
  if (!slugs) return false;
  return !slugs.has(slug);
}

/** Solo para pruebas. */
export function __resetPartnerPathGate(): void {
  cache = null;
  inflight = null;
}
