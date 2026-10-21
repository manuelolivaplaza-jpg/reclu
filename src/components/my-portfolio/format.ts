/**
 * Formatos deterministas de Mi portafolio. No usan Intl para que el HTML del
 * servidor y el del cliente coincidan (misma coma decimal, mismos separadores).
 */

/** 1500.5 + USD → "US$1.500,50"; CLP sin decimales → "$1.500". */
export function formatMoney(value: number | null, currency: string): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const decimals = currency === "CLP" ? 0 : 2;
  const fixed = Math.abs(value).toFixed(decimals);
  const [integer, fraction] = fixed.split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const prefix = currency === "USD" ? "US$" : "$";
  const sign = value < 0 ? "-" : "";
  return `${sign}${prefix}${grouped}${fraction ? `,${fraction}` : ""}`;
}

/** Porcentaje con un decimal: 12.34 → "12,3%"; con signo → "+12,3%". */
export function formatPercent(value: number | null, signed = false): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const rounded = Math.abs(value).toFixed(1).replace(".", ",");
  const sign = value < 0 ? "-" : signed && value > 0 ? "+" : "";
  return `${sign}${rounded}%`;
}

/** Cantidad sin notación científica ni ceros de más: 10.5 → "10,5". */
export function formatQuantity(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return String(rounded).replace(".", ",");
}

/** Fecha ISO (YYYY-MM-DD) → DD-MM-YYYY, sin depender de la zona horaria. */
export function formatPriceDate(value: string | null): string {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
}
