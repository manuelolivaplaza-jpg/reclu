"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { userHoldingsSchema } from "@/lib/validation";
import { canAddPositions, portfolioLimitsFor } from "@/lib/plans";
import { portfolioConsentErrorMessage } from "@/lib/portfolio-consent";
import {
  CSV_SOURCE,
  DEFAULT_HOLDING_SOURCE,
  normalizeHoldingSource,
} from "@/lib/holding-source";
import {
  MAX_CSV_LENGTH,
  importSymbolsSchema,
  parseHoldingsCsv,
  type OverlapEntry,
  type OverlapHolder,
} from "@/lib/import-holdings";

type SupabaseSessionClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Bloqueo por consentimiento (F75B): si Mi portafolio está encendido, la
 * cartera solo se guarda con un consentimiento vigente. Una versión anterior
 * del texto obliga a aceptar de nuevo.
 */
async function portfolioConsentError(
  supabase: SupabaseSessionClient,
  userId: string,
): Promise<string | null> {
  // M1 (F77, decision de Manu): el consentimiento se exige SIEMPRE, tambien
  // en /compare y con MY_PORTFOLIO_ENABLED apagado.
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

type Currency = "USD" | "CLP";
type Market = "US" | "CL";

interface NormalizedHolding {
  symbol: string;
  name: string;
  weight: number;
  quantity?: number;
  avg_cost?: number;
  currency: Currency;
  market?: Market;
  broker?: string;
}

/**
 * Une símbolos repetidos (sin distinguir mayúsculas) antes del upsert: Postgres
 * no permite tocar la misma fila dos veces en un mismo ON CONFLICT. Las
 * cantidades se suman y el costo promedio se pondera por cantidad.
 */
function mergeHoldings(holdings: NormalizedHolding[]): NormalizedHolding[] {
  const bySymbol = new Map<string, NormalizedHolding>();

  for (const holding of holdings) {
    const symbol = holding.symbol.toUpperCase().trim();
    const previous = bySymbol.get(symbol);
    if (!previous) {
      bySymbol.set(symbol, { ...holding, symbol });
      continue;
    }

    const previousQuantity = previous.quantity ?? 0;
    const incomingQuantity = holding.quantity ?? 0;
    const quantity = previousQuantity + incomingQuantity;
    const hasQuantity =
      previous.quantity !== undefined || holding.quantity !== undefined;
    const avgCost =
      previous.avg_cost !== undefined &&
      holding.avg_cost !== undefined &&
      quantity > 0
        ? (previousQuantity * previous.avg_cost +
            incomingQuantity * holding.avg_cost) /
          quantity
        : (holding.avg_cost ?? previous.avg_cost);

    bySymbol.set(symbol, {
      symbol,
      name: holding.name || previous.name,
      weight: previous.weight + holding.weight,
      quantity: hasQuantity ? quantity : undefined,
      avg_cost: avgCost,
      currency: holding.currency ?? previous.currency,
      market: holding.market ?? previous.market,
      broker: holding.broker ?? previous.broker,
    });
  }

  return [...bySymbol.values()];
}

/**
 * Traduce el raise del trigger `enforce_user_holdings_limit` (052).
 *
 * F80: el mensaje crudo de Postgres nunca llega al usuario (puede filtrar
 * nombres de tablas, columnas o detalle interno). Solo se reconoce el caso
 * conocido del tope de posiciones; el resto es un mensaje genérico.
 */
function friendlyHoldingDbError(message: string): string {
  if (/límite de posiciones/i.test(message)) {
    return "Alcanzaste el límite de posiciones de tu plan.";
  }
  return "No pudimos guardar tu cartera. Intenta de nuevo.";
}

/**
 * F80: log técnico del fallo de Supabase. Se registra SOLO el código del
 * error (`error.code`), nunca el mensaje: el mensaje puede traer detalle
 * interno de la base que no debe terminar en los logs ni en la respuesta.
 */
function logDbError(scope: string, error: { code?: string } | null): void {
  console.error(`[reclu] ${scope}:`, error?.code ?? "sin código");
}

/**
 * Guarda la cartera del usuario con upsert por (user_id, symbol): conserva
 * las posiciones que no vienen, actualiza las enviadas y borra solo las que
 * el usuario quitó. Respeta el tope del plan (F74) y, con
 * MY_PORTFOLIO_ENABLED=true, exige consentimiento explícito (F58).
 * Usa siempre el cliente de sesión para que la RLS aplique.
 *
 * F80: `source` indica el origen de la cartera ("manual" por defecto,
 * "csv" para la importación de archivo, "cartola" para la cartola de la
 * corredora). Se valida en el servidor contra la lista cerrada: un valor
 * desconocido se rechaza y nunca se escribe en la base.
 */
export async function saveUserHoldings(
  input: unknown,
  source: unknown = DEFAULT_HOLDING_SOURCE,
) {
  const resolvedSource = normalizeHoldingSource(source);
  if (!resolvedSource) {
    return { error: "Origen de cartera inválido." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  const parsed = userHoldingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Datos inválidos. Verifica símbolo, cantidad y costo." };
  }

  // Consentimiento explícito para datos financieros (Ley 21.719), solo
  // cuando Mi portafolio está encendido. Vale para guardar y para importar.
  const consentError = await portfolioConsentError(supabase, user.id);
  if (consentError) return { error: consentError };

  // Normalize weights to sum 100
  const holdings = mergeHoldings(parsed.data);
  const total = holdings.reduce((sum, holding) => sum + holding.weight, 0);
  if (total <= 0) return { error: "Las ponderaciones deben sumar más de 0." };

  const normalized = holdings.map((holding) => ({
    ...holding,
    weight: Math.round((holding.weight / total) * 10000) / 100,
  }));

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, trial_ends_at")
    .eq("id", user.id)
    .single();
  const plan = (profile?.plan ?? "free") as string;
  const trialEndsAt = (profile?.trial_ends_at as string | null) ?? null;

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
  const incomingSymbols = new Set(normalized.map((holding) => holding.symbol));
  const newPositions = normalized.filter(
    (holding) => !existingSymbols.has(holding.symbol),
  ).length;

  // La cartera enviada reemplaza a la actual: el tamano final es normalized.length.
  // Se borran primero los simbolos quitados para que el trigger de la 052 no
  // cuente posiciones que van a desaparecer.
  void newPositions;
  if (!canAddPositions(plan, 0, normalized.length, trialEndsAt)) {
    const limit = portfolioLimitsFor(plan, trialEndsAt).maxPositions;
    return {
      error: `Alcanzaste el límite de ${limit} posiciones de tu plan. Elimina una posición o mejora tu plan para agregar más.`,
    };
  }

  // Solo se borran los símbolos que el usuario quitó de la cartera.
  const removedSymbols = [...existingSymbols].filter(
    (symbol) => !incomingSymbols.has(symbol),
  );
  if (removedSymbols.length > 0) {
    const { error: deleteError } = await supabase
      .from("user_holdings")
      .delete()
      .eq("user_id", user.id)
      .in("symbol", removedSymbols);
    if (deleteError) {
      logDbError("holdings delete (saveUserHoldings)", deleteError);
      return { error: "No pudimos borrar tu cartera. Intenta de nuevo." };
    }
  }

  const { error } = await supabase.from("user_holdings").upsert(
    normalized.map((holding) => ({
      user_id: user.id,
      symbol: holding.symbol,
      name: holding.name,
      weight: holding.weight,
      ...(holding.quantity !== undefined ? { quantity: holding.quantity } : {}),
      ...(holding.avg_cost !== undefined ? { avg_cost: holding.avg_cost } : {}),
      currency: holding.currency,
      ...(holding.market ? { market: holding.market } : {}),
      ...(holding.broker ? { broker: holding.broker } : {}),
      source: resolvedSource,
    })),
    { onConflict: "user_id,symbol" },
  );
  if (error) {
    logDbError("holdings upsert (saveUserHoldings)", error);
    return { error: friendlyHoldingDbError(error.message) };
  }


  revalidatePath("/compare");
  return { success: `Cartera guardada: ${normalized.length} activos.` };
}

/**
 * Importa una cartera desde el texto de un CSV con columnas de símbolo y
 * cantidad. La cantidad se normaliza a peso relativo porque `user_holdings`
 * no tiene columna de cantidad (F45 no trae migración). Reemplaza la cartera
 * anterior, igual que saveUserHoldings.
 */
export async function importHoldings(rawCsv: unknown) {
  if (typeof rawCsv !== "string" || !rawCsv.trim()) {
    return { error: "Envía un CSV con las columnas símbolo y cantidad." };
  }
  if (rawCsv.length > MAX_CSV_LENGTH) {
    return { error: "El CSV supera 1 MB. Divídelo en archivos más chicos." };
  }

  const parsedCsv = parseHoldingsCsv(rawCsv);
  if (parsedCsv.rows.length === 0) {
    return {
      error:
        parsedCsv.errors[0] ??
        "No se encontraron filas válidas. Usa columnas symbol/ticker y cantidad/quantity.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  // Mismo bloqueo que saveUserHoldings: sin consentimiento vigente no se
  // importa ni se reemplaza la cartera.
  const consentError = await portfolioConsentError(supabase, user.id);
  if (consentError) return { error: consentError };

  // Defensa extra: el mismo esquema que ya valida saveUserHoldings.
  const validated = userHoldingsSchema.safeParse(
    parsedCsv.rows.map((row) => ({
      symbol: row.symbol,
      name: "",
      weight: row.weight,
    })),
  );
  if (!validated.success) {
    return { error: "Datos inválidos. Verifica símbolo y cantidad." };
  }

  const total = parsedCsv.rows.reduce((sum, row) => sum + row.quantity, 0);
  if (total <= 0) {
    return { error: "Las cantidades deben sumar más de 0." };
  }

  const normalized = parsedCsv.rows.map((row) => ({
    symbol: row.symbol,
    quantity: row.quantity,
    weight: Math.round((row.quantity / total) * 10000) / 100,
  }));

  // F77 (M2): validar el tope del plan ANTES de borrar. Si no, un CSV que
  // excede el limite borraba la cartera y el trigger de la 052 rechazaba
  // el insert: la cartera quedaba vacia.
  const { data: importProfile } = await supabase
    .from("profiles")
    .select("plan, trial_ends_at")
    .eq("id", user.id)
    .single();
  const importPlan = (importProfile?.plan ?? "free") as string;
  const importTrialEndsAt = (importProfile?.trial_ends_at as string | null) ?? null;
  if (!canAddPositions(importPlan, 0, normalized.length, importTrialEndsAt)) {
    const limit = portfolioLimitsFor(importPlan, importTrialEndsAt).maxPositions;
    return {
      error: `El archivo tiene ${normalized.length} activos y tu plan permite ${limit}. Tu cartera no se modificó.`,
    };
  }

  const { error: delError } = await supabase
    .from("user_holdings")
    .delete()
    .eq("user_id", user.id);
  if (delError) {
    logDbError("holdings delete (importHoldings)", delError);
    return { error: "No pudimos borrar tu cartera. Intenta de nuevo." };
  }

  const { error } = await supabase.from("user_holdings").insert(
    normalized.map((row) => ({
      user_id: user.id,
      symbol: row.symbol,
      name: "",
      weight: row.weight,
      // La importación viene de un archivo: el origen es "csv".
      source: CSV_SOURCE,
    })),
  );
  if (error) {
    logDbError("holdings insert (importHoldings)", error);
    return { error: "No pudimos guardar tu cartera. Intenta de nuevo." };
  }

  revalidatePath("/compare");
  return {
    success: `Cartera importada: ${normalized.length} activos.`,
    /** Filas ignoradas (se importaron las válidas). */
    warnings: Math.max(0, parsedCsv.errors.length),
    holdings: normalized,
  };
}

function mapOverlapHolder(value: unknown): OverlapHolder | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.portfolio_id !== "string" || typeof row.slug !== "string") return null;
  const weight = Number(row.weight ?? 0);
  if (!Number.isFinite(weight)) return null;
  return {
    portfolioId: row.portfolio_id,
    slug: row.slug,
    name: typeof row.name === "string" && row.name ? row.name : row.slug,
    category: typeof row.category === "string" ? row.category : "",
    weight,
  };
}

/**
 * "Quién más tiene X" para los símbolos de la cartera del usuario.
 * Usa la RPC get_symbol_holders de la 015 (F9), que ya aplica el recorte del
 * muro de pago y oculta carteras premium a los planes gratis. No devuelve ni
 * escribe la cartera del usuario: solo nombres públicos del catálogo.
 */
export async function getOverlapForSymbols(rawSymbols: unknown) {
  const parsed = importSymbolsSchema.safeParse(rawSymbols);
  if (!parsed.success) {
    return { error: "Símbolos inválidos." };
  }
  const symbols = [...new Set(parsed.data)];
  if (symbols.length === 0) return { overlaps: [] as OverlapEntry[] };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  const overlaps: OverlapEntry[] = [];
  // Lotes de 5 para no abrir 100 RPC en paralelo si importaron el máximo.
  for (let index = 0; index < symbols.length; index += 5) {
    const chunk = symbols.slice(index, index + 5);
    const entries = await Promise.all(
      chunk.map(async (symbol): Promise<OverlapEntry> => {
        const { data, error } = await supabase.rpc("get_symbol_holders", {
          p_symbol: symbol,
        });
        if (error) {
          // F80: solo el código del error, nunca el mensaje crudo de Supabase.
          console.warn("[reclu] get_symbol_holders error:", error.code ?? "sin código");
          return { symbol, totalHolders: 0, holders: [], unavailable: true };
        }
        const holders = (Array.isArray(data) ? data : []).flatMap((row) => {
          const mapped = mapOverlapHolder(row);
          return mapped ? [mapped] : [];
        });
        return {
          symbol,
          totalHolders: holders.length,
          holders: holders.slice(0, 5),
          unavailable: false,
        };
      }),
    );
    overlaps.push(...entries);
  }

  return { overlaps };
}

/** Remove all user holdings. */
export async function clearUserHoldings() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  const { error } = await supabase.from("user_holdings").delete().eq("user_id", user.id);
  if (error) {
    logDbError("holdings delete (clearUserHoldings)", error);
    return { error: "No pudimos borrar tu cartera. Intenta de nuevo." };
  }

  revalidatePath("/compare");
  return { success: "Cartera eliminada." };
}

/**
 * M3 (F77): boton "Borrar" de /compare. Borra TODO lo de la cartera del
 * usuario con `delete_my_portfolio()` (tenencias, ajustes y consentimiento,
 * alertas personales y auditoria; migraciones 050/053/054).
 * `clearUserHoldings` se mantiene para vaciar solo las posiciones desde el
 * editor de Mi portafolio sin perder el consentimiento.
 */
export async function deleteEntirePortfolio() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  const { error } = await supabase.rpc("delete_my_portfolio");
  if (error) {
    console.warn("[reclu] delete_my_portfolio (compare):", error.message);
    return { error: "No pudimos borrar tu cartera. Intenta de nuevo." };
  }

  revalidatePath("/compare");
  revalidatePath("/mi-portafolio");
  revalidatePath("/settings");
  return { success: "Cartera eliminada por completo." };
}
