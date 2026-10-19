"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import type { FormState } from "@/lib/form-state";
import { allowedFrequencies, canUseTelegram, isTrialPro } from "@/lib/plans";

const settingsSchema = z.object({
  full_name: z.string().max(100).optional(),
  alert_frequency: z.enum(["realtime", "daily", "weekly"]).optional(),
});

/**
 * Update the current user's profile settings.
 */
export async function updateSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  const parsed = settingsSchema.safeParse({
    full_name: formData.get("full_name")?.toString(),
    alert_frequency: formData.get("alert_frequency")?.toString(),
  });

  if (!parsed.success) {
    return { error: "Datos inválidos." };
  }

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

  for (let attempt = 0; attempt < 2; attempt++) {
    const code = randomBytes(9).toString("base64url");
    const { error } = await supabase
      .from("profiles")
      .update({ telegram_link_code: code, updated_at: new Date().toISOString() })
      .eq("id", user.id);
    if (!error) {
      revalidatePath("/settings");
      return { success: "Enlace listo. Ábrelo en Telegram para vincular este chat." };
    }
    if (attempt === 1) return { error: error.message };
  }
  return { error: "No pudimos generar el enlace." };
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
