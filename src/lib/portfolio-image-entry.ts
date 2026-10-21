import { emptyEntryValues, isChileanPosition, type HoldingEntryMode } from "@/lib/holdings-entry";
import type { EntryPanelRow } from "@/components/my-portfolio/holdings-entry-panel";
import { toWeightRows, type DetectedPosition } from "@/lib/portfolio-image-rows";

/**
 * F79 + F78: traduce lo detectado en la captura a filas del panel de ingreso.
 * - Todas con cantidad  -> modo acciones.
 * - Todas con monto     -> modo monto.
 * - Si no, porcentaje con el mismo criterio de toWeightRows.
 * El usuario siempre revisa y edita antes de guardar.
 */
export function detectedToEntryRows(positions: DetectedPosition[]): {
  rows: EntryPanelRow[];
  mode: HoldingEntryMode;
} {
  const currencyOf = (p: DetectedPosition) => (p.currency === "CLP" ? "CLP" : "USD") as "USD" | "CLP";
  const base = (p: DetectedPosition) => ({
    symbol: p.symbol,
    name: "",
    avgCost: null,
    currency: currencyOf(p),
    market: p.currency === "CLP" ? ("CL" as const) : null,
  });

  if (positions.length > 0 && positions.every((p) => p.quantity !== null && p.quantity > 0)) {
    return {
      mode: "shares",
      rows: positions.map((p) => ({ ...base(p), values: { ...emptyEntryValues(), shares: p.quantity } })),
    };
  }
  // Montos solo en USD y nunca para acciones chilenas (decision de Manu).
  const usdAmount = (p: DetectedPosition) =>
    p.amount !== null &&
    p.amount > 0 &&
    p.currency !== "CLP" &&
    p.amountNeedsUsd !== true &&
    !isChileanPosition({ symbol: p.symbol, currency: p.currency });
  if (positions.length > 0 && positions.every(usdAmount)) {
    return {
      mode: "amount",
      rows: positions.map((p) => ({ ...base(p), values: { ...emptyEntryValues(), amount: p.amount } })),
    };
  }
  // Un monto que no es USD no sirve de base para el peso: se ignora.
  positions = positions.map((p) => (usdAmount(p) || p.amount === null ? p : { ...p, amount: null }));
  const bySymbol = new Map(positions.map((p) => [p.symbol, p]));
  return {
    mode: "percentage",
    rows: toWeightRows(positions).map((row) => {
      const p = bySymbol.get(row.symbol);
      return {
        ...(p ? base(p) : { symbol: row.symbol, name: "", avgCost: null, currency: "USD" as const, market: null }),
        values: { ...emptyEntryValues(), percentage: row.weight },
      };
    }),
  };
}
