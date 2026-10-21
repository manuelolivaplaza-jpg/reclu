"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isMyPortfolioEnabled } from "@/lib/portfolio-flags";
import {
  DELETE_CONFIRMATION_WORD,
  PORTFOLIO_CONSENT_VERSION,
  hasCurrentPortfolioConsent,
  isDeleteConfirmationValid,
  isPortfolioConsentChecked,
  validatePortfolioAlertSettings,
} from "@/lib/portfolio-consent";
import type { FormState } from "@/lib/form-state";

/**
 * Server actions de privacidad de Mi portafolio (F75). Todo detrás de
 * `MY_PORTFOLIO_ENABLED`; usan el cliente de sesión, así que la RLS
 * (`auth.uid() = user_id`) sigue siendo la última defensa.
 */

const DISABLED: FormState = {
  error: "Mi portafolio no está disponible todavía.",
};

/** Guarda el consentimiento explícito (`consent_at = now()` + versión). */
export async function grantPortfolioConsent(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  void _prev;
  if (!isMyPortfolioEnabled()) return DISABLED;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  if (!isPortfolioConsentChecked(formData.get("consent"))) {
    return { error: "Marca la casilla para otorgar tu consentimiento." };
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("user_portfolio_settings").upsert(
    {
      user_id: user.id,
      consent_at: now,
      consent_version: PORTFOLIO_CONSENT_VERSION,
      updated_at: now,
    },
    { onConflict: "user_id" },
  );
  if (error) {
    console.warn("[reclu] portfolio consent:", error.message);
    return { error: "No pudimos guardar tu consentimiento. Inténtalo de nuevo." };
  }

  revalidatePath("/settings");
  revalidatePath("/mi-portafolio");
  return { success: "Consentimiento guardado." };
}

/**
 * Retira el consentimiento. Como sin consentimiento no se puede tratar la
 * cartera, llama a `delete_my_portfolio()` (borra tenencias y ajustes) y deja
 * `consent_at` y `consent_version` en null. El borrado es irreversible.
 */
export async function withdrawPortfolioConsent(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  void _prev;
  void formData;
  if (!isMyPortfolioEnabled()) return DISABLED;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  const { data, error } = await supabase.rpc("delete_my_portfolio");
  if (error) {
    console.warn("[reclu] portfolio consent withdraw:", error.message);
    return { error: "No pudimos retirar tu consentimiento ni borrar tu cartera. Inténtalo de nuevo." };
  }

  // La RPC borra también la fila de ajustes. Se recrea sin consentimiento para
  // que el estado quede explícito y las alertas automáticas sigan apagadas.
  const { error: settingsError } = await supabase
    .from("user_portfolio_settings")
    .upsert(
      {
        user_id: user.id,
        consent_at: null,
        consent_version: null,
        auto_alerts: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  if (settingsError) {
    console.warn("[reclu] portfolio consent reset:", settingsError.message);
  }

  revalidatePath("/settings");
  revalidatePath("/compare");
  revalidatePath("/mi-portafolio");
  const removed = typeof data === "number" && data > 0 ? data : 0;
  return {
    success:
      removed > 0
        ? `Consentimiento retirado. Borramos tu cartera (${removed} registros) y apagamos las alertas automáticas.`
        : "Consentimiento retirado. No había datos de cartera que borrar.",
  };
}

/**
 * "Borrar mi cartera": exige escribir BORRAR y llama a la RPC
 * `delete_my_portfolio()` (security invoker, migración 050).
 */
export async function deleteMyPortfolio(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  void _prev;
  if (!isMyPortfolioEnabled()) return DISABLED;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  if (!isDeleteConfirmationValid(formData.get("confirm"))) {
    return {
      error: `Escribe "${DELETE_CONFIRMATION_WORD}" (en mayúsculas) para confirmar el borrado.`,
    };
  }

  const { data, error } = await supabase.rpc("delete_my_portfolio");
  if (error) {
    console.warn("[reclu] delete_my_portfolio:", error.message);
    return { error: "No pudimos borrar tu cartera. Inténtalo de nuevo." };
  }

  revalidatePath("/settings");
  revalidatePath("/compare");
  revalidatePath("/mi-portafolio");
  const removed = typeof data === "number" && data > 0 ? data : 0;
  return {
    success:
      removed > 0
        ? `Cartera borrada (${removed} registros).`
        : "No había datos de cartera que borrar.",
  };
}

/**
 * Guarda las preferencias de alertas automáticas. Respeta el plan
 * (`autoAlerts` de plans.ts), los canales disponibles y exige consentimiento
 * para encenderlas.
 */
export async function updatePortfolioAlerts(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  void _prev;
  if (!isMyPortfolioEnabled()) return DISABLED;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  const [profileResult, settingsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("plan, trial_ends_at")
      .eq("id", user.id)
      .single(),
    supabase
      .from("user_portfolio_settings")
      .select("consent_at, consent_version")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const profile = profileResult.data as
    | { plan?: string | null; trial_ends_at?: string | null }
    | null;
  const settings = settingsResult.data as
    | { consent_at?: string | null; consent_version?: string | null }
    | null;
  const hasConsent = hasCurrentPortfolioConsent(
    settings?.consent_at,
    settings?.consent_version,
  );

  const parsed = validatePortfolioAlertSettings(
    {
      autoAlerts: isPortfolioConsentChecked(formData.get("auto_alerts")),
      minRelevance: formData.get("min_relevance"),
      alertChannel: formData.get("alert_channel"),
    },
    {
      plan: profile?.plan ?? "free",
      trialEndsAt: profile?.trial_ends_at ?? null,
      hasConsent,
    },
  );
  if (!parsed.ok) return { error: parsed.error };

  const { error } = await supabase.from("user_portfolio_settings").upsert(
    {
      user_id: user.id,
      auto_alerts: parsed.values.autoAlerts,
      min_relevance: parsed.values.minRelevance,
      alert_channel: parsed.values.alertChannel,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) {
    console.warn("[reclu] portfolio alerts:", error.message);
    return { error: "No pudimos guardar tus preferencias. Inténtalo de nuevo." };
  }

  revalidatePath("/settings");
  return { success: "Preferencias de alertas guardadas." };
}
