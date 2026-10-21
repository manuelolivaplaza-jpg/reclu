/**
 * portfolio-valuation.ts — valorización y P&L de Mi portafolio (F62).
 *
 * Función pura, sin red ni Supabase: recibe las posiciones con el último
 * cierre de `prices` y devuelve valor, P&L absoluto y porcentual y peso.
 *
 * Reglas (deliberadas, para no inventar cifras):
 * - Sin precio (o precio <= 0): `value`, `pnl`, `pnlPct` y `weightPct` son
 *   null. La UI muestra "sin precio" en vez de un cero.
 * - Sin cantidad: no hay valor posible; el costo también queda null.
 * - Sin costo promedio: hay valor, pero P&L null (no se conoce la base).
 * - Costo 0: P&L absoluto = valor y P&L % null (no se divide por cero).
 * - CLP y USD NO se convierten ni se suman: los totales se agrupan por
 *   moneda de la posición.
 */

export type PositionCurrency = "USD" | "CLP";

export interface PositionValuationInput {
  symbol: string;
  quantity?: number | null;
  avgCost?: number | null;
  /** Moneda de la posición (`user_holdings.currency`). */
  currency?: string | null;
  /** Último cierre de `prices`, en la moneda de la posición. */
  price?: number | null;
  /** Fecha del último cierre (ISO date), para mostrar la antigüedad. */
  priceDate?: string | null;
}

export interface PositionValuation {
  symbol: string;
  quantity: number | null;
  avgCost: number | null;
  currency: PositionCurrency;
  price: number | null;
  priceDate: string | null;
  /** cantidad × precio. */
  value: number | null;
  /** cantidad × costo promedio. */
  costBasis: number | null;
  /** valor − costo. */
  pnl: number | null;
  /** P&L sobre el costo, en %. null si el costo es 0 o falta un dato. */
  pnlPct: number | null;
  /** Peso sobre el valor conocido de su misma moneda, en %. */
  weightPct: number | null;
}

export interface CurrencyValuation {
  currency: PositionCurrency;
  positions: PositionValuation[];
  /** Suma de los valores conocidos de esta moneda. */
  totalValue: number;
  /** Suma de las bases de costo conocidas de esta moneda. */
  totalCost: number;
  /** Suma del P&L conocido (solo posiciones con valor y costo). */
  pnl: number;
  /** P&L % sobre el costo de las posiciones con P&L conocido. */
  pnlPct: number | null;
  /** Posiciones con precio utilizable. */
  pricedPositions: number;
  /** Posiciones sin precio (se muestran como "sin precio"). */
  missingPrices: number;
}

export interface PortfolioValuation {
  positions: PositionValuation[];
  /** Un bloque por moneda; nunca se mezclan CLP y USD. */
  totals: CurrencyValuation[];
}

/** Orden estable de monedas: USD, CLP y luego cualquiera desconocida. */
const CURRENCY_ORDER: PositionCurrency[] = ["USD", "CLP"];

/** Normaliza la moneda: solo USD/CLP, con USD por defecto (igual que la 050). */
export function normalizeCurrency(value?: string | null): PositionCurrency {
  const currency = (value ?? "").trim().toUpperCase();
  return currency === "CLP" ? "CLP" : "USD";
}

/** Número finito y positivo, o null. */
function positiveOrNull(value?: number | null): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value;
}

/** Valor usable de un precio: null si falta o no es positivo. */
function priceOrNull(value?: number | null): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

/** Divide sin romper con costo 0: devuelve null en vez de Infinity/NaN. */
function pctOrNull(part: number, base: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(base) || base === 0) return null;
  return (part / base) * 100;
}

/**
 * Valora una cartera completa. El resultado conserva el orden de entrada y
 * agrega totales por moneda sin convertir entre CLP y USD.
 */
export function valuatePortfolio(
  rows: readonly PositionValuationInput[],
): PortfolioValuation {
  const positions: PositionValuation[] = rows.map((row) => {
    const currency = normalizeCurrency(row.currency);
    const quantity = positiveOrNull(row.quantity);
    const avgCost = positiveOrNull(row.avgCost);
    const price = priceOrNull(row.price);

    const value =
      quantity !== null && price !== null ? quantity * price : null;
    const costBasis =
      quantity !== null && avgCost !== null ? quantity * avgCost : null;
    const pnl =
      value !== null && costBasis !== null ? value - costBasis : null;

    return {
      symbol: String(row.symbol ?? "").trim().toUpperCase(),
      quantity,
      avgCost,
      currency,
      price,
      priceDate: price !== null ? (row.priceDate ?? null) : null,
      value,
      costBasis,
      pnl,
      pnlPct: pnl !== null ? pctOrNull(pnl, costBasis ?? 0) : null,
      weightPct: null,
    };
  });

  const currencies = new Set(positions.map((position) => position.currency));
  const orderedCurrencies = [
    ...CURRENCY_ORDER.filter((currency) => currencies.has(currency)),
    ...[...currencies]
      .filter((currency) => !CURRENCY_ORDER.includes(currency))
      .sort(),
  ];

  const totals: CurrencyValuation[] = orderedCurrencies.map((currency) => {
    const group = positions.filter((position) => position.currency === currency);
    const totalValue = group.reduce(
      (sum, position) => sum + (position.value ?? 0),
      0,
    );
    const totalCost = group.reduce(
      (sum, position) => sum + (position.costBasis ?? 0),
      0,
    );
    const pnl = group.reduce((sum, position) => sum + (position.pnl ?? 0), 0);
    const costWithPnl = group.reduce(
      (sum, position) =>
        sum + (position.pnl !== null ? (position.costBasis ?? 0) : 0),
      0,
    );

    // Peso solo entre posiciones con precio: las que no lo tienen no
    // reciben un 0% que parezca dato real.
    for (const position of group) {
      position.weightPct =
        position.value !== null && totalValue > 0
          ? (position.value / totalValue) * 100
          : null;
    }

    return {
      currency,
      positions: group,
      totalValue,
      totalCost,
      pnl,
      pnlPct: costWithPnl > 0 ? (pnl / costWithPnl) * 100 : null,
      pricedPositions: group.filter((position) => position.price !== null).length,
      missingPrices: group.filter((position) => position.price === null).length,
    };
  });

  return { positions, totals };
}
