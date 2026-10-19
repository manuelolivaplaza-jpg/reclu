/**
 * Proveedor de pago de PRUEBA (mock) — funciona sin ninguna clave.
 *
 * Objetivo: que el flujo completo (checkout → pago → webhook → plan
 * actualizado) se pueda probar en local y en CI sin cuentas externas.
 *
 * Cómo funciona:
 *  1. createCheckout: genera un id de suscripción determinista a partir del
 *     userId + plan + period, guarda la fila en `subscriptions` con estado
 *     `pending` y devuelve una URL interna de checkout simulado
 *     (/upgrade/exito?mock_payment=<id>).
 *  2. La página de éxito llama a /api/billing/webhook/mock con
 *     {mockPaymentId}, que resuelve el userId desde la fila en la base y
 *     marca active — igual que haría el webhook real con el proveedor.
 *  3. El webhook nunca "confía" en el cuerpo: para mock, el registro en
 *     `subscriptions` (escrito por el servidor en el paso 1) ES la fuente
 *     de verdad — el body solo trae el id, el estado se lee de la base.
 *
 * TODO(integración): este proveedor es solo para desarrollo; en producción
 * PAYMENT_PROVIDER debe ser flow o mercadopago.
 */

import { randomBytes } from "node:crypto";
import type {
  CheckoutRequest,
  CheckoutResult,
  PaymentProvider,
  ProviderId,
  SubscriptionState,
  WebhookInput,
  WebhookVerification,
} from "./types";
import { getBillingServiceClient } from "./supabase-admin";

function addPeriod(date: Date, period: "mensual" | "anual"): Date {
  const d = new Date(date);
  if (period === "anual") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

/** Registra la suscripción pendiente en la base (service role). */
async function insertPendingSubscription(
  req: CheckoutRequest,
): Promise<{ mockPaymentId: string; periodEnd: Date }> {
  const supabase = getBillingServiceClient();
  const mockPaymentId = `mock_${randomBytes(12).toString("hex")}`;
  const periodEnd = addPeriod(new Date(), req.period);

  const { error } = await supabase.from("subscriptions").insert({
    user_id: req.userId,
    providerCustomerEmail: req.email,
    provider: "mock",
    provider_customer_id: null,
    provider_subscription_id: mockPaymentId,
    plan: req.plan,
    period: req.period,
    status: "pending",
    current_period_end: periodEnd.toISOString(),
    cancel_at_period_end: false,
  });
  if (error) throw new Error(`mock: no se pudo registrar la suscripción: ${error.message}`);

  return { mockPaymentId, periodEnd };
}

export function createMockProvider(): PaymentProvider {
  return {
    id: "mock" as ProviderId,
    label: "Prueba (sin cobro real)",

    async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
      const { mockPaymentId } = await insertPendingSubscription(req);
      // Checkout simulado: la propia página de éxito dispara el "webhook".
      const url = new URL(`${req.successUrl}`);
      url.searchParams.set("mock_payment", mockPaymentId);
      return {
        url: url.toString(),
        providerSubscriptionId: mockPaymentId,
        providerCustomerId: null,
      };
    },

    async verifyNotification(input: WebhookInput): Promise<WebhookVerification> {
      let mockPaymentId = "";
      try {
        const body = JSON.parse(input.rawBody) as { mockPaymentId?: string };
        mockPaymentId = String(body.mockPaymentId ?? "");
      } catch {
        mockPaymentId = input.query.get("mock_payment") ?? input.query.get("mockPaymentId") ?? "";
      }
      if (!mockPaymentId) {
        return { ok: false, providerSubscriptionId: null, state: null, eventId: null, eventType: null };
      }

      // Fuente de verdad: la fila que el SERVIDOR escribió en el checkout.
      // El body solo trae el id; el plan/periodo se leen de la base.
      const supabase = getBillingServiceClient();
      const { data: sub, error } = await supabase
        .from("subscriptions")
        .select("user_id, plan, period, status, current_period_end, cancel_at_period_end")
        .eq("provider", "mock")
        .eq("provider_subscription_id", mockPaymentId)
        .maybeSingle();
      if (error || !sub) {
        return { ok: false, providerSubscriptionId: null, state: null, eventId: null, eventType: null };
      }

      // En modo mock, recibir esta notificación ES el pago simulado: una
      // suscripción pending pasa a active; una ya resuelta se reporta tal
      // cual (cancelada sigue cancelada — la idempotencia por event_id
      // impide reactivar con replays).
      const status: SubscriptionState["status"] =
        sub.status === "pending" ? "active" : (sub.status as SubscriptionState["status"]);

      return {
        ok: true,
        providerSubscriptionId: mockPaymentId,
        state: {
          status,
          plan: sub.plan as "pro" | "elite",
          period: sub.period as "mensual" | "anual",
          currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end) : null,
          cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
        },
        eventId: `mock:${mockPaymentId}:${status}`,
        eventType: "mock.payment",
      };
    },

    async getSubscriptionState(providerSubscriptionId: string): Promise<SubscriptionState | null> {
      const supabase = getBillingServiceClient();
      const { data: sub, error } = providerSubscriptionId.startsWith("mock_")
        ? await supabase
            .from("subscriptions")
            .select("plan, period, status, current_period_end, cancel_at_period_end")
            .eq("provider", "mock")
            .eq("provider_subscription_id", providerSubscriptionId)
            .maybeSingle()
        : { data: null, error: new Error("id inválido") };
      if (error || !sub) return null;
      return {
        status: sub.status as SubscriptionState["status"],
        plan: sub.plan as "pro" | "elite",
        period: sub.period as "mensual" | "anual",
        currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end) : null,
        cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
      };
    },

    // Nota: la interfaz exige un id, pero en mock la cancelación es
    // inmediata y no lo necesitamos (implementación con menos params es
    // asignable al tipo de la interfaz).
    async cancelSubscription() {
      return { ok: true, cancelAtPeriodEnd: false };
    },
  };
}
