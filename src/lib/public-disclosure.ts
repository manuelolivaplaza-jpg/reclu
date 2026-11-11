/**
 * Identifica las fuentes de declaraciones oficiales de EE.UU. (PTR y OGE).
 * Este helper sigue usándose en reglas de series. El muro de posiciones
 * (D55) es aparte: en fraccion.si las posiciones reconstruidas son para
 * suscriptores. Los informes oficiales siguen públicos y gratis en los
 * sitios del gobierno (5 U.S.C. § 13107).
 *
 * `nport_subversive` (NANC/GOP) NO entra: es un ETF, un producto comercial,
 * y sus holdings salen del N-PORT del emisor, no de un PTR. Va premium.
 */
export const PUBLIC_DISCLOSURE_SOURCES = [
  "oge_278t",
  "house_ptr",
  "senate_ptr",
] as const;

export function isPublicDisclosureSource(source: string | null | undefined): boolean {
  return !!source && (PUBLIC_DISCLOSURE_SOURCES as readonly string[]).includes(source);
}
