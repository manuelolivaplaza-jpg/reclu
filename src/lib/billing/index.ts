/**
 * Selector de proveedor de pagos.
 *
 * PAYMENT_PROVIDER = flow | mercadopago | mock
 * PAYMENT_MODE     = sandbox | production
 *
 * Por defecto `mock` si no hay claves del proveedor configuradas, así el
 * flujo completo funciona en desarrollo sin cuentas externas. Si se pide
 * flow/mercadopago pero faltan claves, se cae a mock con un warning.
 */

import { createFlowProvider } from "./flow";
import { createMercadoPagoProvider } from "./mercadopago";
import { createMockProvider } from "./mock";
import type { PaymentProvider, PaymentMode } from "./types";

export type { PaymentProvider, PaymentMode } from "./types";

export function getPaymentMode(): PaymentMode {
  return process.env.PAYMENT_MODE === "production" ? "production" : "sandbox";
}

function hasFlowKeys(): boolean {
  return !!(process.env.FLOW_API_KEY && process.env.FLOW_SECRET_KEY);
}

function hasMercadoPagoKeys(): boolean {
  return !!process.env.MP_ACCESS_TOKEN;
}

/** Proveedor configurado — elige por env y cae a mock sin claves. */
export function getPaymentProvider(): PaymentProvider {
  const requested = (process.env.PAYMENT_PROVIDER ?? "mock").toLowerCase();
  const mode = getPaymentMode();

  if (requested === "flow") {
    if (hasFlowKeys()) return createFlowProvider(mode);
    console.warn("[billing] PAYMENT_PROVIDER=flow sin FLOW_API_KEY/FLOW_SECRET_KEY → mock.");
    return createMockProvider();
  }
  if (requested === "mercadopago") {
    if (hasMercadoPagoKeys()) return createMercadoPagoProvider();
    console.warn("[billing] PAYMENT_PROVIDER=mercadopago sin MP_ACCESS_TOKEN → mock.");
    return createMockProvider();
  }
  return createMockProvider();
}

/**
 * Proveedor por id explícito — para operar una suscripción existente según
 * el proveedor con que se creó (migraciones flow→mercadopago, etc.).
 * Sin claves del proveedor pedido, cae a mock (no debe ocurrir en producción).
 */
export function getProviderById(id: string): PaymentProvider {
  const mode = getPaymentMode();
  if (id === "flow") {
    if (hasFlowKeys()) return createFlowProvider(mode);
    console.warn("[billing] getProviderById(flow) sin claves → mock.");
    return createMockProvider();
  }
  if (id === "mercadopago") {
    if (hasMercadoPagoKeys()) return createMercadoPagoProvider();
    console.warn("[billing] getProviderById(mercadopago) sin claves → mock.");
    return createMockProvider();
  }
  return createMockProvider();
}

/** True si el proveedor activo es el de prueba (para UI "modo prueba"). */
export function isMockProvider(): boolean {
  return getPaymentProvider().id === "mock";
}

export { createFlowProvider, createMercadoPagoProvider, createMockProvider };
