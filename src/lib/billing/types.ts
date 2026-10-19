/**
 * Contrato de proveedores de pago para suscripciones reclu.cl.
 *
 * Tres implementaciones: Flow.cl (flow.ts), Mercado Pago (mercadopago.ts)
 * y un proveedor de prueba sin claves (mock.ts). La selección vive en
 * `src/lib/billing/index.ts` vía PAYMENT_PROVIDER / PAYMENT_MODE.
 *
 * Regla de oro: el webhook NUNCA confía en el cuerpo de la notificación;
 * siempre consulta el estado al proveedor (`verifyNotification` debe
 * resolver el estado con una llamada al API del proveedor).
 */

export type ProviderId = "flow" | "mercadopago" | "mock";
export type PaymentMode = "sandbox" | "production";

/** Planes de pago del producto. */
export type PaidPlan = "pro" | "elite";
/** Periodo de facturación (español, igual que la UI y la base de datos). */
export type BillingPeriod = "mensual" | "anual";

/** Estado canónico de una suscripción, independiente del proveedor. */
export type SubscriptionStatus =
  | "pending"
  | "active"
  | "past_due"
  | "canceled"
  | "expired";

/** Pedido de checkout que la ruta /api/billing/checkout construye. */
export interface CheckoutRequest {
  /** auth.users id del usuario que paga. */
  userId: string;
  email: string;
  plan: PaidPlan;
  period: BillingPeriod;
  /** URL interna a la que vuelve el usuario tras pagar (/upgrade/exito). */
  successUrl: string;
  /** URL interna si cancela o falla (/upgrade/error). */
  failureUrl: string;
  /** URL server-to-server que el proveedor notifica (webhook). */
  webhookUrl: string;
  /** Referido que aplicó la cookie ?ref= (para recompensas), si existe. */
  referralCode?: string | null;
}

export interface CheckoutResult {
  /** URL a la que redirigir al usuario para pagar. */
  url: string;
  /** Identificador de suscripción del proveedor, si ya existe. */
  providerSubscriptionId: string | null;
  /** Identificador de cliente en el proveedor (customerId Flow, etc.). */
  providerCustomerId: string | null;
}

/** Estado de la suscripción según el proveedor (fuente de verdad). */
export interface SubscriptionState {
  status: SubscriptionStatus;
  /** Solo si el proveedor lo reporta (mock sí, Flow/MP por metadata). */
  plan: PaidPlan | null;
  period: BillingPeriod | null;
  currentPeriodEnd: Date | null;
  /** True si se canceló pero el periodo corriente sigue vigente. */
  cancelAtPeriodEnd: boolean;
}

/** Entrada cruda de una notificación server-to-server. */
export interface WebhookInput {
  /** Cuerpo tal como llegó (para validar firmas). */
  rawBody: string;
  /** Headers (en minúsculas). */
  headers: Record<string, string>;
  /** Query string de la URL del webhook. */
  query: URLSearchParams;
}

export interface WebhookVerification {
  /** ¿La notificación es auténtica y de este proveedor? */
  ok: boolean;
  /** Id de suscripción en el proveedor, resuelto consultando al proveedor. */
  providerSubscriptionId: string | null;
  /** Id de cliente en el proveedor, si la notificación lo trae (enrolamiento). */
  providerCustomerId?: string | null;
  /** Estado verificado con el proveedor (nunca deducido del body). */
  state: SubscriptionState | null;
  /** Id único del evento para idempotencia (tabla payment_events). */
  eventId: string | null;
  /** Etiqueta legible del evento, para guardar en payment_events. */
  eventType: string | null;
}

/**
 * Adaptador de proveedor de pagos. Cada implementación es autocontenida;
 * el resto del sistema solo depende de esta interfaz.
 */
export interface PaymentProvider {
  readonly id: ProviderId;
  /** Etiqueta corta para UI/logs: "Flow", "Mercado Pago", "Prueba". */
  readonly label: string;
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>;
  verifyNotification(input: WebhookInput): Promise<WebhookVerification>;
  getSubscriptionState(providerSubscriptionId: string): Promise<SubscriptionState | null>;
  cancelSubscription(providerSubscriptionId: string): Promise<{
    ok: boolean;
    /** False = el proveedor corta el acceso de inmediato. */
    cancelAtPeriodEnd: boolean;
  }>;
}
