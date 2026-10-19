"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { userHoldingsSchema } from "@/lib/validation";
import {
  MAX_CSV_LENGTH,
  importSymbolsSchema,
  parseHoldingsCsv,
  type OverlapEntry,
  type OverlapHolder,
} from "@/lib/import-holdings";

/**
 * Save the user's own holdings (replacing existing ones).
 * Accepts a list from CSV parse or manual entry.
 */
export async function saveUserHoldings(input: unknown) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  const parsed = userHoldingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Datos inválidos. Verifica símbolo y ponderación." };
  }

  // Normalize weights to sum 100
  const total = parsed.data.reduce((sum, h) => sum + h.weight, 0);
  if (total <= 0) return { error: "Las ponderaciones deben sumar más de 0." };

  const normalized = parsed.data.map((h) => ({
    ...h,
    weight: (h.weight / total) * 100,
  }));

  // Replace all: delete then insert
  const { error: delError } = await supabase
    .from("user_holdings")
    .delete()
    .eq("user_id", user.id);
  if (delError) return { error: delError.message };

  const { error } = await supabase.from("user_holdings").insert(
    normalized.map((h) => ({
      user_id: user.id,
      symbol: h.symbol.toUpperCase().trim(),
      name: h.name,
      weight: Math.round(h.weight * 100) / 100,
      source: "csv" as const,
    })),
  );
  if (error) return { error: error.message };

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

  const { error: delError } = await supabase
    .from("user_holdings")
    .delete()
    .eq("user_id", user.id);
  if (delError) return { error: delError.message };

  const { error } = await supabase.from("user_holdings").insert(
    normalized.map((row) => ({
      user_id: user.id,
      symbol: row.symbol,
      name: "",
      weight: row.weight,
      source: "csv" as const,
    })),
  );
  if (error) return { error: error.message };

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
          console.warn("[reclu] get_symbol_holders error:", error.message);
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
  if (error) return { error: error.message };

  revalidatePath("/compare");
  return { success: "Cartera eliminada." };
}
