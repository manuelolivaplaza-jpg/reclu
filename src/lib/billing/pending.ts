/**
 * Registro de intentos de checkout (server-side).
 *
 * El checkout crea la fila en `subscriptions` con estado `pending` ANTES de
 * redirigir al usuario al proveedor. Así el webhook de alta/renovación
 * siempre encuentra la suscripción local (user_id, plan, period) aunque el
 * proveedor notifique solo con su id.
 *
 * Para Flow (enrolamiento de tarjeta): si ya existe una suscripción pendiente
 * del mismo plan/periodo, se reutiliza (evita filas duplicadas por intento).
 */

import { getBillingServiceClient } from "./supabase-admin";
import type { ProviderId } from "./types";

export interface PendingCheckout {
  userId: string;
  plan: "pro" | "elite";
  period: "mensual" | "anual";
  provider: ProviderId;
  providerSubscriptionId: string | null;
  providerCustomerId: string | null;
}

export async function recordPendingCheckout(pending: PendingCheckout): Promise<void> {
  const supabase = getBillingServiceClient();

  // Mock ya insertó su propia fila al crear el checkout; no duplicar.
  if (pending.provider === "mock") return;

  // Solo reutilizamos intentos PENDIENTES; si el usuario ya tiene una
  // suscripción activa (p.ej. sube de Pro a Elite) se crea una fila nueva
  // para no sobrescribir el estado de la vigente antes de que pague.
  const { data: existing, error: findError } = await supabase
    .from("subscriptions")
    .select("id, provider_subscription_id")
    .eq("user_id", pending.userId)
    .eq("provider", pending.provider)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findError) throw new Error(`pending checkout lookup: ${findError.message}`);

  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + (pending.period === "anual" ? 12 : 1));

  if (existing) {
    // Ya hay un intento vivo: actualizar en vez de duplicar.
    const { error } = await supabase
      .from("subscriptions")
      .update({
        plan: pending.plan,
        period: pending.period,
        provider_subscription_id: pending.providerSubscriptionId ?? undefined,
        provider_customer_id: pending.providerCustomerId ?? undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) throw new Error(`pending checkout update: ${error.message}`);
    return;
    // Nota: si el usuario cambia de plan a mitad de un intento vivo, la fila
    // refleja el ÚLTIMO intento; el webhook valida contra el proveedor.
  }

  const { error } = await supabase.from("subscriptions").insert({
    user_id: pending.userId,
    provider: pending.provider,
    provider_customer_id: pending.providerCustomerId,
    provider_subscription_id: pending.providerSubscriptionId,
    plan: pending.plan,
    period: pending.period,
    status: "pending",
    current_period_end: periodEnd.toISOString(),
    cancel_at_period_end: false,
  });
  if (error) throw new Error(`pending checkout insert: ${error.message}`);
}
