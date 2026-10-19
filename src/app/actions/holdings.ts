"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { userHoldingsSchema } from "@/lib/validation";

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
