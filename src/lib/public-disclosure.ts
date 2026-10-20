/**
 * Declaraciones oficiales que no van detrás del muro. TODO(integración): confirmar con abogado.
 *
 * Solo las declaraciones públicas de funcionarios de EE.UU. (PTR de la
 * Cámara y el Senado, y el formulario OGE 278-T) quedan fuera del muro:
 * 5 U.S.C. § 13107 exige que sigan disponibles gratis.
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
