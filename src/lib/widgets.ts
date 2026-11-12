/**
 * Widgets incrustables para medios (F52) — catálogo y helpers compartidos.
 *
 * El catálogo vive aquí (no en el page) para que /medios y los tests puedan
 * importarlo sin depender de una ruta de Next. Las páginas solo exportan lo
 * que Next permite (default, metadata, instant).
 *
 * Los widgets con datos de funcionarios de EE.UU. son gratis para cualquier
 * medio. Los informes oficiales siguen públicos en los sitios del gobierno
 * (5 U.S.C. § 13107); en fraccion.si, las posiciones reconstruidas de esas
 * declaraciones son para suscriptores. Ningún
 * widget usa datos personales de InfoProbidad ni entrega recomendaciones
 * personalizadas.
 */

export const WIDGET_TIPOS = [
  "consenso-corredoras",
  "afp",
  "insiders",
  "ranking",
] as const;

export type WidgetTipo = (typeof WIDGET_TIPOS)[number];

export interface WidgetMeta {
  label: string;
  title: string;
  description: string;
  /** Altura sugerida del iframe (px). */
  height: number;
}

export const WIDGET_META: Record<WidgetTipo, WidgetMeta> = {
  "consenso-corredoras": {
    label: "Consenso de corredoras",
    title: "Consenso de corredoras",
    description:
      "Peso promedio de cada acción entre las corredoras chilenas con cartera completa (BICE y MBI).",
    height: 380,
  },
  afp: {
    label: "AFP",
    title: "AFP: acciones chilenas",
    description:
      "Acciones nacionales declaradas por las AFP chilenas en los reportes de la Superintendencia de Pensiones.",
    height: 400,
  },
  insiders: {
    label: "Insiders",
    title: "Últimas compras de insiders",
    description:
      "Compras en mercado abierto (Form 4) de ejecutivos y directores de empresas que cotizan en EE.UU.",
    height: 400,
  },
  ranking: {
    label: "Ranking",
    title: "Ranking honesto",
    description:
      "Cada portafolio y estudio contra el benchmark de su país, ordenado por exceso de retorno. Incluye los que pierden.",
    height: 400,
  },
};

export function isWidgetTipo(value: string): value is WidgetTipo {
  return (WIDGET_TIPOS as readonly string[]).includes(value);
}

/** Código de iframe listo para pegar. La atribución va dentro del widget. */
export function widgetIframeCode(tipo: WidgetTipo, baseUrl: string): string {
  const src = `${baseUrl.replace(/\/+$/, "")}/embed/widget/${tipo}`;
  return `<iframe src="${src}" width="100%" height="${WIDGET_META[tipo].height}" style="border:0" title="Datos de fraccion.si" loading="lazy"></iframe>`;
}

/**
 * Semilla pública de la migración 024 (corte 2026-10-05). Solo se usa cuando
 * Supabase no está configurado o el portafolio agregado todavía no existe.
 * Son datos públicos agregados de BICE y MBI, no una recomendación.
 */
export const CONSENSO_SEMILLA = [
  { symbol: "LTM", name: "LATAM Airlines", weight: 20 },
  { symbol: "SQM-B", name: "SQM-B", weight: 17.5 },
  { symbol: "FALABELLA", name: "Falabella", weight: 10 },
  { symbol: "COPEC", name: "Copec", weight: 10 },
  { symbol: "ITAUCL", name: "Itau Corpbanca", weight: 10 },
] as const;

export const CONSENSO_AS_OF = "2026-10-05";

/** Formatea ISO (YYYY-MM-DD) como DD-MM-AAAA. */
export function formatShortDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  return `${match[3]}-${match[2]}-${match[1]}`;
}
