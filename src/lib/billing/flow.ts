/**
 * Adaptador Flow.cl (suscripciones).
 *
 * Flujo (docs: developers.flow.cl/docs/suscripciones):
 *  1. POST /customer/create {apiKey, name, email, externalId, s} → customerId
 *  2. POST /customer/register {apiKey, customerId, s} → {url, token}
 *     → redirigimos al usuario a url?token=... para enrolar su tarjeta.
 *     Alternativa de una etapa: /payment/create (cobro puntual con Webpay).
 *  3. Cuando el cliente tiene tarjeta registrada, POST /subscription/create
 *     {apiKey, planId, customerId, s} → subscriptionId.
 *  4. Estado: GET /subscription/get con subscriptionId (status 1=activa,
 *     0=inactiva, 2=trial, 4=cancelada; morose=1/2 si hay cobros vencidos).
 *
 * Firma: HMAC-SHA256 hex de `k1v1k2v2...` con parámetros ordenados
 * alfabéticamente (sin incluir el propio `s`), clave = FLOW_SECRET_KEY.
 *
 * Env vars: FLOW_API_KEY, FLOW_SECRET_KEY, FLOW_PLAN_PRO_MENSUAL,
 * FLOW_PLAN_PRO_ANUAL, FLOW_PLAN_ELITE_MENSUAL, FLOW_PLAN_ELITE_ANUAL
 * (id de planes creados en el portal de Flow).
 *
 * NOTA: con Flow las suscripciones se crean en el portal (planId) y la
 * correspondencia plan↔planId vive en env vars, no en la base de datos.
 */

import { createHmac } from "node:crypto";
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
import type { SubscriptionCompleter } from "./completer";
import { PLAN_PRICES_CLP } from "./prices";

const SANDBOX_BASE = "https://sandbox.flow.cl/api";
const PRODUCTION_BASE = "https://www.flow.cl/api";

/** Estado numérico de /subscription/get según la documentación de Flow. */
const FLOW_STATUS: Record<string, SubscriptionStatus> = {
  "0": "pending", // no iniciada
  "1": "active",
  "2": "pending", // trial — aún no es acceso pleno
  "4": "canceled",
};

/**
 * Firma HMAC-SHA256 de Flow: concatenar `clavevalor` de cada parámetro
 * ordenado alfabéticamente por clave y firmar con la secretKey.
 * Exportada para tests.
 */
export function signFlowParams(
  params: Record<string, string | number>,
  secretKey: string,
): string {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join("");
  return createHmac("sha256", secretKey).update(toSign).digest("hex");
}

function flowBaseUrl(mode: "sandbox" | "production"): string {
  return mode === "sandbox" ? SANDBOX_BASE : PRODUCTION_BASE;
}

interface FlowConfig {
  apiKey: string;
  secretKey: string;
  baseUrl: string;
  planIds: Record<"pro" | "elite", Record<"mensual" | "anual", string>>;
}

function getFlowConfig(mode: "sandbox" | "production"): FlowConfig | null {
  const apiKey = process.env.FLOW_API_KEY;
  const secretKey = process.env.FLOW_SECRET_KEY;
  if (!apiKey || !secretKey) return null;
  return {
    apiKey,
    secretKey,
    baseUrl: flowBaseUrl(mode),
    planIds: {
      pro: {
        mensual: process.env.FLOW_PLAN_PRO_MENSUAL ?? "",
        anual: process.env.FLOW_PLAN_PRO_ANUAL ?? "",
      },
      elite: {
        mensual: process.env.FLOW_PLAN_ELITE_MENSUAL ?? "",
        anual: process.env.FLOW_PLAN_ELITE_ANUAL ?? "",
      },
    },
  };
}

/** POST x-www-form-urlencoded firmado a la API de Flow. */
async function flowPost(
  config: FlowConfig,
  service: string,
  params: Record<string, string | number>,
): Promise<Record<string, unknown>> {
  const signed = { ...params, apiKey: config.apiKey };
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(signed)) {
    body.append(key, String(value));
  }
  body.append("s", signFlowParams(signed, config.secretKey));

  const res = await fetch(`${config.baseUrl}/${service}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Flow ${service} HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

/** GET con query firmado a la API de Flow. */
async function flowGet(
  config: FlowConfig,
  service: string,
  params: Record<string, string | number>,
): Promise<Record<string, unknown>> {
  const signed = { ...params, apiKey: config.apiKey };
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(signed)) {
    query.append(key, String(value));
  }
  query.append("s", signFlowParams(signed, config.secretKey));

  const res = await fetch(`${config.baseUrl}/${service}?${query.toString()}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Flow ${service} HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

/**
 * El webhook de Flow (urlConfirmation) trae un `token`; el estado real se
 * consulta con /payment/getStatus (o /subscription/get para suscripciones).
 * Nunca confiamos en el cuerpo de la notificación.
 */
async function verifyFlowWebhook(
  config: FlowConfig,
  input: WebhookInput,
): Promise<WebhookVerification> {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(input.rawBody) as Record<string, unknown>;
  } catch {
    // Flow también puede enviar form-urlencoded.
    parsed = Object.fromEntries(new URLSearchParams(input.rawBody));
  }

  const token = String(parsed.token ?? input.query.get("token") ?? "");
  const subscriptionId = String(
    parsed.subscriptionId ?? parsed.subscription_id ?? input.query.get("subscriptionId") ?? "",
  );

  if (!token && !subscriptionId) {
    return { ok: false, providerSubscriptionId: null, state: null, eventId: null, eventType: null };
  }

  // Preferimos el estado de la suscripción si viene identificada.
  if (subscriptionId) {
    try {
      const sub = await flowGet(config, "subscription/get", { subscriptionId });
      return {
        ok: true,
        providerSubscriptionId: subscriptionId,
        state: mapFlowSubscription(sub),
        eventId: `flow:sub:${subscriptionId}:${sub.period_end ?? ""}`,
        eventType: "subscription.updated",
      };
    } catch {
      // cae abajo a payment/getStatus
    }
  }

  if (!token) {
    return { ok: false, providerSubscriptionId: null, state: null, eventId: null, eventType: null };
  }

  // Flujo de enrolamiento de tarjeta: cuando el cliente termina el
  // registro (customer/register), Flow notifica con un token de cobro
  // de verificación; el estado del enrolamiento se confirma con
  // customer/getRegisterStatus (documentado en el FAQ de Flow).
  try {
    const register = await flowGet(config, "customer/getRegisterStatus", { token });
    const registered = String(register.status ?? "");
    if (registered) {
      return {
        ok: true,
        providerSubscriptionId: null,
        providerCustomerId: register.customerId ? String(register.customerId) : null,
        state: {
          status: registered === "1" || registered === "2" ? "active" : "pending",
          plan: null,
          period: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
        },
        eventId: `flow:register:${token}`,
        eventType: "customer.card_registered",
      };
    }
  } catch {
    // token no era de enrolamiento → seguir con payment/getStatus
  }

  const status = await flowGet(config, "payment/getStatus", { token });
  // 1=pending, 2=paid, 3=rejected, 4=canceled (documentación Flow).
  const code = String(status.status ?? "");
  const subscriptionStatus: SubscriptionStatus =
    code === "2" ? "active" : code === "3" ? "past_due" : code === "4" ? "canceled" : "pending";

  return {
    ok: true,
    providerSubscriptionId: subscriptionId || null,
    state: {
      status: subscriptionStatus,
      plan: null,
      period: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    },
    eventId: `flow:payment:${token}:${code}`,
    eventType: `payment.${subscriptionStatus}`,
  };
}

function mapFlowSubscription(sub: Record<string, unknown>): SubscriptionState {
  const status = FLOW_STATUS[String(sub.status ?? "")] ?? "pending";
  const morose = Number(sub.morose ?? 0);
  const cancelAtPeriodEnd = Number(sub.cancel_at_period_end ?? 0) === 1;
  const periodEnd = sub.period_end ? new Date(String(sub.period_end)) : null;
  return {
    status:
      morose === 1 && status === "active"
        ? "past_due"
        : cancelAtPeriodEnd && periodEnd && periodEnd.getTime() < Date.now()
          ? "expired"
          : status,
    plan: null,
    period: null,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd,
  };
}

export function createFlowProvider(mode: "sandbox" | "production"): PaymentProvider {
  return {
    id: "flow" as ProviderId,
    label: "Flow",
    async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
      const config = getFlowConfig(mode);
      if (!config) {
        throw new Error("Flow no configurado: faltan FLOW_API_KEY o FLOW_SECRET_KEY.");
      }
      const planId = config.planIds[req.plan][req.period];
      if (!planId) {
        throw new Error(
          `Flow: no hay planId configurado para ${req.plan}/${req.period} (revise las variables FLOW_PLAN_*).`,
        );
      }

      // 1. Crear (o reutilizar) el cliente en Flow. externalId = user id,
      //    así un usuario existente devuelve el mismo customerId.
      const customer = await flowPost(config, "customer/create", {
        name: req.email.split("@")[0] || "Usuario reclu",
        email: req.email,
        externalId: req.userId,
      });
      const customerId = String(customer.customerId ?? "");
      if (!customerId) {
        throw new Error("Flow: customer/create no devolvió customerId.");
      }

      // 2. Enrolamiento de tarjeta por redirección: la URL de registro vuelve
      //    a successUrl. La suscripción (paso 3) la crea el webhook cuando
      //    Flow confirma el enrolamiento, o el próximo checkout del usuario.
      try {
        const register = await flowPost(config, "customer/register", {
          customerId,
        });
        const url = String(register.url ?? "");
        const token = String(register.token ?? "");
        if (url) {
          const redirect = new URL(url);
          if (token) redirect.searchParams.set("token", token);
          // Flow vuelve al comercio; agregamos contexto para retomar el flujo.
          redirect.searchParams.set("flow_return", encodeURIComponent(req.successUrl));
          return {
            url: redirect.toString(),
            providerSubscriptionId: null,
            providerCustomerId: customerId,
          };
        }
      } catch (err) {
        // Si el cliente ya tiene tarjeta registrada, /customer/register falla;
        // seguimos directo a crear la suscripción.
        console.warn("[billing/flow] customer/register falló:", (err as Error).message);
      }

      // 3. Cliente ya enrolado → crear la suscripción al plan.
      const sub = await flowPost(config, "subscription/create", {
        planId,
        customerId,
      });
      return {
        url: req.successUrl,
        providerSubscriptionId: String(sub.subscriptionId ?? ""),
        providerCustomerId: customerId,
      };
    },

    async verifyNotification(input: WebhookInput): Promise<WebhookVerification> {
      const config = getFlowConfig(mode);
      if (!config) {
        return { ok: false, providerSubscriptionId: null, state: null, eventId: null, eventType: null };
      }
      try {
        return await verifyFlowWebhook(config, input);
      } catch (err) {
        console.error("[billing/flow] webhook:", (err as Error).message);
        return { ok: false, providerSubscriptionId: null, state: null, eventId: null, eventType: null };
      }
    },

    async getSubscriptionState(providerSubscriptionId: string): Promise<SubscriptionState | null> {
      const config = getFlowConfig(mode);
      if (!config) return null;
      try {
        const sub = await flowGet(config, "subscription/get", {
          subscriptionId: providerSubscriptionId,
        });
        return mapFlowSubscription(sub);
      } catch (err) {
        console.error("[billing/flow] getSubscriptionState:", (err as Error).message);
        return null;
      }
    },

    async cancelSubscription(providerSubscriptionId: string) {
      const config = getFlowConfig(mode);
      if (!config) throw new Error("Flow no configurado.");
      // POST /subscription/cancel {apiKey, subscriptionId, at_period_end, s}
      // at_period_end=1 cancela al final del período vigente (cancelamos así
      // para que el usuario no pierda lo pagado); 0 sería inmediato.
      await flowPost(config, "subscription/cancel", {
        subscriptionId: providerSubscriptionId,
        at_period_end: 1,
      });
      return { ok: true, cancelAtPeriodEnd: true };
    },

    /**
     * Tras el enrolamiento de tarjeta (webhook customer.card_registered):
     * el cliente ya puede suscribirse; creamos la suscripción al plan que
     * quedó pendiente del checkout.
     */
    async completeSubscriptionAfterEnrollment(
      providerCustomerId: string,
      plan: "pro" | "elite",
      period: "mensual" | "anual",
    ): Promise<string | null> {
      const config = getFlowConfig(mode);
      if (!config) return null;
      const planId = config.planIds[plan][period];
      if (!planId) return null;
      try {
        const sub = await flowPost(config, "subscription/create", {
          planId,
          customerId: providerCustomerId,
        });
        return String(sub.subscriptionId ?? "") || null;
      } catch (err) {
        console.error("[billing/flow] completeSubscription:", (err as Error).message);
        return null;
      }
    },
  } as PaymentProvider & SubscriptionCompleter;
}

/** Precio de un plan/periodo en CLP — usado para mostrar y para mocks. */
export function planAmount(plan: "pro" | "elite", period: "mensual" | "anual"): number {
  return period === "anual" ? PLAN_PRICES_CLP[plan].annualTotal : PLAN_PRICES_CLP[plan].monthly;
}
