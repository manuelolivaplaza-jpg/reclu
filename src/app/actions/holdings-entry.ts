"use server";

/**
 * holdings-entry.ts — guardado de cartera por cantidad de acciones, monto en
 * dinero o porcentaje (F78).
 *
 * Acción nueva, separada de `actions/holdings.ts` (que otra sesión está
 * tocando): recibe el modo y las filas crudas, convierte con el helper puro
 * `lib/holdings-entry` usando el último cierre de `prices` y guarda.
 *
 * Reglas:
 * - Un solo modo por cartera: el que llega en `mode`.
 * - En modo acciones o monto hace falta el precio del símbolo. Si falta, se
 *   devuelve un error por símbolo y NO se guarda nada (nunca a medias).
 * - Si la cartera mezcla USD y CLP hace falta el tipo de cambio (CLP por
 *   dólar). Sin él no se mezclan monedas: error y no se guarda.
 * - Se respeta el tope de posiciones del plan y el consentimiento vigente.
 * - Se guardan las columnas existentes: `weight`, `quantity`, `currency`,
 *   `avg_cost`, `market` y `broker`. No se crean columnas nuevas.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { canAddPositions, portfolioLimitsFor } from "@/lib/plans";
import { portfolioConsentErrorMessage } from "@/lib/portfolio-consent";
import { loadHoldingPrices } from "@/lib/holdings-prices";
import {
  resolveHoldingsEntry,
  type HoldingEntryMode,
  type HoldingEntryRow,
} from "@/lib/holdings-entry";

/** Una posición tal como la envía el cliente: el valor va en el modo elegido. */
const entryRowSchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .regex(/^[A-Za-z0-9.\-]+$/, "Símbolo inválido."),
  name: z.string().trim().max(100).optional(),
  /** Porcentaje, cantidad de acciones o monto, según el modo. */
  value: z.number().finite().positive("Ingresa un valor mayor que 0."),
  currency: z.enum(["USD", "CLP"]).optional(),
  market: z.enum(["US", "CL"]).optional(),
  avg_cost: z.number().finite().min(0).optional(),
  broker: z.string().trim().max(60).optional(),
});

const saveByModeSchema = z.object({
  mode: z.enum(["percentage", "shares", "amount"]),
  rows: z.array(entryRowSchema).min(1).max(100),
  /** Pesos por dólar. Solo hace falta si la cartera mezcla USD y CLP. */
  fx: z.number().finite().positive().optional(),
});

export interface HoldingEntryError {
  symbol: string;
  message: string;
}

export interface SaveHoldingsByModeResult {
  success?: string;
  error?: string;
  /** Errores por símbolo: el cliente los muestra junto a cada posición. */
  errors?: HoldingEntryError[];
  /** Cartera guardada, con el peso ya normalizado. */
  holdings?: Array<{ symbol: string; weight: number; quantity?: number }>;
}

/**
 * Últimos cierres de los símbolos indicados. La usa la UI para mostrar pesos
 * y valorizaciones en vivo antes de guardar (y para detectar si la cartera
 * mezcla USD y CLP, que necesita tipo de cambio).
 */
export async function getHoldingPrices(symbols: unknown) {
  const parsed = z
    .array(z.string().trim().min(1).max(20))
    .max(100)
    .safeParse(symbols);
  if (!parsed.success) return { error: "Símbolos inválidos." };

  const unique = [...new Set(parsed.data.map((symbol) => symbol.toUpperCase()))];
  if (unique.length === 0) return { prices: [] };

  const prices = await loadHoldingPrices(
    unique.map((symbol) => ({ symbol })),
  );
  return {
    prices: [...prices.values()].map((price) => ({
      symbol: price.symbol,
      close: price.close,
      currency: price.currency,
      date: price.date,
    })),
  };
}

/**
 * Traduce el bloqueo de consentimiento: se exige SIEMPRE (M1 de F77), también
 * en /compare y con MY_PORTFOLIO_ENABLED apagado.
 */
async function portfolioConsentError(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("user_portfolio_settings")
    .select("consent_at, consent_version")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    return "No pudimos verificar tu consentimiento. Intenta de nuevo.";
  }
  const settings = data as
    | { consent_at?: string | null; consent_version?: string | null }
    | null;
  return portfolioConsentErrorMessage(
    settings?.consent_at,
    settings?.consent_version,
  );
}

/** Convierte las filas del cliente a filas del helper según el modo. */
function toEntryRows(
  mode: HoldingEntryMode,
  rows: z.infer<typeof entryRowSchema>[],
): HoldingEntryRow[] {
  return rows.map((row) => ({
    symbol: row.symbol,
    name: row.name,
    currency: row.currency ?? null,
    market: row.market ?? null,
    avg_cost: row.avg_cost ?? null,
    broker: row.broker ?? null,
    ...(mode === "percentage"
      ? { percentage: row.value }
      : mode === "shares"
        ? { shares: row.value }
        : { amount: row.value }),
  }));
}

/**
 * Guarda la cartera en el modo indicado. Convierte con los precios más
 * recientes de `prices`, respeta el tope del plan y el consentimiento.
 */
export async function saveHoldingsByMode(
  input: unknown,
): Promise<SaveHoldingsByModeResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  const parsed = saveByModeSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      error: first?.message ?? "Datos inválidos. Revisa los valores ingresados.",
    };
  }

  const { mode, rows, fx } = parsed.data;

  const consentError = await portfolioConsentError(supabase, user.id);
  if (consentError) return { error: consentError };

  // En porcentaje no hace falta ningún precio: los pesos se normalizan.
  const prices =
    mode === "percentage"
      ? new Map()
      : await loadHoldingPrices(
          rows.map((row) => ({
            symbol: row.symbol,
            market: row.market ?? null,
            currency: row.currency ?? null,
          })),
        );

  const entryRows = toEntryRows(mode, rows).map((row) => {
    const price = prices.get(row.symbol);
    return {
      ...row,
      price: price?.close ?? null,
      priceCurrency: price?.currency ?? null,
    };
  });

  const resolved = resolveHoldingsEntry(mode, entryRows, { fx: fx ?? null });
  if (resolved.errors.length > 0) {
    return {
      error: resolved.errors[0]?.message ?? "No pudimos convertir tu cartera.",
      errors: resolved.errors.map((error) => ({
        symbol: error.symbol,
        message: error.message,
      })),
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, trial_ends_at")
    .eq("id", user.id)
    .single();
  const plan = (profile?.plan ?? "free") as string;
  const trialEndsAt = (profile?.trial_ends_at as string | null) ?? null;

  if (!canAddPositions(plan, 0, resolved.holdings.length, trialEndsAt)) {
    const limit = portfolioLimitsFor(plan, trialEndsAt).maxPositions;
    return {
      error: `Alcanzaste el límite de ${limit} posiciones de tu plan. Elimina una posición o mejora tu plan para agregar más.`,
    };
  }

  // La cartera enviada reemplaza a la actual: se borran solo los símbolos
  // que el usuario quitó (para que el trigger del tope no cuente posiciones
  // que van a desaparecer).
  const { data: existingRows, error: existingError } = await supabase
    .from("user_holdings")
    .select("symbol")
    .eq("user_id", user.id);
  if (existingError) {
    return { error: "No pudimos leer tu cartera actual. Intenta de nuevo." };
  }

  const existingSymbols = new Set(
    (existingRows ?? []).map((row) => String(row.symbol).toUpperCase()),
  );
  const incomingSymbols = new Set(
    resolved.holdings.map((holding) => holding.symbol),
  );
  const removedSymbols = [...existingSymbols].filter(
    (symbol) => !incomingSymbols.has(symbol),
  );
  if (removedSymbols.length > 0) {
    const { error: deleteError } = await supabase
      .from("user_holdings")
      .delete()
      .eq("user_id", user.id)
      .in("symbol", removedSymbols);
    if (deleteError) return { error: deleteError.message };
  }

  const { error } = await supabase.from("user_holdings").upsert(
    resolved.holdings.map((holding) => ({
      user_id: user.id,
      symbol: holding.symbol,
      name: holding.name,
      weight: holding.weight,
      ...(holding.quantity !== undefined ? { quantity: holding.quantity } : {}),
      ...(holding.avg_cost !== undefined
        ? { avg_cost: holding.avg_cost }
        : {}),
      currency: holding.currency,
      ...(holding.market ? { market: holding.market } : {}),
      ...(holding.broker ? { broker: holding.broker } : {}),
      source: "manual" as const,
    })),
    { onConflict: "user_id,symbol" },
  );
  if (error) {
    return {
      error: /l[ií]mite de posiciones/i.test(error.message)
        ? "Alcanzaste el límite de posiciones de tu plan."
        : error.message,
    };
  }

  revalidatePath("/compare");
  revalidatePath("/mi-portafolio");

  return {
    success: `Cartera guardada: ${resolved.holdings.length} activos.`,
    holdings: resolved.holdings.map((holding) => ({
      symbol: holding.symbol,
      weight: holding.weight,
      ...(holding.quantity !== undefined ? { quantity: holding.quantity } : {}),
    })),
  };
}
