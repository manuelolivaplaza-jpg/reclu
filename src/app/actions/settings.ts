"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/form-state";
import { firstZodMessage, settingsSchema } from "@/lib/validation";
import { allowedFrequencies, canUseTelegram, isTrialPro } from "@/lib/plans";

/**
 * Update the current user's profile settings.
 */
export async function updateSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  const rawName = formData.get("full_name");
  const rawFrequency = formData.get("alert_frequency");
  const rawChannel = formData.get("alert_channel");
  const rawDigest = formData.get("weekly_digest");
  const parsed = settingsSchema.safeParse({
    ...(rawName != null ? { full_name: String(rawName) } : {}),
    ...(rawFrequency != null ? { alert_frequency: String(rawFrequency) } : {}),
    ...(rawChannel != null ? { alert_channel: String(rawChannel) } : {}),
    ...(rawDigest != null ? { weekly_digest: String(rawDigest) === "true" } : {}),
  });

  if (!parsed.success) {
    return { error: firstZodMessage(parsed.error) };
  }

  // Solo columnas que existen hoy. alert_channel y weekly_digest se validan
  // pero no se escriben: la tabla aún no las tiene (TODO(integración)).
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.full_name !== undefined) updates.full_name = parsed.data.full_name;
  if (parsed.data.alert_frequency) {
    // Frecuencia según plan real: tiempo real solo para Pro/Elite/prueba
    // (misma fuente única que la UI: src/lib/plans.ts).
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan, trial_ends_at")
      .eq("id", user.id)
      .single();
    const plan = (profile?.plan ?? "free") as string;
    const trialEndsAt = (profile?.trial_ends_at as string | null) ?? null;
    const effectivePlan = isTrialPro(plan, trialEndsAt) ? "pro" : plan;
    const allowed = allowedFrequencies(effectivePlan, trialEndsAt);
    const freq = parsed.data.alert_frequency as (typeof allowed)[number];
    updates.alert_frequency = allowed.includes(freq) ? freq : "daily";
  }

  const { error } = await supabase.from("profiles").update(updates).eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { success: "Ajustes guardados." };
}

/** Genera el código que el usuario manda con /start al bot. */
export async function prepareTelegramLink(_prev: FormState, formData: FormData): Promise<FormState> {
  void formData;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, trial_ends_at")
    .eq("id", user.id)
    .single();
  const plan = (profile?.plan ?? "free") as string;
  const trialEndsAt = (profile?.trial_ends_at as string | null) ?? null;
  if (!canUseTelegram(plan, trialEndsAt)) {
    return { error: "Telegram está disponible en Pro, Elite y durante la prueba." };
  }

  // M10: la columna la escribe una RPC `security definer` (047) con
  // auth.uid(); el UPDATE directo lo revertía el trigger de la 007.
  const { data: code, error } = await supabase.rpc("create_telegram_link_code");
  if (error || typeof code !== "string" || code.length === 0) {
    return { error: "No pudimos generar el enlace." };
  }

  revalidatePath("/settings");
  return { success: "Enlace listo. Ábrelo en Telegram para vincular este chat." };
}

const channelSchema = z.object({
  alert_channel: z.enum(["email", "telegram", "both"]),
});

/** Guarda el canal de alertas. Telegram solo si el plan (o la prueba) lo permite. */
export async function updateAlertChannel(_prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  const parsed = channelSchema.safeParse({
    alert_channel: formData.get("alert_channel")?.toString(),
  });
  if (!parsed.success) return { error: "Canal inválido." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, trial_ends_at")
    .eq("id", user.id)
    .single();
  const plan = (profile?.plan ?? "free") as string;
  const trialEndsAt = (profile?.trial_ends_at as string | null) ?? null;
  const channel = parsed.data.alert_channel;
  if (channel !== "email" && !canUseTelegram(plan, trialEndsAt)) {
    return { error: "Telegram está disponible en Pro, Elite y durante la prueba." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ alert_channel: channel, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { success: "Canal guardado." };
}
