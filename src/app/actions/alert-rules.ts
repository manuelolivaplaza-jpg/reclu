"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/form-state";
import {
  alertRuleInputSchema,
  alertRuleLimitFor,
  friendlyAlertRuleDbError,
} from "@/lib/alert-rules";
import { canUseTelegram } from "@/lib/plans";
import { firstZodMessage, uuidSchema } from "@/lib/validation";

function formString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

/**
 * Crea una regla del usuario autenticado.
 * El tope (gratis 3, pro/elite/prueba 50) lo impone el trigger de la 037;
 * aquí se rechaza antes para devolver un mensaje claro.
 */
export async function createAlertRule(_prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  const rawChannel = formString(formData, "channel");
  const parsed = alertRuleInputSchema.safeParse({
    kind: formString(formData, "kind"),
    value: formString(formData, "value"),
    ...(rawChannel ? { channel: rawChannel } : {}),
  });
  if (!parsed.success) return { error: firstZodMessage(parsed.error) };

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, trial_ends_at")
    .eq("id", user.id)
    .single();
  const plan = (profile?.plan ?? "free") as string;
  const trialEndsAt = (profile?.trial_ends_at as string | null) ?? null;
  const channel = parsed.data.channel;

  if (channel !== "email" && !canUseTelegram(plan, trialEndsAt)) {
    return { error: "Telegram está disponible en Pro, Elite y durante la prueba." };
  }

  const limit = alertRuleLimitFor(plan, trialEndsAt);
  const { count, error: countError } = await supabase
    .from("alert_rules")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (countError) return { error: "No pudimos guardar la regla." };
  if ((count ?? 0) >= limit) {
    return { error: "Alcanzaste el límite de reglas de alerta de tu plan." };
  }

  const { error } = await supabase.from("alert_rules").insert({
    user_id: user.id,
    kind: parsed.data.kind,
    value: parsed.data.value,
    channel,
    active: true,
  });
  if (error) {
    return { error: friendlyAlertRuleDbError(error.message, error.code) ?? "No pudimos guardar la regla." };
  }

  revalidatePath("/settings");
  return { success: "Regla creada. Te avisamos cuando una fuente pública la cumpla." };
}

/** Borra una regla propia. No toca otras cuentas: filtra por user_id y RLS. */
export async function deleteAlertRule(_prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  const parsed = uuidSchema.safeParse(formString(formData, "id"));
  if (!parsed.success) return { error: "No encontramos esa regla." };

  const { data, error } = await supabase
    .from("alert_rules")
    .delete()
    .eq("id", parsed.data)
    .eq("user_id", user.id)
    .select("id");
  if (error) return { error: "No pudimos eliminar la regla." };
  if (!data || data.length === 0) return { error: "No encontramos esa regla." };

  revalidatePath("/settings");
  return { success: "Regla eliminada." };
}
