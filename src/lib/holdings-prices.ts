/**
 * holdings-prices.ts — últimos cierres de `prices` para la carga de cartera
 * (F78).
 *
 * La conversión de "cantidad de acciones" o "monto en dinero" a peso relativo
 * necesita el precio de cada símbolo. La fuente es la misma que usa la
 * valorización de Mi portafolio: el último cierre de la tabla `prices`.
 *
 * Reglas:
 * - Los tickers chilenos se guardan en `prices` con sufijo `.SN` (Yahoo). Si
 *   la posición es de mercado CL o está en CLP se busca también con `.SN`.
 * - La moneda del precio manda: si el cierre se encontró con sufijo `.SN` es
 *   CLP; si no, la moneda declarada en la posición (USD por defecto).
 * - Sin precio no se inventa nada: la posición queda sin precio y el caller
 *   decide qué hacer (en modo acciones/monto es un error por símbolo).
 */

import { createClient } from "@/lib/supabase/server";
import { normalizeCurrency, type PositionCurrency } from "@/lib/portfolio-valuation";

export interface HoldingPriceInput {
  symbol: string;
  market?: "US" | "CL" | null;
  currency?: string | null;
}

export interface HoldingPrice {
  /** Símbolo tal como lo escribió el usuario (sin `.SN`). */
  symbol: string;
  close: number;
  currency: PositionCurrency;
  date: string;
}

interface PriceRow {
  symbol: string;
  close: number | string;
  currency: string | null;
  date: string;
}

/** Sufijo de Yahoo para los tickers chilenos. */
export const CHILE_PRICE_SUFFIX = ".SN";

/**
 * Candidatos de búsqueda en `prices` para un símbolo: el ticker tal cual y,
 * si la posición es chilena, su versión con `.SN`.
 */
export function priceSymbolCandidates(
  symbol: string,
  market?: "US" | "CL" | null,
  currency?: string | null,
): string[] {
  const clean = symbol.trim().toUpperCase();
  if (!clean) return [];
  const candidates = [clean];
  const chilean = market === "CL" || normalizeCurrency(currency) === "CLP";
  if (chilean && !clean.endsWith(CHILE_PRICE_SUFFIX)) {
    candidates.push(`${clean}${CHILE_PRICE_SUFFIX}`);
  }
  return candidates;
}

type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        order: (
          column: string,
          options: { ascending: boolean },
        ) => { limit: (n: number) => { maybeSingle: () => Promise<unknown> } };
      };
    };
  };
};

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Moneda del cierre encontrado. Un `.SN` siempre es CLP; el resto usa la
 * moneda declarada en la posición (la columna `prices.currency` sale por
 * defecto en USD y el scraper no la actualiza, así que no decide).
 */
function currencyForPrice(
  matchedSymbol: string,
  declared: string | null | undefined,
): PositionCurrency {
  if (matchedSymbol.endsWith(CHILE_PRICE_SUFFIX)) return "CLP";
  return normalizeCurrency(declared);
}

/**
 * Último cierre por símbolo. Se consulta de a 8 en paralelo para no abrir
 * cientos de requests si la cartera es grande. Un símbolo sin precio no
 * aparece en el mapa: nunca se devuelve un 0 que parezca una cotización.
 */
export async function loadHoldingPrices(
  items: readonly HoldingPriceInput[],
  client?: SupabaseLike,
): Promise<Map<string, HoldingPrice>> {
  const prices = new Map<string, HoldingPrice>();
  if (items.length === 0) return prices;

  const supabase = (client ?? (await createClient())) as unknown as SupabaseLike;
  const CHUNK = 8;

  for (let index = 0; index < items.length; index += CHUNK) {
    const chunk = items.slice(index, index + CHUNK);
    const results = await Promise.all(
      chunk.map(async (item): Promise<HoldingPrice | null> => {
        const symbol = item.symbol.trim().toUpperCase();
        // Se prueban los candidatos declarados y, como respaldo, la versión
        // `.SN`: los tickers chilenos se guardan en `prices` con ese sufijo
        // y el usuario puede no saber si es chileno o no.
        const candidates = [
          ...priceSymbolCandidates(symbol, item.market, item.currency),
          ...(symbol.endsWith(CHILE_PRICE_SUFFIX)
            ? []
            : [`${symbol}${CHILE_PRICE_SUFFIX}`]),
        ];
        for (const candidate of candidates) {
          const { data, error } = (await supabase
            .from("prices")
            .select("symbol, close, currency, date")
            .eq("symbol", candidate)
            .order("date", { ascending: false })
            .limit(1)
            .maybeSingle()) as {
            data: PriceRow | null;
            error: { message: string } | null;
          };
          if (error) {
            console.warn("[reclu] prices:", error.message);
            return null;
          }
          if (!data) continue;
          const close = toNumber(data.close);
          if (close === null || close <= 0) continue;
          return {
            symbol,
            close,
            currency: currencyForPrice(candidate, item.currency),
            date: data.date,
          };
        }
        return null;
      }),
    );

    for (const result of results) {
      if (!result) continue;
      prices.set(result.symbol, result);
    }
  }

  return prices;
}
