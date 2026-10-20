/**
 * Catálogo de la API pública v1 (F54).
 *
 * Solo entran fuentes públicas que podemos redistribuir. La lista blanca es
 * cerrada: cualquier slug fuera de `API_DATASETS` responde 404. En particular
 * **no** se exponen las declaraciones patrimoniales de funcionarios de EE.UU.
 * (`house_ptr`, `senate_ptr`, `oge_278t`) ni `nport_subversive`: 5 U.S.C.
 * § 13107 exige que esos datos sigan disponibles gratis y fuera de un muro,
 * y la API es un producto con clave/plan. Tampoco se expone `house_ptr` en
 * ninguna forma agregada.
 *
 * InfoProbidad es la única fuente con licencia explícita de reutilización
 * (CC BY 4.0). Se entrega solo el agregado por empresa: nunca nombres,
 * cargos, direcciones ni datos de familiares (Leyes 19.628 y 21.719).
 *
 * Términos pendientes de revisión legal: CMF (dividendos y hechos esenciales)
 * y carteras de corredoras chilenas. Quedan habilitadas como dato informativo
 * con atribución visible, pero antes de un uso comercial hay que confirmar
 * las condiciones de cada fuente. Ver `NOTAS-F54.md`.
 */

export interface ApiDatasetDefinition {
  /** Slug en `/api/v1/<slug>`. */
  slug: string;
  /** Nombre corto para la documentación. */
  label: string;
  /** Qué entrega y de dónde sale. */
  description: string;
  /** Licencia o condición de uso, tal como se muestra en cada respuesta. */
  license: string;
  /** Enlace a la licencia o a los términos de la fuente. */
  licenseUrl: string;
  /** Atribución obligatoria en cada respuesta. */
  attribution: string;
  /** Página oficial de la fuente. */
  sourceUrl: string;
  /** Filtros admitidos además de `page` y `per_page`. */
  filters: readonly string[];
}

export const API_BASE_PATH = "/api/v1";

export const API_DATASETS = {
  afp: {
    slug: "afp",
    label: "AFP Modelo",
    description:
      "Acciones chilenas de AFP Modelo según el Cuadro 14 de la Superintendencia de Pensiones. Peso dentro de la cartera de acciones chilenas, no del fondo completo.",
    license: "Uso informativo; términos de la Superintendencia de Pensiones",
    licenseUrl: "https://www.spensiones.cl/",
    attribution:
      "Fuente: Superintendencia de Pensiones, Cuadro 14 (cartera de AFP Modelo).",
    sourceUrl:
      "https://www.spensiones.cl/apps/carteras/genera_desagregada_xsl.php?fecpro=202605&idu=50&listado=14",
    filters: ["symbol", "page", "per_page"],
  },
  corredoras: {
    slug: "corredoras",
    label: "Corredoras chilenas",
    description:
      "Carteras recomendadas y consenso de corredoras chilenas (BICE, MBI y consenso). Solo nemotécnico, peso y fecha de corte.",
    license: "Uso informativo; términos de las corredoras pendientes de revisión",
    licenseUrl: "https://www.cmfchile.cl/",
    attribution:
      "Fuente: BICE Inversiones, MBI Corredores de Bolsa y consenso de corredoras de reclu.cl.",
    sourceUrl: "https://mercadosenlinea.biceinversiones.cl/reportes/cartera-inversiones-bice.pdf",
    filters: ["symbol", "portfolio", "page", "per_page"],
  },
  infoprobidad: {
    slug: "infoprobidad",
    label: "InfoProbidad (agregado)",
    description:
      "Empresas en las que autoridades chilenas declaran acciones, agregado por RUT. Solo conteo de autoridades, valor declarado y última declaración; sin datos personales.",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/deed.es",
    attribution:
      "Fuente: InfoProbidad, Consejo para la Transparencia (CC BY 4.0).",
    sourceUrl: "https://datos.cplt.cl/",
    filters: ["symbol", "page", "per_page"],
  },
  dividendos: {
    slug: "dividendos",
    label: "Dividendos chilenos",
    description:
      "Calendario de dividendos de emisores chilenos publicado por la CMF: nemotécnico, número, serie, fechas, moneda, tipo y monto por acción.",
    license: "Uso informativo; términos de la CMF pendientes de revisión",
    licenseUrl: "https://www.cmfchile.cl/portal/principal/613/w3-propertyvalue-18583.html",
    attribution: "Fuente: CMF (Comisión para el Mercado Financiero).",
    sourceUrl:
      "https://www.cmfchile.cl/institucional/estadisticas/acc_dividendos1grid.php",
    filters: ["nemo", "desde", "hasta", "page", "per_page"],
  },
  hechos: {
    slug: "hechos",
    label: "Hechos esenciales",
    description:
      "Hechos esenciales de emisores chilenos publicados por la CMF: OPA, aumento de capital, dividendos, compra/venta de acciones, cambio de control, colocaciones, fusiones y juntas.",
    license: "Uso informativo; términos de la CMF pendientes de revisión",
    licenseUrl: "https://www.cmfchile.cl/portal/principal/613/w3-propertyvalue-18583.html",
    attribution: "Fuente: CMF (Comisión para el Mercado Financiero).",
    sourceUrl: "https://www.cmfchile.cl/institucional/hechos/hechos_portada.php",
    filters: ["emisor", "categoria", "desde", "hasta", "page", "per_page"],
  },
  insiders: {
    slug: "insiders",
    label: "Compras y ventas de ejecutivos (SEC)",
    description:
      "Compras y ventas declaradas en el Formulario 4 de la SEC por ejecutivos y directores de emisores de EE.UU. Solo datos de mercado del formulario, sin direcciones.",
    license: "Dominio público (SEC EDGAR)",
    licenseUrl: "https://www.sec.gov/os/webmaster-faq#copyright",
    attribution: "Fuente: SEC EDGAR, Formulario 4.",
    sourceUrl: "https://www.sec.gov/edgar/search/",
    filters: ["symbol", "code", "desde", "hasta", "page", "per_page"],
  },
} as const satisfies Record<string, ApiDatasetDefinition>;

export type ApiDatasetSlug = keyof typeof API_DATASETS;

/** Slugs que existen en la base pero NO se publican por la API. */
export const EXCLUDED_API_DATASETS = {
  house_ptr: {
    reason:
      "Declaraciones patrimoniales de funcionarios de EE.UU. Deben seguir gratis y fuera de un muro de pago.",
    law: "5 U.S.C. § 13107",
  },
  senate_ptr: {
    reason:
      "Declaraciones patrimoniales de funcionarios de EE.UU. Deben seguir gratis y fuera de un muro de pago.",
    law: "5 U.S.C. § 13107",
  },
  oge_278t: {
    reason:
      "Declaraciones patrimoniales de funcionarios de EE.UU. Deben seguir gratis y fuera de un muro de pago.",
    law: "5 U.S.C. § 13107",
  },
  nport_subversive: {
    reason:
      "Declaraciones de funcionarios de EE.UU. con posible dato personal. No se redistribuye por API.",
    law: "5 U.S.C. § 13107",
  },
} as const satisfies Record<string, { reason: string; law: string }>;

export type ExcludedApiDatasetSlug = keyof typeof EXCLUDED_API_DATASETS;

export const API_DATASET_SLUGS = Object.keys(API_DATASETS) as ApiDatasetSlug[];
export const EXCLUDED_API_DATASET_SLUGS = Object.keys(
  EXCLUDED_API_DATASETS,
) as ExcludedApiDatasetSlug[];

function hasOwn<T extends object>(record: T, key: PropertyKey): key is keyof T {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/** Devuelve la definición del dataset o `null` si no está en la lista blanca. */
export function getApiDataset(
  slug: string | null | undefined,
): ApiDatasetDefinition | null {
  if (!slug || !hasOwn(API_DATASETS, slug)) return null;
  return API_DATASETS[slug];
}

/** True para los datasets oficiales de EE.UU. que la API no redistribuye. */
export function isExcludedDataset(slug: string | null | undefined): boolean {
  return !!slug && hasOwn(EXCLUDED_API_DATASETS, slug);
}

// ---- Paginación ----

export const API_DEFAULT_PER_PAGE = 50;
export const API_MAX_PER_PAGE = 100;

export interface ApiPagination {
  page: number;
  perPage: number;
  /** Primer índice inclusive (0-based) para `range(from, to)`. */
  from: number;
  /** Último índice inclusive. */
  to: number;
}

function positiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function nonNegativeInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Lee `page`/`per_page` (o los alias `offset`/`limit`) y los acota a límites
 * sanos. Nunca lanza: una entrada inválida cae a los valores por defecto.
 */
export function parsePagination(params: URLSearchParams): ApiPagination {
  const requestedPerPage =
    positiveInt(params.get("per_page")) ?? positiveInt(params.get("limit"));
  const perPage = Math.min(
    requestedPerPage ?? API_DEFAULT_PER_PAGE,
    API_MAX_PER_PAGE,
  );

  const offset = nonNegativeInt(params.get("offset"));
  if (offset !== null) {
    return {
      page: Math.floor(offset / perPage) + 1,
      perPage,
      from: offset,
      to: offset + perPage - 1,
    };
  }

  const page = positiveInt(params.get("page")) ?? 1;
  const from = (page - 1) * perPage;
  return { page, perPage, from, to: from + perPage - 1 };
}

export interface ApiPaginationMeta {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
  has_more: boolean;
}

export function paginationMeta(
  pagination: Pick<ApiPagination, "page" | "perPage" | "from">,
  total: number,
): ApiPaginationMeta {
  const safeTotal = Math.max(0, Math.floor(total));
  const totalPages =
    safeTotal === 0 ? 0 : Math.ceil(safeTotal / pagination.perPage);
  return {
    page: pagination.page,
    per_page: pagination.perPage,
    total: safeTotal,
    total_pages: totalPages,
    has_more: pagination.from + pagination.perPage < safeTotal,
  };
}

export interface ApiListResponse<T> {
  dataset: string;
  license: string;
  license_url: string;
  attribution: string;
  source_url: string;
  generated_at: string;
  pagination: ApiPaginationMeta;
  data: T[];
}
