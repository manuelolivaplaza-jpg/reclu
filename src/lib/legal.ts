/**
 * Descargos compartidos de reclu.cl (F16).
 * Las páginas /terminos, /privacidad y /disclaimer no se reescriben: se enlazan.
 */

export const FINTEC_NOTICE =
  "fraccion.si entrega información pública con fines informativos. No ejecuta órdenes ni da asesoría de inversión personalizada (Ley 21.521).";

export const SIMULATION_NOTICE =
  "Simulación histórica con fines informativos. No es recomendación de inversión.";

/** Informes oficiales: públicos en el gobierno. En el sitio, las posiciones reconstruidas son para suscriptores. */
export const US_DISCLOSURE_NOTICE =
  "Los informes oficiales de funcionarios de Estados Unidos siguen públicos y gratis en los sitios de la Cámara, el Senado y la OGE, conforme a 5 U.S.C. § 13107. En fraccion.si, las posiciones reconstruidas de esas declaraciones son para suscriptores.";

export const US_DISCLOSURE_SOURCES = [
  {
    href: "https://disclosures-clerk.house.gov/",
    label: "Cámara de Representantes",
  },
  {
    href: "https://efdsearch.senate.gov/",
    label: "Senado",
  },
] as const;

export const TAX_NOTICE =
  "Las cifras no descuentan impuestos, comisiones ni tipo de cambio. No es asesoría tributaria.";

export const SPONSORED_LABEL = "Patrocinado";

export const LEGAL_PAGE_LINKS = [
  { href: "/disclaimer", label: "Disclaimer" },
  { href: "/terminos", label: "Términos" },
  { href: "/privacidad", label: "Privacidad" },
] as const;

export const LEGAL_NOTICES = {
  fintec: FINTEC_NOTICE,
  simulation: SIMULATION_NOTICE,
  us_disclosure: US_DISCLOSURE_NOTICE,
  tax: TAX_NOTICE,
  sponsored: SPONSORED_LABEL,
} as const;

export type LegalNoticeKind = keyof typeof LEGAL_NOTICES;
