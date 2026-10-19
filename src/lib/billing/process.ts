/**
 * Procesamiento de notificaciones de pago (server-side).
 *
 * Pipeline: verificar (proveedor) → registrar evento (idempotencia) →
 * sincronizar suscripción → actualizar profiles.plan (service role) →
 * aplicar recompensa de referido si corresponde.
 *
 * El plan SOLO se cambia aquí, con service role, tras verificar el pago
 * con el proveedor. El cuerpo del webhook jamás se toma como verdad.
 */

import { getBillingServiceClient } from "./supabase-admin";
import type {
  PaymentProvider,
  SubscriptionState,
  WebhookInput,
} from "./types";
import type { SubscriptionCompleter } from "./completer";
export interface ProcessResult {
  /** El evento ya se había procesado (idempotencia). */
  duplicate?: boolean;
  /** ¿Se actualizó profiles.plan? */
  planUpdated: boolean;
  /** Estado final de la suscripción tras procesar. */
  status: string;
  userId?: string;
  plan?: string;
}

/** Inserta el evento; devuelve false si ya existía (idempotencia). */
async function recordEvent(
  provider: string,
  eventId: string | null,
  payload: unknown,
): Promise<boolean> {
  if (!eventId) return false;
  const supabase = getBillingServiceClient();
  const { error } = await supabase.from("payment_events").insert({
    provider,
    event_id: eventId,
    payload,
  });
  if (error) {
    if (error.code === "23505") return false; // unique violation → duplicado
    throw new Error(`payment_events insert: ${error.message}`);
  }
  return true;
}

/** Busca la suscripción local a partir del id del proveedor. */
async function findSubscription(providerSubscriptionId: string) {
  const supabase = getBillingServiceClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id, user_id, plan, period, status, current_period_end, cancel_at_period_end")
    .eq("provider_subscription_id", providerSubscriptionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`subscriptions lookup: ${error.message}`);
  return data ?? null;
}

/** Aplica la recompensa del referido cuando el referido paga por primera vez. */
async function applyReferralReward(userId: string): Promise<void> {
  const supabase = getBillingServiceClient();
  const { data: referral, error } = await supabase
    .from("referrals")
    .select("id, referrer_id, status")
    .eq("referred_id", userId)
    .eq("status", "pending")
    .maybeSingle();
  if (error || !referral) return;

  const now = new Date();
  const rewardEnd = new Date(now);
  rewardEnd.setMonth(rewardEnd.getMonth() + 1);

  const { error: updateError } = await supabase
    .from("referrals")
    .update({
      status: "rewarded",
      rewarded_at: now.toISOString(),
      reward_applied: "free_month",
      reward_period_end: rewardEnd.toISOString(),
    })
    .eq("id", referral.id);
  if (updateError) {
    console.error("[billing] referral update:", updateError.message);
  }
}

/** Fila de suscripción actualizada a partir del estado verificado. */
async function syncSubscription(
  providerSubscriptionId: string,
  userId: string,
  state: SubscriptionState,
  fallbackPlan: "pro" | "elite",
  fallbackPeriod: "mensual" | "anual",
): Promise<void> {
  const supabase = getBillingServiceClient();
  const periodEnd = state.currentPeriodEnd?.toISOString() ?? null;

  const { error } = await supabase
    .from("subscriptions")
    .update({
      status: state.status,
      plan: state.plan ?? fallbackPlan,
      period: state.period ?? fallbackPeriod,
      current_period_end: periodEnd,
      cancel_at_period_end: state.cancelAtPeriodEnd,
      updated_at: new Date().toISOString(),
    })
    .eq("provider_subscription_id", providerSubscriptionId);
  if (error) throw new Error(`subscriptions sync: ${error.message}`);
}

/** Estado que debe tener el plan del usuario según la suscripción. */
function planForState(
  state: SubscriptionState,
  fallbackPlan: "pro" | "elite",
): { plan: "free" | "pro" | "elite"; reason: string } {
  const now = Date.now();
  const periodEnd = state.currentPeriodEnd?.getTime() ?? null;

  // Activa (o cancelada pero dentro del período ya pagado) → plan de pago.
  if (state.status === "active" || state.status === "past_due") {
    if (periodEnd && periodEnd < now && !state.cancelAtPeriodEnd) {
      return { plan: "free", reason: "periodo vencido" };
    }
    if (state.status === "past_due") {
      // Moroso: mantenemos el plan (dunning), pero podría cortarse tras N días.
      return { plan: fallbackPlan, reason: "pago vencido (dunning)" };
    }
    return { plan: fallbackPlan, reason: "suscripción activa" };
  }
  if (state.status === "canceled" || state.status === "expired") {
    // Cancelada: si aún estamos dentro del período pagado, conserva el plan.
    if (periodEnd && periodEnd > now) {
      return { plan: fallbackPlan, reason: "cancelada, período vigente" };
    }
    return { plan: "free", reason: "suscripción cancelada/expirada" };
  }
  // pending: no cambia el plan.
  return { plan: "free", reason: "pendiente" };
}

/**
 * Procesa una notificación verificada del proveedor y actualiza la base.
 * Idempotente por event_id; el plan solo se toca con service role.
 */
export async function processPaymentNotification(
  provider: PaymentProvider,
  input: WebhookInput,
): Promise<ProcessResult> {
  const verification = await provider.verifyNotification(input);
  if (!verification.ok || !verification.state) {
    return { planUpdated: false, status: "rejected" };
  }

  const firstTime = await recordEvent(
    provider.id,
    verification.eventId,
    { raw: input.rawBody, query: input.query.toString() },
  );
  if (!firstTime) {
    return { duplicate: true, planUpdated: false, status: "duplicate", userId: undefined };
  }

  const { providerSubscriptionId, eventType, providerCustomerId } = verification;
  if (!providerSubscriptionId) {
    // Evento de enrolamiento (tarjeta registrada): si el proveedor puede
    // crear la suscripción ahora (Flow), la creamos con el plan pendiente
    // del checkout guardado en la base y seguimos el flujo normal.
    const completer = provider as SubscriptionCompleter;
    if (
      eventType === "customer.card_registered" &&
      typeof completer.completeSubscriptionAfterEnrollment === "function" &&
      providerCustomerId
    ) {
      const supabase = getBillingServiceClient();
      const { data: pendingSub } = await supabase
        .from("subscriptions")
        .select("plan, period")
        .eq("provider_customer_id", providerCustomerId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pendingSub) {
        const createdId = await completer.completeSubscriptionAfterEnrollment(
          providerCustomerId,
          pendingSub.plan === "elite" ? "elite" : "pro",
          pendingSub.period === "anual" ? "anual" : "mensual",
        );
        if (createdId) {
          const state = await provider.getSubscriptionState(createdId);
          if (state) {
            return applySubscriptionState(provider, createdId, state);
          }
        }
      }
    }
    // Sin más contexto: solo registrar el evento.
    return { planUpdated: false, status: `registered:${eventType ?? "event"}` };
  }

  // Camino normal: hay id de suscripción del proveedor y estado verificado.
  return applySubscriptionState(provider, providerSubscriptionId, verification.state);
}

/** Sincroniza la suscripción local y actualiza el plan según el estado. */
async function applySubscriptionState(
  provider: PaymentProvider,
  providerSubscriptionId: string,
  state: SubscriptionState,
): Promise<ProcessResult> {
  void provider; // el estado ya viene verificado por el proveedor
  const sub = await findSubscription(providerSubscriptionId);
  if (!sub) {
    // Suscripción creada directamente en el portal del proveedor; sin
    // registro local no sabemos a qué usuario pertenece → solo registrar.
    console.warn(`[billing] notificación sin suscripción local (${providerSubscriptionId})`);
    return { planUpdated: false, status: "no_local_subscription" };
  }

  const fallbackPlan = (sub.plan as "pro" | "elite") ?? "pro";
  const fallbackPeriod = (sub.period as "mensual" | "anual") ?? "mensual";

  await syncSubscription(
    providerSubscriptionId,
    sub.user_id,
    state,
    fallbackPlan,
    fallbackPeriod,
  );

  const { plan, reason } = planForState(state, fallbackPlan);
  const supabase = getBillingServiceClient();

  let planUpdated = false;
  if (plan !== "free") {
    const { error } = await supabase
      .from("profiles")
      .update({ plan, updated_at: new Date().toISOString() })
      .eq("id", sub.user_id);
    if (error) throw new Error(`profiles.plan update: ${error.message}`);
    planUpdated = true;

    // Recompensa de referido: 1 mes gratis al patrocinador cuando el
    // referido paga por primera vez.
    if (state.status === "active") {
      await applyReferralReward(sub.user_id);
    }
  } else if (reason === "suscripción cancelada/expirada") {
    // Vuelve a free solo cuando termina el período ya pagado.
    const { error } = await supabase
      .from("profiles")
      .update({ plan: "free", updated_at: new Date().toISOString() })
      .eq("id", sub.user_id);
    if (error) throw new Error(`profiles.plan downgrade: ${error.message}`);
    planUpdated = true;
  }

  return { planUpdated, status: `${state.status} (${reason})`, userId: sub.user_id, plan };
}
