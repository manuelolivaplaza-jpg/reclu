/**
 * STOCK Act: días entre la operación y la declaración.
 * Acepta dos convenciones de payload:
 *  - Políticos PTR:   tx_date + disclosed
 *  - Fondos 13F:      traded_at + filed_at
 * Solo calcula si el payload trae ambas fechas ISO de un par válido.
 * Si faltan o no parsean, null.
 */
export function disclosureLagLabel(payload: Record<string, unknown>): string | null {
  const tx = payload.tx_date ?? payload.traded_at;
  const disclosed = payload.disclosed ?? payload.filed_at;
  if (typeof tx !== "string" || typeof disclosed !== "string") return null;

  const txDay = utcDayNumber(tx);
  const disclosedDay = utcDayNumber(disclosed);
  if (txDay === null || disclosedDay === null) return null;

  const days = disclosedDay - txDay;
  return `Declarado ${days} días después de la operación`;
}

/** YYYY-MM-DD (o ISO que empiece así) como día UTC. Fechas imposibles → null. */
function utcDayNumber(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day);
  const check = new Date(utc);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return Math.round(utc / 86_400_000);
}
