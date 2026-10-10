"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import type { FormState } from "@/lib/form-state";

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
  if (parsed.data.alert_frequency) updates.alert_frequency = parsed.data.alert_frequency;

  const { error } = await supabase.from("profiles").update(updates).eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { success: "Ajustes guardados." };
}
