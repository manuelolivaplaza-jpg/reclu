/**
 * holding-source.ts — origen válido de una posición de la cartera (F80).
 *
 * La columna `user_holdings.source` tiene un CHECK en Postgres:
 *   check (source in ('csv', 'manual', 'cartola'))   -- migración 050
 *
 * Antes el guardado escribía siempre 'csv', aunque la cartera se haya
 * Ingressado a mano. Este módulo centraliza la lista y la validación para que
 * el servidor nunca escriba un valor fuera del CHECK ni confunda el origen de
 * una posición.
 */

/** Lista cerrada de orígenes válidos. Debe coincidir con el CHECK de la 050. */
export const HOLDING_SOURCES = ["manual", "csv", "cartola"] as const;

export type HoldingSource = (typeof HOLDING_SOURCES)[number];

/** Origen por defecto: la cartera la ingresa el usuario, no un archivo. */
export const DEFAULT_HOLDING_SOURCE: HoldingSource = "manual";

/** Origen de la cartera importada desde un archivo CSV. */
export const CSV_SOURCE: HoldingSource = "csv";

/** Origen de la cartera leída desde la cartola de la corredora. */
export const CARTOLA_SOURCE: HoldingSource = "cartola";

/**
 * Valida un origen recibido. Devuelve `null` si el valor no está en la lista
 * (así el servidor puede rechazarlo en vez de escribir algo inválido).
 */
export function normalizeHoldingSource(value: unknown): HoldingSource | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim().toLowerCase();
  return (HOLDING_SOURCES as readonly string[]).includes(candidate)
    ? (candidate as HoldingSource)
    : null;
}
