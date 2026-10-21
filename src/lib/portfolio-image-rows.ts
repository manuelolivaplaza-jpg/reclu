/**
 * portfolio-image-rows.ts — tipos y conversiones compartidas entre el
 * servidor y el navegador para la importación de cartera desde una captura
 * (F79).
 *
 * Este módulo NO importa zod ni nada del servidor: es liviano y lo pueden
 * importar tanto la ruta de API como los editores de cartera ("use client")
 * sin meter el validador en el bundle del navegador.
 *
 * El parseo de la respuesta del modelo vive en `portfolio-image-import.ts`
 * (servidor + tests); aquí solo están las formas de datos y las
 * conversiones a las filas que entiende cada editor.
 */

/** Campo detectado que describe la posición. */
export type DetectedMode = "quantity" | "amount" | "weight" | "mixed" | "symbol";

/** Posición detectada en la imagen, ya validada por el servidor. */
export interface DetectedPosition {
  symbol: string;
  quantity: number | null;
  amount: number | null;
  weight: number | null;
  currency: "USD" | "CLP" | null;
  /** El monto venia en una moneda distinta de USD (CLP, EUR, ...): hay que corregirlo. */
  amountNeedsUsd?: boolean;
}

/** Símbolo estricto: mayúsculas, dígitos, punto y guion (SQM-B, BRK.B). */
export const DETECTED_SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9.\-]{0,19}$/;

/**
 * Convierte un número del modelo a número usable.
 * Acepta "1.234,56" (chileno), "1,234.56" (anglosajón) y "12 345".
 */
export function parseDetectedNumber(raw: unknown): number | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw !== "string") return null;
  let text = raw.trim();
  if (!text) return null;
  text = text.replace(/\s/g, "").replace(/[^\d.,+-]/g, "");
  if (!text) return null;

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) text = text.replace(/\./g, "").replace(",", ".");
    else text = text.replace(/,/g, "");
  } else if (lastComma !== -1) {
    const parts = text.split(",");
    text =
      parts.length === 2 && parts[1].length !== 3
        ? `${parts[0]}.${parts[1]}`
        : text.replace(/,/g, "");
  } else if (lastDot !== -1) {
    const parts = text.split(".");
    text =
      parts.length > 2 || (parts.length === 2 && parts[1].length === 3)
        ? text.replace(/\./g, "")
        : text;
  }

  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/**
 * Convierte las posiciones detectadas a filas de peso relativo (%) para el
 * editor de /compare, que solo guarda pesos.
 *
 * Base: el peso detectado si viene; si no, el monto; si no, la cantidad. Como
 * `user_holdings.weight` es un porcentaje relativo (no el peso real del
 * patrimonio, que exige precios), se normaliza a 100 igual que el CSV.
 */
export function toWeightRows(
  positions: DetectedPosition[],
): Array<{ symbol: string; weight: number }> {
  const bases = positions.map((position) => {
    if (position.weight !== null) return position.weight;
    if (position.amount !== null) return position.amount;
    if (position.quantity !== null) return position.quantity;
    return 0;
  });
  const total = bases.reduce((sum, base) => sum + base, 0);
  if (total <= 0) {
    const equal = positions.length > 0 ? 100 / positions.length : 0;
    return positions.map((position) => ({
      symbol: position.symbol,
      weight: Math.round(equal * 100) / 100,
    }));
  }
  return positions.map((position, index) => ({
    symbol: position.symbol,
    weight: Math.round((bases[index] / total) * 10000) / 100,
  }));
}

/**
 * Convierte las posiciones detectadas a filas editables de Mi portafolio.
 *
 * `avgCost` solo se completa si la captura trae monto y cantidad (el costo
 * promedio es monto ÷ cantidad). Si no, queda null: no se inventa.
 */
export function toEditableRows(
  positions: DetectedPosition[],
): Array<{
  symbol: string;
  quantity: number | null;
  avgCost: number | null;
  currency: "USD" | "CLP";
}> {
  return positions.map((position) => ({
    symbol: position.symbol,
    quantity: position.quantity,
    avgCost:
      position.amount !== null && position.quantity !== null && position.quantity > 0
        ? Math.round((position.amount / position.quantity) * 100) / 100
        : null,
    currency: position.currency ?? "USD",
  }));
}

export const AMOUNT_USD_MESSAGE =
  "Los montos se ingresan solo en USD. Convierte a dólares o borra el monto de";

/**
 * Simbolos con un monto que no esta en USD (decision de Manu, 21-oct). La UI
 * avisa y no deja usar las posiciones hasta que se corrijan.
 */
export function amountCurrencyProblems(positions: readonly DetectedPosition[]): string[] {
  return positions
    .filter(
      (position) =>
        position.amount !== null &&
        (position.currency === "CLP" || (position.amountNeedsUsd === true && position.currency !== "USD")),
    )
    .map((position) => position.symbol);
}
