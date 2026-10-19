/**
 * Adaptador Mercado Pago Suscripciones (Chile).
 *
 * Flujo (docs: mercadopago.cl/developers → Subscriptions):
 *  1. POST /preapproval {reason, external_reference, back_url, auto_recurring,
 *     payer_email, status: "authorized"} con Bearer MP_ACCESS_TOKEN.
 *     Respuesta: {id, init_point, ...} → redirigir al usuario a init_point.
 *  2. Webhook: header x-signature "ts=...,v1=..." validado con
 *     MP_WEBHOOK_SECRET (HMAC-SHA256 sobre
 *     `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`).
 *  3. El cuerpo solo avisa; el estado real SIEMPRE se consulta con
 *     GET /preapproval/{id} (nunca confiar en el body).
 *  4. Cancelar: PUT /preapproval/{id} {status: "cancelled"}.
 *
 * Nota MP: usa "cancelled" con doble L, y los montos como string.
 *
 * Env vars: MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET,
 * MP_PREAPPROVAL_PLAN_PRO_MENSUAL, MP_PREAPPROVAL_PLAN_PRO_ANUAL,
 * MP_PREAPPROVAL_PLAN_ELITE_MENSUAL, MP_PREAPPROVAL_PLAN_ELITE_ANUAL
 * (ids de planes creados con POST /preapproval_plan).
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  CheckoutRequest,
  CheckoutResult,
  PaymentProvider,
  ProviderId,
  SubscriptionState,
  SubscriptionStatus,
  WebhookInput,
  WebhookVerification,
} from "./types";
import { PLAN_PRICES_CLP } from "./prices";

const MP_API = "https://api.mercadopago.com";

/** Valida la firma del webhook de Mercado Pago. Exportada para tests. */
export function verifyMercadoPagoSignature(
  secret: string,
  xSignature: string,
  xRequestId: string | null,
  dataId: string | null,
): boolean {
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
  const manifest = [
    ...(dataId ? [`id:${dataId}`] : []),
    ...(xRequestId ? [`request-id:${xRequestId}`] : []),
    `ts:${ts}`,
  ].join(";") + ";";

  const calculated = createHmac("sha256", secret).update(manifest).digest("hex");

  const a = Buffer.from(calculated, "utf8");
  const b = Buffer.from(v1, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function mapStatus(status: string): SubscriptionStatus {
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

function getStateFromPreapproval(pre: Record<string, unknown>): SubscriptionState {
  const recurring = (pre.auto_recurring ?? {}) as Record<string, unknown>;
  const planRef = String(pre.preapproval_plan_id ?? "");
  // El id del plan es el que creamos con /preapproval_plan (env vars);
  // comparamos contra los configurados para saber a qué plan corresponde.
  const envPro = process.env.MP_PREAPPROVAL_PLAN_PRO_MENSUAL ?? "";
  const envProAnual = process.env.MP_PREAPPROVAL_PLAN_PRO_ANUAL ?? "";
  const envElite = process.env.MP_PREAPPROVAL_PLAN_ELITE_MENSUAL ?? "";
  const envEliteAnual = process.env.MP_PREAPPROVAL_PLAN_ELITE_ANUAL ?? "";
  const plan: "pro" | "elite" | null =
    planRef && [envPro, envProAnual].includes(planRef)
      ? "pro"
      : planRef && [envElite, envEliteAnual].includes(planRef)
        ? "elite"
        : null;
  return {
    status: mapStatus(String(pre.status ?? "")),
    plan,
    period: Number(recurring.frequency ?? 0) === 12 ? "anual" : "mensual",
    currentPeriodEnd: recurring.end_date ? new Date(String(recurring.end_date)) : null,
    cancelAtPeriodEnd: String(pre.status ?? "") === "cancelled",
  };
}

function planIdFor(plan: "pro" | "elite", period: "mensual" | "anual"): string {
  const key = `MP_PREAPPROVAL_PLAN_${plan.toUpperCase()}_${period.toUpperCase()}`;
  return process.env[key] ?? "";
}

export function createMercadoPagoProvider(): PaymentProvider {
  return {
    id: "mercadopago" as ProviderId,
    label: "Mercado Pago",

    async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
      const token = process.env.MP_ACCESS_TOKEN;
      if (!token) throw new Error("Mercado Pago no configurado: falta MP_ACCESS_TOKEN.");
      const planId = planIdFor(req.plan, req.period);
      if (!planId) {
        throw new Error(
          `Mercado Pago: falta el id del plan para ${req.plan}/${req.period} (MP_PREAPPROVAL_PLAN_*).`,
        );
      }

      const amount =
        req.period === "anual"
          ? PLAN_PRICES_CLP[req.plan].annualTotal
          : PLAN_PRICES_CLP[req.plan].monthly;

      const res = await fetch(`${MP_API}/preapproval`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: `reclu.cl ${req.plan === "elite" ? "Plan Elite" : "Plan Pro"}${req.period === "anual" ? " (anual)" : ""}`,
          preapproval_plan_id: planId,
          payer_email: req.email,
          back_url: req.successUrl,
          external_reference: req.userId,
          status: "authorized",
          // En preapprovals creados desde un plan, los montos los define el
          // plan; auto_recurring explícito evita desvíos si el plan cambia.
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
        providerSubscriptionId: String(data.id ?? ""),
        providerCustomerId: null,
      };
    },

    async verifyNotification(input: WebhookInput): Promise<WebhookVerification> {
      const secret = process.env.MP_WEBHOOK_SECRET;
      const token = process.env.MP_ACCESS_TOKEN;
      if (!secret || !token) {
        return { ok: false, providerSubscriptionId: null, state: null, eventId: null, eventType: null };
      }

      const xSignature = input.headers["x-signature"] ?? "";
      const xRequestId = input.headers["x-request-id"] ?? null;
      const dataId = input.query.get("data.id") ?? input.query.get("data_id") ?? null;

      if (!verifyMercadoPagoSignature(secret, xSignature, xRequestId, dataId)) {
        return { ok: false, providerSubscriptionId: null, state: null, eventId: null, eventType: null };
      }

      // Resolvemos la suscripción desde el id del body SOLO para saber a
      // quién preguntarle; el estado se consulta al API (no se usa el body).
      let providerSubscriptionId: string | null = null;
      let eventType = "subscription.updated";
      try {
        const body = JSON.parse(input.rawBody) as Record<string, unknown>;
        if (body.type === "subscription_preapproval_plan" || body.action?.includes("preapproval")) {
          eventType = "plan.updated";
        }
        const data = (body.data ?? {}) as Record<string, unknown>;
        providerSubscriptionId =
          String(data.id ?? "") || input.query.get("id") || null;
      } catch {
        providerSubscriptionId = dataId;
      }

      if (!providerSubscriptionId) {
        return { ok: false, providerSubscriptionId: null, state: null, eventId: null, eventType: null };
      }

      const state = await this.getSubscriptionState(providerSubscriptionId);
      return {
        ok: state !== null,
        providerSubscriptionId,
        state,
        eventId: `mercadopago:${providerSubscriptionId}:${state?.status ?? "unknown"}`,
        eventType,
      };
    },

    async getSubscriptionState(providerSubscriptionId: string): Promise<SubscriptionState | null> {
      const token = process.env.MP_ACCESS_TOKEN;
      if (!token) return null;
      const res = await fetch(`${MP_API}/preapproval/${providerSubscriptionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        console.error(`[billing/mp] preapproval HTTP ${res.status}`);
        return null;
      }
      return getStateFromPreapproval((await res.json()) as Record<string, unknown>);
    },

    async cancelSubscription(providerSubscriptionId: string) {
      const token = process.env.MP_ACCESS_TOKEN;
      if (!token) throw new Error("Mercado Pago no configurado.");
      const res = await fetch(`${MP_API}/preapproval/${providerSubscriptionId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Mercado Pago cancel HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      return { ok: true, cancelAtPeriodEnd: false };
    },
  };
}
