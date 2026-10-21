/**
 * holdings-entry.ts — carga de cartera por acciones, monto o porcentaje (F78).
 *
 * Función pura, sin red ni Supabase. Convierte lo que el usuario escribe en
 * cada modo a la forma que guarda `user_holdings`:
 *
 * - `percentage`: los pesos se normalizan a 100 (comportamiento histórico).
 * - `shares`: se conserva la cantidad; el peso = cantidad × precio / total.
 * - `amount`: cantidad = monto / precio (con decimales); peso = monto / total.
 *
 * Reglas deliberadas:
 * - La moneda de la posición es la del precio. Si la cartera mezcla USD y CLP
 *   se exige un tipo de cambio (CLP por dólar), el mismo criterio de
 *   `replicate.ts`; sin él no se guarda nada para no sumar monedas distintas.
 * - Sin precio en modo acciones/monto se devuelve un error por símbolo y la
 *   cartera completa queda sin resolver: nunca se guarda a medias.
 * - Los pesos se redondean a 2 decimales con reparto de residuo, de modo que
 *   siempre suman 100.
 */

import { normalizeCurrency, type PositionCurrency } from "@/lib/portfolio-valuation";

export type HoldingEntryMode = "percentage" | "shares" | "amount";

export const HOLDING_ENTRY_MODES: readonly HoldingEntryMode[] = [
  "shares",
  "amount",
  "percentage",
];

export const HOLDING_ENTRY_MODE_LABELS: Record<HoldingEntryMode, string> = {
  shares: "Cantidad de acciones",
  amount: "Monto en dinero",
  percentage: "Porcentaje",
};

export interface HoldingEntryRow {
  symbol: string;
  name?: string;
  /** Moneda declarada por el usuario; el precio manda si trae la suya. */
  currency?: string | null;
  market?: "US" | "CL" | null;
  broker?: string | null;
  /** Modo `percentage`: peso ingresado (0–100). */
  percentage?: number | null;
  /** Modo `shares`: cantidad de acciones. */
  shares?: number | null;
  /** Modo `amount`: monto en la moneda del precio. */
  amount?: number | null;
  /** Costo promedio opcional, en la moneda de la posición. */
  avg_cost?: number | null;
  /** Último cierre de `prices`, en `priceCurrency`. */
  price?: number | null;
  priceCurrency?: string | null;
}

export interface ResolvedHoldingEntry {
  symbol: string;
  name: string;
  weight: number;
  quantity?: number;
  avg_cost?: number;
  currency: PositionCurrency;
  market?: "US" | "CL";
  broker?: string;
}

export interface HoldingEntryError {
  /** Símbolo afectado, o "*" si el problema es de toda la cartera. */
  symbol: string;
  message: string;
}

export interface HoldingsEntryResult {
  mode: HoldingEntryMode;
  holdings: ResolvedHoldingEntry[];
  errors: HoldingEntryError[];
  /** Moneda usada para calcular los pesos; null en modo porcentaje. */
  baseCurrency: PositionCurrency | null;
  /** true si hubo que convertir CLP/USD con el tipo de cambio. */
  usesFx: boolean;
}

export interface HoldingsEntryOptions {
  /**
   * Tipo de cambio en pesos por dólar. Solo se usa si la cartera mezcla
   * monedas. Sin él, una mezcla USD/CLP se rechaza.
   */
  fx?: number | null;
}

function isPositive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function clean(value: number, decimals = 6): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Reparte valores proporcionales en pesos de 2 decimales que suman 100.
 * Usa el método del mayor residuo con desempate por orden de entrada, así el
 * resultado es estable entre renders y servidor/cliente.
 */
export function roundWeightsTo100(values: readonly number[]): number[] {
  const total = values.reduce(
    (sum, value) => sum + (Number.isFinite(value) && value > 0 ? value : 0),
    0,
  );
  if (total <= 0) return values.map(() => 0);

  const rawCents = values.map((value) => {
    const safe = Number.isFinite(value) && value > 0 ? value : 0;
    return (safe / total) * 10_000;
  });
  const cents = rawCents.map((value) => Math.floor(value + 1e-9));
  let remainder = 10_000 - cents.reduce((sum, value) => sum + value, 0);

  const byRemainder = rawCents
    .map((value, index) => ({
      index,
      fraction: value - Math.floor(value + 1e-9),
    }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (let index = 0; index < byRemainder.length && remainder > 0; index += 1) {
    cents[byRemainder[index].index] += 1;
    remainder -= 1;
  }

  return cents.map((value) => value / 100);
}

function emptyResult(
  mode: HoldingEntryMode,
  errors: HoldingEntryError[],
): HoldingsEntryResult {
  return {
    mode,
    holdings: [],
    errors,
    baseCurrency: null,
    usesFx: false,
  };
}

/**
 * Resuelve la cartera completa en un solo modo. Si hay cualquier error de
 * validación (monto inválido, precio faltante, mezcla de monedas sin tipo de
 * cambio) devuelve `holdings: []` para que el guardado no sea parcial.
 */
export function resolveHoldingsEntry(
  mode: HoldingEntryMode,
  rows: readonly HoldingEntryRow[],
  options: HoldingsEntryOptions = {},
): HoldingsEntryResult {
  if (rows.length === 0) {
    return emptyResult(mode, [
      { symbol: "*", message: "Agrega al menos una posición a tu cartera." },
    ]);
  }

  const errors: HoldingEntryError[] = [];
  const symbols = new Set<string>();

  for (const row of rows) {
    const symbol = String(row.symbol ?? "").trim().toUpperCase();
    if (!symbol) {
      errors.push({ symbol: "*", message: "Hay una posición sin ticker." });
      continue;
    }
    if (symbols.has(symbol)) {
      errors.push({
        symbol,
        message: `${symbol} está repetido. Une las posiciones en una sola fila.`,
      });
    }
    symbols.add(symbol);
  }

  if (mode === "percentage") {
    const values = rows.map((row) => (isPositive(row.percentage) ? row.percentage : 0));
    rows.forEach((row, index) => {
      if (values[index] === 0) {
        errors.push({
          symbol: String(row.symbol ?? "").trim().toUpperCase() || "*",
          message: "Ingresa un porcentaje mayor que 0.",
        });
      }
    });
    if (errors.length > 0) return emptyResult(mode, errors);

    const weights = roundWeightsTo100(values);
    const holdings: ResolvedHoldingEntry[] = rows.map((row, index) => {
      const quantity =
        typeof row.shares === "number" && Number.isFinite(row.shares) && row.shares >= 0
          ? row.shares
          : undefined;
      const avgCost =
        typeof row.avg_cost === "number" &&
        Number.isFinite(row.avg_cost) &&
        row.avg_cost >= 0
          ? row.avg_cost
          : undefined;
      return {
        symbol: String(row.symbol).trim().toUpperCase(),
        name: row.name?.trim() ?? "",
        weight: weights[index] ?? 0,
        ...(quantity !== undefined ? { quantity } : {}),
        ...(avgCost !== undefined ? { avg_cost: avgCost } : {}),
        currency: normalizeCurrency(row.currency),
        ...(row.market ? { market: row.market } : {}),
        ...(row.broker?.trim() ? { broker: row.broker.trim() } : {}),
      };
    });
    return {
      mode,
      holdings,
      errors: [],
      baseCurrency: null,
      usesFx: false,
    };
  }

  const prepared = rows.map((row) => {
    const symbol = String(row.symbol ?? "").trim().toUpperCase();
    const value = mode === "shares" ? row.shares : row.amount;
    const price = isPositive(row.price) ? row.price : null;
    const currency = normalizeCurrency(row.priceCurrency ?? row.currency);

    if (!isPositive(value)) {
      errors.push({
        symbol,
        message:
          mode === "shares"
            ? "Ingresa una cantidad de acciones mayor que 0."
            : "Ingresa un monto mayor que 0.",
      });
    }
    if (price === null) {
      errors.push({
        symbol,
        message:
          "No hay precio disponible para este símbolo. No se guardó la cartera.",
      });
    }

    // En modo acciones el valor de mercado es cantidad × precio. En modo
    // monto el valor de mercado ES el monto ingresado: el precio solo sirve
    // para derivar la cantidad (monto / precio).
    const marketValue =
      price !== null && isPositive(value)
        ? mode === "shares"
          ? value * price
          : value
        : null;
    return {
      row,
      symbol,
      input: value as number,
      price,
      currency,
      marketValue,
    };
  });

  if (errors.length > 0) return emptyResult(mode, errors);

  const currencies = new Set(prepared.map((item) => item.currency));
  const mixed = currencies.size > 1;
  const fx = options.fx;
  if (mixed && !isPositive(fx)) {
    return emptyResult(mode, [
      {
        symbol: "*",
        message:
          "Tu cartera mezcla USD y CLP. Ingresa un tipo de cambio (CLP por USD) para calcular los pesos sin mezclar monedas.",
      },
    ]);
  }

  const baseCurrency: PositionCurrency = mixed ? "USD" : [...currencies][0] ?? "USD";

  const values = prepared.map((item) => {
    const value = item.marketValue ?? 0;
    if (!mixed || item.currency === baseCurrency) return value;
    return item.currency === "CLP" ? value / (fx as number) : value * (fx as number);
  });

  const weights = roundWeightsTo100(values);
  const holdings: ResolvedHoldingEntry[] = prepared.map((item, index) => {
    const quantity =
      mode === "shares"
        ? clean(item.input)
        : clean(item.input / (item.price as number), 6);
    const avgCost =
      typeof item.row.avg_cost === "number" &&
      Number.isFinite(item.row.avg_cost) &&
      item.row.avg_cost >= 0
        ? item.row.avg_cost
        : undefined;

    return {
      symbol: item.symbol,
      name: item.row.name?.trim() ?? "",
      weight: weights[index] ?? 0,
      quantity,
      ...(avgCost !== undefined ? { avg_cost: avgCost } : {}),
      currency: item.currency,
      ...(item.row.market ? { market: item.row.market } : {}),
      ...(item.row.broker?.trim() ? { broker: item.row.broker.trim() } : {}),
    };
  });

  return {
    mode,
    holdings,
    errors: [],
    baseCurrency,
    usesFx: mixed,
  };
}
