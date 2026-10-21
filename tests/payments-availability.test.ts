import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPaymentProvider,
  getPaymentsAvailability,
  PaymentsNotConfiguredError,
} from "@/lib/billing";
import {
  PAYMENTS_UNAVAILABLE_ERROR,
  PAYMENTS_UNAVAILABLE_MESSAGE,
} from "@/lib/billing/messages";

/**
 * F82 — "Los pagos no están disponibles por ahora".
 *
 * Sin claves de pago, `getPaymentProvider()` lanza `PaymentsNotConfiguredError`
 * y la página /upgrade se caía. `getPaymentsAvailability()` captura SOLO ese
 * error y devuelve `{ available: false }` — el FAIL CLOSED se mantiene:
 * nunca se cae a mock por falta de claves.
 */

const PAYMENT_ENV = [
  "PAYMENT_PROVIDER",
  "PAYMENT_MODE",
  "VERCEL_ENV",
  "ALLOW_MOCK_PAYMENTS",
  "FLOW_API_KEY",
  "FLOW_SECRET_KEY",
  "MP_ACCESS_TOKEN",
] as const;

/** Aísla el entorno de pagos. No lee `.env.local`. */
function stubPaymentEnv(overrides: Record<string, string | undefined> = {}) {
  for (const key of PAYMENT_ENV) vi.stubEnv(key, undefined);
  vi.stubEnv("NODE_ENV", "development");
  for (const [key, value] of Object.entries(overrides)) vi.stubEnv(key, value);
}

describe("getPaymentsAvailability", () => {
  beforeEach(() => {
    stubPaymentEnv();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sin claves y PAYMENT_PROVIDER=flow devuelve available false", () => {
    stubPaymentEnv({ PAYMENT_PROVIDER: "flow" });
    expect(getPaymentsAvailability()).toEqual({ available: false });
  });

  it("sin claves y PAYMENT_PROVIDER=flow, getPaymentProvider sigue lanzando", () => {
    stubPaymentEnv({ PAYMENT_PROVIDER: "flow" });
    expect(() => getPaymentProvider()).toThrow(PaymentsNotConfiguredError);
  });

  it("sin claves y PAYMENT_PROVIDER=mercadopago devuelve available false", () => {
    stubPaymentEnv({ PAYMENT_PROVIDER: "mercadopago" });
    expect(getPaymentsAvailability()).toEqual({ available: false });
  });

  it("en producción sin claves NUNCA devuelve mock (fail closed)", () => {
    stubPaymentEnv({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      PAYMENT_PROVIDER: "mock",
    });
    const result = getPaymentsAvailability();
    expect(result).toEqual({ available: false });
    expect("isTestMode" in result).toBe(false);
  });

  it("en producción sin claves tampoco con ALLOW_MOCK_PAYMENTS=true", () => {
    stubPaymentEnv({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      PAYMENT_PROVIDER: "mock",
      ALLOW_MOCK_PAYMENTS: "true",
    });
    expect(getPaymentsAvailability()).toEqual({ available: false });
  });

  it("con mock permitido devuelve available true e isTestMode true", () => {
    stubPaymentEnv({ PAYMENT_PROVIDER: "mock" });
    expect(getPaymentsAvailability()).toEqual({ available: true, isTestMode: true });
  });

  it("con flow CON claves devuelve available true e isTestMode false", () => {
    stubPaymentEnv({
      PAYMENT_PROVIDER: "flow",
      FLOW_API_KEY: "api-key",
      FLOW_SECRET_KEY: "secret",
    });
    expect(getPaymentsAvailability()).toEqual({ available: true, isTestMode: false });
  });

  it("no propaga otros errores: solo captura PaymentsNotConfiguredError", async () => {
    vi.resetModules();
    vi.doMock("@/lib/billing/flow", () => ({
      createFlowProvider: () => {
        throw new Error("boom: no es PaymentsNotConfiguredError");
      },
    }));
    stubPaymentEnv({
      PAYMENT_PROVIDER: "flow",
      FLOW_API_KEY: "api-key",
      FLOW_SECRET_KEY: "secret",
    });
    const mod = await import("@/lib/billing");
    expect(() => mod.getPaymentsAvailability()).toThrow(/boom/);
    vi.doUnmock("@/lib/billing/flow");
    vi.resetModules();
  });
});

describe("mensajes de pagos no disponibles", () => {
  it("son los textos en español acordados", () => {
    expect(PAYMENTS_UNAVAILABLE_MESSAGE).toBe(
      "Los pagos no están disponibles por ahora. Vuelve a intentarlo más tarde.",
    );
    expect(PAYMENTS_UNAVAILABLE_ERROR).toBe("Los pagos no están disponibles por ahora.");
  });
});
