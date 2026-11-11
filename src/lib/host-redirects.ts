/**
 * Redirects de host legado → dominio canónico (B7 / T3: fraccion.si).
 *
 * El cambio de dominio se resuelve con un 308 permanente (Next usa 308 en
 * lugar de 301: es permanente y preserva el método) por host, sin tocar DNS
 * ni la base. La lista de hosts que sobran vive en la variable LEGACY_HOSTS
 * (separada por comas) y el destino en NEXT_PUBLIC_SITE_URL. Si falta
 * cualquiera de las dos, no se genera ninguna regla: staging, previews y
 * local quedan exactamente como están.
 *
 * `reclu.cl` se excluye siempre: es otro negocio de Manu y no debe terminar
 * redirigido a fraccion.si por un copy/paste en la lista.
 *
 * TS puro, sin imports: lo llama `next.config.ts` con los valores ya leídos
 * de `process.env` (la función no toca el entorno, así se puede testear) y
 * genera objetos compatibles con el tipo `Redirect` de Next.
 */

/** Regla de redirect compatible con `Redirect` de next.config. */
export interface LegacyHostRedirectRule {
  source: string;
  destination: string;
  permanent: true;
  has: { type: "host"; value: string }[];
}

/** Meta-caracteres de regex: el `value` de `has` se interpreta como patrón. */
const REGEX_META = /[.*+?^${}()|[\]\\]/g;

/** Host válido: etiquetas DNS en minúsculas. */
const HOST_PATTERN = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;

/**
 * Escapa un host para usarlo como patrón de `has` (los puntos, sobre todo:
 * sin escapar, `fraccion.si` también casaría con `fraccionXsi`).
 */
export function escapeHostPattern(host: string): string {
  return host.replace(REGEX_META, "\\$&");
}

/** Origen absoluto a partir de NEXT_PUBLIC_SITE_URL (con o sin protocolo). */
function normalizeOrigin(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Host limpio (sin esquema, ruta, puerto ni punto final) o null si no vale. */
function normalizeHost(raw: string): string | null {
  let value = raw.trim().toLowerCase();
  if (!value) return null;
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  const slash = value.indexOf("/");
  if (slash !== -1) value = value.slice(0, slash);
  // Next compara contra el hostname sin puerto (`host.split(':', 1)[0]`).
  value = value.replace(/:\d+$/, "");
  value = value.replace(/\.$/, "");
  if (!HOST_PATTERN.test(value)) return null;
  return value;
}

/**
 * Reglas 308 para cada host legado. Nunca devuelve nada si falta el destino
 * o la lista; nunca incluye `reclu.cl` (ni subdominios) y nunca crea un bucle
 * contra el propio host canónico.
 */
export function buildLegacyHostRedirects(
  siteUrl: string | null | undefined,
  legacyHosts: string | null | undefined,
): LegacyHostRedirectRule[] {
  const origin = normalizeOrigin(siteUrl);
  if (!origin) return [];

  const siteHost = new URL(origin).hostname.toLowerCase();
  // El destino de esta migración es el dominio nuevo. Si NEXT_PUBLIC_SITE_URL
  // todavía apunta a reclu.cl, un 308 permanente mandaría tráfico al otro
  // negocio y quedaría cacheado: mejor no emitir ninguna regla.
  if (siteHost === "reclu.cl" || siteHost.endsWith(".reclu.cl")) return [];

  const rules: LegacyHostRedirectRule[] = [];
  const seen = new Set<string>();

  for (const raw of (legacyHosts ?? "").split(",")) {
    const host = normalizeHost(raw);
    if (!host || seen.has(host)) continue;
    // Mismo host que el destino: la regla sería un bucle infinito.
    if (host === siteHost) continue;
    // Otro negocio: reclu.cl jamás se redirige a fraccion.si.
    if (host === "reclu.cl" || host.endsWith(".reclu.cl")) continue;

    seen.add(host);
    rules.push({
      source: "/:path*",
      destination: `${origin}/:path*`,
      permanent: true,
      has: [{ type: "host", value: escapeHostPattern(host) }],
    });
  }

  return rules;
}
