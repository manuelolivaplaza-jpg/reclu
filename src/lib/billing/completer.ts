/**
 * Hook opcional de proveedores para completar el alta tras el enrolamiento
 * (p.ej. Flow: tras registrar la tarjeta se crea la suscripción al plan
 * pendiente del checkout).
 */

import { referralsEnabled } from "@/lib/referrals";
import { getBillingServiceClient } from "./supabase-admin";

export interface SubscriptionCompleter {
  /**
   * Crea la suscripción al plan pendiente y devuelve su id en el proveedor,
   * o null si no se pudo crear (proveedor sin soporte, plan sin id, error).
   */
  completeSubscriptionAfterEnrollment?(
    providerCustomerId: string,
    plan: "pro" | "elite",
    period: "mensual" | "anual",
  ): Promise<string | null>;
}

/**
 * Premia al patrocinador cuando el invitado paga por primera vez.
 *
 * Lee la fila `referrals` en estado `pending` del invitado y, si existe,
 * llama la RPC `reward_referral` con service role (la base valida de nuevo
 * autorreferidos e idempotencia). Es best-effort: con `REFERRALS_ENABLED`
 * apagado no hace nada y cualquier fallo se loguea sin afectar el pago.
 */
export async function rewardReferralOnFirstPayment(referredId: string): Promise<void> {
  if (!referralsEnabled() || !referredId) return;

  try {
    const supabase = getBillingServiceClient();
    const { data: referral, error } = await supabase
      .from("referrals")
      .select("id, referrer_id")
      .eq("referred_id", referredId)
      .eq("status", "pending")
      .maybeSingle();

    if (error) {
      console.error("[billing] referrals lookup:", error.message);
      return;
    }
    if (!referral || referral.referrer_id === referredId) return;

    const { error: rpcError } = await supabase.rpc("reward_referral", {
      p_referred: referredId,
    });
    if (rpcError) {
      console.error("[billing] reward_referral:", rpcError.message);
    }
  } catch (err) {
    console.error(
      "[billing] reward_referral:",
      err instanceof Error ? err.message : "error desconocido",
    );
  }
}
