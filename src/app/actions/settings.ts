"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/form-state";
import { firstZodMessage, settingsSchema } from "@/lib/validation";

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
  if (parsed.data.alert_frequency) updates.alert_frequency = parsed.data.alert_frequency;

  const { error } = await supabase.from("profiles").update(updates).eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { success: "Ajustes guardados." };
}
