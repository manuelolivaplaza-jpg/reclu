"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import type { FormState } from "@/lib/form-state";
import { allowedFrequencies, isTrialPro } from "@/lib/plans";

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
