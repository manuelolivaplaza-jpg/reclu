/**
 * Lista de compras para "replicar" un portafolio (F41).
 *
 * Función PURA: a partir de un monto y su moneda, reparte ese monto entre
 * las posiciones que el rol ya puede ver y calcula cuántas acciones o
 * fracciones comprar. NO ejecuta órdenes, no las enruta y no recomienda
 * comprar nada (Ley 21.521): solo describe una lista informativa.
 *
 * Solo se usan las posiciones que llegan por parámetro; el recorte por rol
 * ocurre antes, en el servidor (`src/lib/access.ts`). Aquí no se pide nada
 * que el rol no pueda ver.
 */

import type { Holding } from "@/lib/types";

export type ReplicateCurrency = "CLP" | "USD";

/** El monto se reparte proporcional al peso de las posiciones visibles. */
export interface ReplicateItem {
  symbol: string;
  name: string;
  /** Peso original de la posición, 0–100. */
  weight: number;
  /** Peso normalizado sobre las posiciones visibles, 0–100. */
  targetWeight: number;
  /** Precio unitario en la moneda del activo, o null si falta. */
  price: number | null;
  priceCurrency: ReplicateCurrency | "EUR";
  /** Acciones/fracciones a comprar (4 decimales), o null si falta precio. */
  shares: number | null;
  /** Monto asignado en la moneda de entrada, o null si falta precio. */
  invested: number | null;
  /** Motivo legible cuando no se pudo calcular. */
  warning?: string;
}

export interface ShoppingList {
  moneda: ReplicateCurrency;
  monto: number;
  /** Pesos por dólar usados para cruzar monedas. */
  fx: number;
  fracciones: boolean;
  items: ReplicateItem[];
  /** Monto asignado a posiciones con precio, en la moneda de entrada. */
  invertido: number;
  /** Monto que quedó sin asignar (redondeo o posiciones sin precio). */
  restante: number;
  /** Cuántas posiciones no se pudieron valorar. */
  sinPrecio: number;
}

export interface BuildShoppingListOptions {
  /** Si es false solo compra acciones enteras (Math.floor). Default: true. */
  fracciones?: boolean;
}

/**
 * Mínimos y condiciones de las corredoras, solo como texto de ayuda.
 * No son una recomendación: el usuario confirma con su propia corredora.
 */
export const BROKER_MINIMUMS = [
  {
    broker: "Racional",
    note: "Permite comprar fracciones desde $5.000.",
    href: "https://racional.cl/stocks",
  },
  {
    broker: "Fintual",
    note: "Hasta 10 órdenes al mes sin costo.",
    href: "https://chocale.cl/2026/04/mas-opciones-de-inversion-menor-friccion-e-integracion-con-ia-los-anuncios-de-fintual-en-su-update/",
  },
] as const;

export const MINIMUM_NOTICE =
  "Cada corredora tiene su propio mínimo y comisión. Verifica el monto mínimo antes de armar las órdenes: los montos pequeños pueden quedar bajo el mínimo.";

const ROUND = 4;
const NUDGE = 1e-8;

function round4(value: number): number {
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * 10 ** ROUND + NUDGE)) / 10 ** ROUND;
}

function assertMonto(monto: number): void {
  if (!Number.isFinite(monto) || monto <= 0) {
    throw new Error("Ingresa un monto mayor que cero.");
  }
}

function assertFx(fx: number): void {
  if (!Number.isFinite(fx) || fx <= 0) {
    throw new Error("Ingresa un tipo de cambio (pesos por dólar) mayor que cero.");
  }
}

/** Convierte un monto entre CLP y USD. No toca EUR. */
function convert(
  amount: number,
  from: ReplicateCurrency,
  to: ReplicateCurrency,
  fx: number,
): number {
  if (from === to) return amount;
  return from === "USD" ? amount * fx : amount / fx;
}

/**
 * Precio unitario usado para la lista. Prefiere el precio actual; si no hay,
 * usa el precio a la fecha de la divulgación. Sin ninguno, la posición no
 * se puede valorar.
 */
function pickPrice(holding: Holding): number | null {
  const candidates = [holding.price_current, holding.price_at_disclosure];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
  }
  return null;
}

/**
 * Construye la lista de compras. PURA: no hace fetch ni lee el entorno.
 *
 * El monto se reparte proporcional al peso de las posiciones visibles (si el
 * rol solo ve el top 5, se replica ese top 5 con el total del monto). No es
 * una orden ni una recomendación: es una lista informativa.
 */
export function buildShoppingList(
  holdings: Holding[],
  monto: number,
  moneda: ReplicateCurrency,
  fx: number,
  options: BuildShoppingListOptions = {},
): ShoppingList {
  assertMonto(monto);
  const fracciones = options.fracciones ?? true;
  // El tipo de cambio solo se exige si hay que cruzar monedas.
  const needsFx = holdings.some((h) => h.currency === "USD" || h.currency === "CLP");
  if (needsFx) assertFx(fx);

  const totalWeight = holdings.reduce(
    (sum, h) => sum + (Number.isFinite(h.weight) && h.weight > 0 ? h.weight : 0),
    0,
  );

  const items: ReplicateItem[] = holdings.map((holding) => {
    const weight = Number.isFinite(holding.weight) && holding.weight > 0 ? holding.weight : 0;
    const targetWeight = totalWeight > 0 ? round4((weight / totalWeight) * 100) : 0;
    const base: ReplicateItem = {
      symbol: holding.symbol,
      name: holding.name,
      weight,
      targetWeight,
      price: null,
      priceCurrency: holding.currency,
      shares: null,
      invested: null,
    };

    if (totalWeight <= 0 || weight <= 0) {
      return { ...base, warning: "Sin peso asignado." };
    }

    const price = pickPrice(holding);
    if (price === null) {
      return { ...base, warning: "Sin precio de referencia." };
    }

    if (holding.currency !== "CLP" && holding.currency !== "USD") {
      return { ...base, price, warning: "Moneda sin tipo de cambio." };
    }

    const assigned = (monto * weight) / totalWeight;
    // Monto asignado expresado en la moneda del activo.
    const assignedInAsset = convert(assigned, moneda, holding.currency, fx);
    const rawShares = assignedInAsset / price;
    const shares = fracciones ? round4(rawShares) : Math.floor(rawShares);
    const invested = convert(shares * price, holding.currency, moneda, fx);

    return {
      ...base,
      price,
      shares,
      invested: round4(invested),
    };
  });

  const invertido = round4(
    items.reduce((sum, item) => sum + (item.invested ?? 0), 0),
  );
  const sinPrecio = items.filter((item) => item.shares === null).length;

  return {
    moneda,
    monto,
    fx,
    fracciones,
    items,
    invertido,
    restante: round4(Math.max(0, monto - invertido)),
    sinPrecio,
  };
}

/** CSV de la lista (cabecera + filas). No contiene enlaces ni órdenes. */
export function shoppingListToCsv(list: ShoppingList): string {
  const header = [
    "symbol",
    "name",
    "weight",
    "target_weight",
    "price",
    "price_currency",
    "shares",
    "invested",
    "moneda",
  ].join(",");

  const rows = list.items.map((item) => {
    const name = item.name.includes(",") ? `"${item.name.replace(/"/g, '""')}"` : item.name;
    return [
      item.symbol,
      name,
      item.weight.toFixed(4),
      item.targetWeight.toFixed(4),
      item.price !== null ? item.price.toFixed(4) : "",
      item.priceCurrency,
      item.shares !== null ? item.shares.toFixed(4) : "",
      item.invested !== null ? item.invested.toFixed(4) : "",
      list.moneda,
    ].join(",");
  });

  return [header, ...rows].join("\n");
}
