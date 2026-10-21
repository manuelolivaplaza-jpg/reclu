import type { PositionValuation } from "@/lib/portfolio-valuation";

/** Posición editable de Mi portafolio, ya cruzada con el último precio. */
export interface EditablePosition {
  symbol: string;
  name: string;
  quantity: number | null;
  avgCost: number | null;
  currency: "USD" | "CLP";
  market: "US" | "CL" | null;
  /** Último cierre de `prices`; null = "sin precio". */
  price: number | null;
  priceDate: string | null;
  /** Peso guardado (0–100). Permite precargar el modo porcentaje (F78). */
  weight: number | null;
}

/** Fila valorizada que consume la tabla (incluye nombre y mercado). */
export interface ValuedPositionRow extends PositionValuation {
  name: string;
  market: "US" | "CL" | null;
}
