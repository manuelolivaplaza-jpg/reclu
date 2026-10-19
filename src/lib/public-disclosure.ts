/** Declaraciones oficiales que no van detrás del muro. TODO(integración): confirmar con abogado. */
export const PUBLIC_DISCLOSURE_SOURCES = ["oge_278t", "house_ptr", "senate_ptr"] as const;

export function isPublicDisclosureSource(source: string | null | undefined): boolean {
  return !!source && (PUBLIC_DISCLOSURE_SOURCES as readonly string[]).includes(source);
}
