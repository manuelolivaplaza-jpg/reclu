"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/form-state";
import { uuidSchema } from "@/lib/validation";

/** Guarda compras/ventas por email para un portafolio seguido (RLS: solo lo propio). */
export async function saveTradeAlertPref(_prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };
  const parsed = uuidSchema.safeParse(formData.get("portfolio_id"));
  if (!parsed.success) return { error: "Portafolio inválido." };
  const { error } = await supabase.from("follow_alert_prefs").upsert(
    {
      user_id: user.id,
      portfolio_id: parsed.data,
      email_buys: formData.get("email_buys") === "on",
      email_sells: formData.get("email_sells") === "on",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,portfolio_id" },
  );
  if (error) return { error: "No pudimos guardar la preferencia. Intenta de nuevo." };
  revalidatePath("/settings");
  return { success: "Guardado." };
}
