/**
 * Declaraciones oficiales que no van detrás del muro. TODO(integración): confirmar con abogado.
 *
 * `nport_subversive` (F26): NANC y GOP derivan de los PTR de congresistas y
 * la propia web del emisor recuerda el aviso EIGA (5 U.S.C. § 13107), que
 * prohíbe el uso comercial. Se muestran gratis y fuera del muro.
 */
export const PUBLIC_DISCLOSURE_SOURCES = [
  "oge_278t",
  "house_ptr",
  "senate_ptr",
  "nport_subversive",
] as const;

export function isPublicDisclosureSource(source: string | null | undefined): boolean {
  return !!source && (PUBLIC_DISCLOSURE_SOURCES as readonly string[]).includes(source);
}
