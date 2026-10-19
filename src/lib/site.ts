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

const DEFAULT_LOCAL_URL = "http://localhost:3000";

/** Normaliza: agrega https:// si falta, quita slash final. */
function normalizeUrl(raw: string): string {
  let url = raw.trim();
  if (!url) return DEFAULT_LOCAL_URL;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, "");
}

/** URL base pública del sitio, sin slash final. */
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  return normalizeUrl(raw || DEFAULT_LOCAL_URL);
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
