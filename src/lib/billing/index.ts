/**
 * Selector de proveedor de pagos.
 *
 * PAYMENT_PROVIDER = flow | mercadopago | mock
 * PAYMENT_MODE     = sandbox | production
 *
 * FAIL CLOSED: el proveedor `mock` SOLO existe en desarrollo (ver
 * isMockAllowed). Nunca se cae a mock por falta de claves: si piden
 * flow/mercadopago sin claves se lanza un error claro y el checkout
 * responde 503 "Pagos no configurados".
 */

import { createFlowProvider } from "./flow";
import { createMercadoPagoProvider } from "./mercadopago";
import { createMockProvider } from "./mock";
import type { PaymentProvider, PaymentMode } from "./types";

export type { PaymentProvider, PaymentMode } from "./types";

export class PaymentsNotConfiguredError extends Error {
  constructor(providerId: string) {
    super(
      `[billing] PAYMENT_PROVIDER=${providerId} sin claves configuradas — ` +
        "pagos no disponibles (fail closed, no se cae a mock).",
    );
    this.name = "PaymentsNotConfiguredError";
  }
}

export function getPaymentMode(): PaymentMode {
  return process.env.PAYMENT_MODE === "production" ? "production" : "sandbox";
}

/**
 * ¿Está permitido el proveedor mock (pagos simulados sin cobro)?
 * True SOLO si se cumplen TODAS:
 *  - PAYMENT_PROVIDER=mock explícito
 *  - PAYMENT_MODE !== "production"
 *  - VERCEL_ENV !== "production"
 *  - NODE_ENV !== "production" o ALLOW_MOCK_PAYMENTS === "true"
 * En cualquier otro caso el proveedor mock está deshabilitado: el webhook
 * responde 404 y el checkout nunca lo selecciona.
 */
export function isMockAllowed(): boolean {
  if ((process.env.PAYMENT_PROVIDER ?? "").toLowerCase() !== "mock") return false;
  if (process.env.PAYMENT_MODE === "production") return false;
  if (process.env.VERCEL_ENV === "production") return false;
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_MOCK_PAYMENTS !== "true") {
    return false;
  }
  return true;
}

function hasFlowKeys(): boolean {
  return !!(process.env.FLOW_API_KEY && process.env.FLOW_SECRET_KEY);
}

function hasMercadoPagoKeys(): boolean {
  return !!process.env.MP_ACCESS_TOKEN;
}

/** Proveedor configurado — falla si el pedido no tiene claves. */
export function getPaymentProvider(): PaymentProvider {
  const requested = (process.env.PAYMENT_PROVIDER ?? "mock").toLowerCase();

  if (requested === "flow") {
    if (hasFlowKeys()) return createFlowProvider(getPaymentMode());
    throw new PaymentsNotConfiguredError("flow");
  }
  if (requested === "mercadopago") {
    if (hasMercadoPagoKeys()) return createMercadoPagoProvider();
    throw new PaymentsNotConfiguredError("mercadopago");
  }
  // mock (explícito o default): solo si el entorno lo permite.
  if (isMockAllowed()) return createMockProvider();
  throw new PaymentsNotConfiguredError("mock");
}

/**
 * Proveedor por id explícito — para operar una suscripción existente según
 * el proveedor con que se creó (migraciones flow→mercadopago, etc.).
 * Sin claves del proveedor pedido lanza error (fail closed; nunca mock).
 */
export function getProviderById(id: string): PaymentProvider {
  const mode = getPaymentMode();
  if (id === "flow") {
    if (hasFlowKeys()) return createFlowProvider(mode);
    throw new PaymentsNotConfiguredError("flow");
  }
  if (id === "mercadopago") {
    if (hasMercadoPagoKeys()) return createMercadoPagoProvider();
    throw new PaymentsNotConfiguredError("mercadopago");
  }
  if (id === "mock") {
    if (isMockAllowed()) return createMockProvider();
    throw new PaymentsNotConfiguredError("mock");
  }
  throw new PaymentsNotConfiguredError(id);
}

/** True si el proveedor activo es el de prueba (para UI "modo prueba"). */
export function isMockProvider(): boolean {
  return getPaymentProvider().id === "mock";
}

export { createFlowProvider, createMercadoPagoProvider, createMockProvider };
