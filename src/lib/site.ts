/**
 * URL pública del sitio — un solo lugar para construirla.
 *
 * El dominio final de la app aún no está decidido (reclu.cl es el estudio
 * web; la app vivirá en otra dirección, p. ej. app.reclu.cl). Todo lo que
 * necesite la URL pública (sitemap, canonical, OG, robots, emails) debe
 * usar `siteUrl()` y NO una cadena fija.
 *
 * En local, un env var vacío cae a `http://localhost:3000`.
 */

import { brandUrl } from "@/lib/brand";

const DEFAULT_LOCAL_URL = "http://localhost:3000";

/**
 * Fraccion: en producción sin NEXT_PUBLIC_SITE_URL se usa el dominio de
 * marca (NEXT_PUBLIC_BRAND_DOMAIN, por defecto fraccion.si).
 */
function defaultUrl(): string {
  const isProd = process.env.VERCEL_ENV === "production" || process.env.PAYMENT_MODE === "production";
  return isProd ? brandUrl() : DEFAULT_LOCAL_URL;
}

/** Normaliza: agrega https:// si falta, quita slash final. */
function normalizeUrl(raw: string): string {
  let url = raw.trim();
  if (!url) return DEFAULT_LOCAL_URL;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, "");
}

/** URL base pública del sitio, sin slash final. */
export function siteUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  if (raw) return normalizeUrl(raw);
  // Produccion sin NEXT_PUBLIC_SITE_URL: dominio de marca (fraccion.si).
  if (process.env.VERCEL_ENV === "production" || process.env.PAYMENT_MODE === "production") {
    return normalizeUrl(brandUrl());
  }
  // Preview en Vercel: URL del deploy. En local, localhost.
  const vercel = (process.env.VERCEL_URL ?? "").trim();
  return normalizeUrl(vercel || defaultUrl());
}

/** URL absoluta para una ruta interna (p. ej. `absoluteUrl("/explore")`). */
export function absoluteUrl(path = "/"): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${siteUrl()}${clean}`;
}

/** Host del sitio (p. ej. "app.reclu.cl") — útil para emails y OG. */
export function siteHost(): string {
  try {
    return new URL(siteUrl()).host;
  } catch {
    return "localhost:3000";
  }
}
