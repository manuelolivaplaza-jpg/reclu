import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge conditional class names, resolving Tailwind conflicts.
 * Used by every UI primitive in the design system.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a number as Chilean pesos or a compact percentage.
 */
/** Signo menos tipográfico (U+2212), el único que usa el sitio en cifras. */
export const MINUS = "\u2212";

/**
 * Formato único de porcentajes con signo (D29): estilo chileno con coma,
 * "+" en positivos, "−" (U+2212) en negativos, "0,0%" en cero y "—" sin dato.
 */
export function formatSignedPct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "\u2014";
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  const text = Math.abs(rounded).toLocaleString("es-CL", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${rounded > 0 ? "+" : rounded < 0 ? MINUS : ""}${text}%`;
}

/** Alias histórico: mismo formato único. */
export function formatPercent(value: number, digits = 1): string {
  return formatSignedPct(value, digits);
}

const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-10-22" -> "22 oct 2026" (sin depender de la zona horaria). */
export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${MONTHS_ES[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/**
 * Format large numbers compactly (e.g. 1.2M, 350K).
 */
export function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString("es-CL");
}

/**
 * Relative time in Spanish ("hace 3 días", "hace 2 horas").
 */
export function timeAgo(date: Date | string | null | undefined): string {
  const d = date instanceof Date ? date : new Date(String(date ?? ""));
  // Fecha nula o invalida: Intl lanzaria RangeError y romperia la pagina.
  if (!Number.isFinite(d.getTime())) return "";
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.34524, "week"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];
  const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  let value = seconds;
  for (const [divisor, unit] of units) {
    if (Math.abs(value) < divisor) {
      return rtf.format(-Math.round(value), unit);
    }
    value /= divisor;
  }
  return rtf.format(-Math.round(value), "year");
}
