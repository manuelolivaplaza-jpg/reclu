import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * F82 (pendiente) — /upgrade/pendiente no se cae y avisa de forma explícita
 * cuando los pagos no están configurados.
 *
 * Antes la página tenía un `catch` genérico que se tragaba cualquier error y
 * caía a un texto neutro. Ahora usa `getPaymentsAvailability()`, que captura
 * SOLO `PaymentsNotConfiguredError`; el resto de los errores se propagan.
 */

vi.mock("next/server", () => ({
  connection: async () => {},
}));

import UpgradePendientePage from "@/app/(dashboard)/upgrade/pendiente/page";
import { PAYMENTS_UNAVAILABLE_MESSAGE } from "@/lib/billing/messages";

const PAYMENT_ENV = [
  "CHECKOUT_ENABLED",
  "PAYMENT_PROVIDER",
  "PAYMENT_MODE",
  "VERCEL_ENV",
  "ALLOW_MOCK_PAYMENTS",
  "FLOW_API_KEY",
  "FLOW_SECRET_KEY",
  "MP_ACCESS_TOKEN",
  "MERCADOPAGO_ACCESS_TOKEN",
  "MERCADOPAGO_WEBHOOK_SECRET",
] as const;

function stubPaymentEnv(overrides: Record<string, string | undefined> = {}) {
  for (const key of PAYMENT_ENV) vi.stubEnv(key, undefined);
  vi.stubEnv("NODE_ENV", "development");
  for (const [key, value] of Object.entries(overrides)) vi.stubEnv(key, value);
}

async function renderPage(): Promise<string> {
  return renderToStaticMarkup(await UpgradePendientePage());
}

beforeEach(() => {
  stubPaymentEnv();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/upgrade/pendiente sin proveedor de pagos", () => {
  it("no lanza y muestra el aviso explícito", async () => {
    stubPaymentEnv({ PAYMENT_PROVIDER: "flow" });
    const html = await renderPage();
    expect(html).toContain(PAYMENTS_UNAVAILABLE_MESSAGE);
    expect(html).toContain("No pudimos confirmar tu pago.");
  });

  it("no simula un pago en curso ni anuncia modo prueba", async () => {
    stubPaymentEnv({ PAYMENT_PROVIDER: "flow" });
    const html = await renderPage();
    expect(html).not.toContain("Estamos confirmando tu pago.");
    expect(html).not.toContain("Modo prueba");
    expect(html).not.toContain("Tu pago está en proceso");
  });

  it("no expone detalles internos (proveedor ni claves faltantes)", async () => {
    stubPaymentEnv({ PAYMENT_PROVIDER: "flow" });
    const html = await renderPage();
    expect(html).not.toContain("Flow");
    expect(html).not.toContain("PAYMENT_PROVIDER");
    expect(html).not.toContain("claves");
    expect(html).not.toContain("fail closed");
  });

  it("con CHECKOUT_ENABLED=false también avisa en vez de crashear", async () => {
    stubPaymentEnv({ PAYMENT_PROVIDER: "mock", CHECKOUT_ENABLED: "false" });
    const html = await renderPage();
    expect(html).toContain(PAYMENTS_UNAVAILABLE_MESSAGE);
  });
});

describe("/upgrade/pendiente con proveedor configurado", () => {
  it("con mock permitido mantiene el texto de modo prueba", async () => {
    stubPaymentEnv({ PAYMENT_PROVIDER: "mock" });
    const html = await renderPage();
    expect(html).toContain("Modo prueba: tu suscripción se confirma en segundos.");
    expect(html).not.toContain("Los pagos no están disponibles");
  });

  it("con flow configurado mantiene el nombre del proveedor", async () => {
    stubPaymentEnv({
      PAYMENT_PROVIDER: "flow",
      FLOW_API_KEY: "api-key",
      FLOW_SECRET_KEY: "secret",
    });
    const html = await renderPage();
    expect(html).toContain("Tu pago está en proceso con Flow.");
    expect(html).not.toContain("Los pagos no están disponibles");
  });
});
