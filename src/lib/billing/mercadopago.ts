/**
 * Adaptador Mercado Pago Suscripciones (Chile) — preapproval sin plan.
 *
 * Por qué preapproval "pending" y no Checkout Pro: los planes de Fraccion
 * son recurrentes (mensual/anual), así que el cobro debe repetirse solo.
 *
 * Flujo (docs: mercadopago.cl/developers → Suscripciones):
 *  1. POST /preapproval {reason, external_reference, payer_email, back_url,
 *     auto_recurring, status: "pending"} → {id, init_point}. Redirigimos a
 *     init_point; el usuario paga en Mercado Pago (tarjeta o saldo).
 *     external_reference = "<userId>|<plan>|<period>" para saber el plan.
 *  2. Mercado Pago vuelve a back_url (/api/billing/return/mercadopago?
 *     preapproval_id=...) y desde ahí mandamos a éxito, pendiente o error
 *     según el estado consultado al API.
 *  3. Webhook firmado: header x-signature "ts=...,v1=..." con HMAC-SHA256
 *     sobre `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` y la clave
 *     secreta de webhooks. El cuerpo solo avisa; el estado real SIEMPRE se
 *     consulta con GET /preapproval/{id} (o /authorized_payments/{id}).
 *  4. Cancelar: PUT /preapproval/{id} {status: "cancelled"}.
 *
 * Variables (solo se referencian, nunca se escriben en el código):
 *   MERCADOPAGO_ACCESS_TOKEN, MERCADOPAGO_PUBLIC_KEY,
 *   MERCADOPAGO_WEBHOOK_SECRET. Los nombres antiguos MP_ACCESS_TOKEN y
 *   MP_WEBHOOK_SECRET siguen aceptándose como respaldo.
 */

import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import type {
  BillingPeriod,
  CheckoutRequest,
  CheckoutResult,
  PaidPlan,
  PaymentProvider,
  ProviderId,
  SubscriptionState,
  SubscriptionStatus,
  WebhookInput,
  WebhookVerification,
} from "./types";
import { PLAN_PRICES_CLP } from "./prices";
import { BRAND_NAME } from "@/lib/brand";

const MP_API = "https://api.mercadopago.com";

/** Access token del servidor (nuevo nombre primero, luego el antiguo). */
export function mercadoPagoAccessToken(): string {
  return (process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN || "").trim();
}

/** Clave secreta para validar x-signature de los webhooks. */
export function mercadoPagoWebhookSecret(): string {
  return (process.env.MERCADOPAGO_WEBHOOK_SECRET || process.env.MP_WEBHOOK_SECRET || "").trim();
}

/** Clave pública (solo para el navegador, si algún día se usa Bricks). */
export function mercadoPagoPublicKey(): string {
  return (process.env.MERCADOPAGO_PUBLIC_KEY || "").trim();
}

const REJECTED: WebhookVerification = {
  ok: false,
  providerSubscriptionId: null,
  state: null,
  eventId: null,
  eventType: null,
};

/** Valida la firma del webhook de Mercado Pago. Exportada para tests. */
export function verifyMercadoPagoSignature(
  secret: string,
  xSignature: string,
  xRequestId: string | null,
  dataId: string | null,
): boolean {
  if (!secret) return false;
  // Formato: "ts=1704908010,v1=618c...". Pares separados por coma.
  const parts = Object.fromEntries(
    xSignature
      .split(",")
      .map((pair) => pair.trim().split("=") as [string, string])
      .filter(([k, v]) => k && v),
  );
  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;

  // Manifest: pares "id:...;request-id:...;ts:...;" omitiendo los ausentes.
  // MP pide data.id en minúsculas si es alfanumérico.
  const manifest =
    [
      ...(dataId ? [`id:${dataId.toLowerCase()}`] : []),
      ...(xRequestId ? [`request-id:${xRequestId}`] : []),
      `ts:${ts}`,
    ].join(";") + ";";

  const calculated = createHmac("sha256", secret).update(manifest).digest("hex");

  const a = Buffer.from(calculated, "utf8");
  const b = Buffer.from(v1, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function mapMercadoPagoStatus(status: string): SubscriptionStatus {
  switch (status) {
    case "authorized":
    case "active":
      return "active";
    case "paused":
      return "past_due";
    case "cancelled":
      return "canceled";
    case "ended":
      return "expired";
    default:
      return "pending";
  }
}

/** external_reference = "<userId>|<plan>|<period>". */
export function buildExternalReference(userId: string, plan: PaidPlan, period: BillingPeriod): string {
  return `${userId}|${plan}|${period}`;
}

export function parseExternalReference(
  ref: string,
): { userId: string; plan: PaidPlan | null; period: BillingPeriod | null } {
  const [userId = "", plan = "", period = ""] = ref.split("|");
  return {
    userId,
    plan: plan === "pro" || plan === "elite" ? plan : null,
    period: period === "mensual" || period === "anual" ? period : null,
  };
}

/** Estado canónico a partir de un preapproval. Exportada para tests. */
export function stateFromPreapproval(pre: Record<string, unknown>): SubscriptionState {
  const recurring = (pre.auto_recurring ?? {}) as Record<string, unknown>;
  const ref = parseExternalReference(String(pre.external_reference ?? ""));
  const rawStatus = String(pre.status ?? "");
  const frequency = Number(recurring.frequency ?? 0);
  const period: BillingPeriod | null =
    ref.period ?? (frequency === 12 ? "anual" : frequency === 1 ? "mensual" : null);
  // Fin del periodo pagado: el próximo cobro programado. Si está cancelada,
  // el acceso dura hasta esa fecha (ya pagada).
  const next = pre.next_payment_date ? new Date(String(pre.next_payment_date)) : null;
  return {
    status: mapMercadoPagoStatus(rawStatus),
    plan: ref.plan,
    period,
    currentPeriodEnd: next && !Number.isNaN(next.getTime()) ? next : null,
    cancelAtPeriodEnd: rawStatus === "cancelled",
  };
}

async function mpFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = mercadoPagoAccessToken();
  return fetch(`${MP_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
}

async function fetchPreapproval(id: string): Promise<Record<string, unknown> | null> {
  const res = await mpFetch(`/preapproval/${encodeURIComponent(id)}`);
  if (!res.ok) {
    console.error(`[billing/mp] preapproval HTTP ${res.status}`);
    return null;
  }
  return (await res.json()) as Record<string, unknown>;
}

/** Cobro recurrente → id del preapproval al que pertenece. */
async function preapprovalIdFromAuthorizedPayment(id: string): Promise<string | null> {
  const res = await mpFetch(`/authorized_payments/${encodeURIComponent(id)}`);
  if (!res.ok) {
    console.error(`[billing/mp] authorized_payments HTTP ${res.status}`);
    return null;
  }
  const data = (await res.json()) as Record<string, unknown>;
  const pre = String(data.preapproval_id ?? "");
  return pre || null;
}

export function createMercadoPagoProvider(): PaymentProvider {
  return {
    id: "mercadopago" as ProviderId,
    label: "Mercado Pago",

    async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
      if (!mercadoPagoAccessToken()) {
        throw new Error("Mercado Pago no configurado: falta MERCADOPAGO_ACCESS_TOKEN.");
      }
      const amount =
        req.period === "anual"
          ? PLAN_PRICES_CLP[req.plan].annualTotal
          : PLAN_PRICES_CLP[req.plan].monthly;

      // Mercado Pago vuelve aquí; la ruta decide éxito/pendiente/error.
      const origin = new URL(req.successUrl).origin;
      const backUrl = `${origin}/api/billing/return/mercadopago`;

      // Idempotencia del alta: mismo usuario+plan+periodo en la misma hora
      // no crea dos preapprovals si el usuario hace doble clic.
      const hour = new Date().toISOString().slice(0, 13);
      const idempotencyKey = createHash("sha256")
        .update(`${req.userId}|${req.plan}|${req.period}|${hour}`)
        .digest("hex");

      const res = await mpFetch("/preapproval", {
        method: "POST",
        headers: { "X-Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          reason: `${BRAND_NAME} ${req.plan === "elite" ? "Plan Elite" : "Plan Pro"}${req.period === "anual" ? " (anual)" : ""}`,
          external_reference: buildExternalReference(req.userId, req.plan, req.period),
          payer_email: req.email,
          back_url: backUrl,
          status: "pending",
          auto_recurring: {
            frequency: req.period === "anual" ? 12 : 1,
            frequency_type: "months",
            transaction_amount: amount,
            currency_id: "CLP",
          },
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Mercado Pago /preapproval HTTP ${res.status}: ${text.slice(0, 300)}`);
      }
      const data = (await res.json()) as Record<string, unknown>;
      const url = String(data.init_point ?? "");
      if (!url) throw new Error("Mercado Pago: respuesta sin init_point.");
      return {
        url,
        providerSubscriptionId: String(data.id ?? "") || null,
        providerCustomerId: data.payer_id ? String(data.payer_id) : null,
      };
    },

    async verifyNotification(input: WebhookInput): Promise<WebhookVerification> {
      const secret = mercadoPagoWebhookSecret();
      if (!secret || !mercadoPagoAccessToken()) return REJECTED;

      const xSignature = input.headers["x-signature"] ?? "";
      const xRequestId = input.headers["x-request-id"] ?? null;
      const dataId = (input.query.get("data.id") ?? input.query.get("data_id") ?? "").trim();
      if (!dataId) return REJECTED;

      if (!verifyMercadoPagoSignature(secret, xSignature, xRequestId, dataId)) {
        return REJECTED;
      }

      // La firma cubre el data.id del query, no el cuerpo. Si el body trae
      // otro id, se rechaza (no se puede redirigir la consulta).
      let type = input.query.get("type") ?? "";
      try {
        const body = JSON.parse(input.rawBody) as Record<string, unknown>;
        type = String(body.type ?? type);
        const data = (body.data ?? {}) as Record<string, unknown>;
        const bodyId = String(data.id ?? "");
        if (bodyId && bodyId.toLowerCase() !== dataId.toLowerCase()) return REJECTED;
      } catch {
        // cuerpo vacío o no-JSON: seguimos con el query firmado
      }

      let preapprovalId: string | null = null;
      if (type === "subscription_preapproval" || type === "preapproval" || type === "") {
        preapprovalId = dataId;
      } else if (type === "subscription_authorized_payment") {
        preapprovalId = await preapprovalIdFromAuthorizedPayment(dataId);
      } else {
        // payment, plan, etc.: no cambian la suscripción. Se ignoran (200).
        return REJECTED;
      }
      if (!preapprovalId) return REJECTED;

      const pre = await fetchPreapproval(preapprovalId);
      if (!pre) return REJECTED;
      const state = stateFromPreapproval(pre);
      // Idempotencia: el mismo estado + mismo próximo cobro = mismo evento.
      const eventId = [
        "mercadopago",
        preapprovalId,
        String(pre.status ?? ""),
        String(pre.next_payment_date ?? ""),
        type === "subscription_authorized_payment" ? `pay:${dataId}` : "",
      ].join(":");
      return {
        ok: true,
        providerSubscriptionId: preapprovalId,
        state,
        eventId,
        eventType: type || "subscription_preapproval",
      };
    },

    async getSubscriptionState(providerSubscriptionId: string): Promise<SubscriptionState | null> {
      if (!mercadoPagoAccessToken()) return null;
      const pre = await fetchPreapproval(providerSubscriptionId);
      return pre ? stateFromPreapproval(pre) : null;
    },

    async cancelSubscription(providerSubscriptionId: string) {
      if (!mercadoPagoAccessToken()) throw new Error("Mercado Pago no configurado.");
      const res = await mpFetch(`/preapproval/${encodeURIComponent(providerSubscriptionId)}`, {
        method: "PUT",
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Mercado Pago cancel HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      // MP corta los cobros futuros; el acceso dura hasta el fin del periodo
      // ya pagado (next_payment_date), que processPaymentNotification respeta.
      return { ok: true, cancelAtPeriodEnd: true };
    },
  };
}
