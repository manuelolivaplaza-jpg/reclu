/**
 * Marca visible de la plataforma: un solo lugar para el nombre y el dominio.
 *
 * Los nombres internos (tablas, slugs, cookies, claves) siguen como "reclu";
 * solo cambia lo que ve el usuario.
 *
 * NEXT_PUBLIC_BRAND_DOMAIN permite cambiar el dominio sin tocar código.
 * Por defecto: fraccion.si.
 */

export const BRAND_NAME = "Fraccion";
/** Wordmark en minúsculas (logo de texto y tarjetas OG). */
export const BRAND_WORDMARK = "fraccion";
export const DEFAULT_BRAND_DOMAIN = "fraccion.si";

/** Dominio de la marca (sin protocolo ni slash), p. ej. "fraccion.si". */
export function brandDomain(): string {
  const raw = (process.env.NEXT_PUBLIC_BRAND_DOMAIN ?? "").trim();
  const clean = raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  return clean || DEFAULT_BRAND_DOMAIN;
}

/** URL pública de producción derivada del dominio de marca. */
export function brandUrl(): string {
  return `https://${brandDomain()}`;
}
