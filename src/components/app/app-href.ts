/**
 * d47: rutas internas de la app. Las páginas públicas (/explore,
 * /portfolio/[slug]) quedan para SEO; dentro del dashboard se usan
 * /app/explorar y /app/portafolio/[slug] para no salir del shell.
 */
const APP_PREFIXES = ["/app/", "/dashboard", "/alerts", "/compare", "/mi-portafolio", "/settings", "/upgrade"];

/** true si la ruta actual está dentro del shell del dashboard. */
export function isAppPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return APP_PREFIXES.some((p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p.endsWith("/") ? p : `${p}/`) || pathname === p);
}

/** Traduce un href público a su equivalente dentro de la app. */
export function toAppHref(href: string): string {
  if (href === "/explore" || href.startsWith("/explore?") || href.startsWith("/explore#")) {
    return `/app/explorar${href.slice("/explore".length)}`;
  }
  if (href.startsWith("/portfolio/")) return `/app/portafolio/${href.slice("/portfolio/".length)}`;
  return href;
}

/** href según contexto: dentro de la app usa las rutas internas. */
export function contextualHref(href: string, pathname: string | null | undefined): string {
  return isAppPath(pathname) ? toAppHref(href) : href;
}

/** Ítem activo también en subrutas (/settings/api activa /settings). */
export function isActivePath(pathname: string | null | undefined, href: string, also: readonly string[] = []): boolean {
  if (!pathname) return false;
  return [href, ...also].some((base) => pathname === base || pathname.startsWith(`${base}/`));
}