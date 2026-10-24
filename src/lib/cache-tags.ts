/**
 * Tags de la caché de lecturas públicas (D36).
 * `PUBLIC_DATA_TAG` cubre todo lo público; se invalida al terminar el
 * pipeline diario (POST /api/revalidate o al final de /api/run-pipeline).
 */
export const PUBLIC_DATA_TAG = "public-data";
export const PORTFOLIOS_TAG = "portfolios";
export const PERFORMANCE_TAG = "performance";
export const ALL_PUBLIC_TAGS = [PUBLIC_DATA_TAG, PORTFOLIOS_TAG, PERFORMANCE_TAG] as const;
