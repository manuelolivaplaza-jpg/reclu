import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * F82 — la página /upgrade no se cae cuando no hay proveedor de pagos.
 *
 * Antes: `isMockProvider()` llamaba a `getPaymentProvider()`, que lanza
 * `PaymentsNotConfiguredError` sin claves → la página entera daba 500.
 * Ahora: la página usa `getPaymentsAvailability()`, muestra los planes con un
 * aviso y deja el botón de pago deshabilitado.
 *
 * Sin Supabase real: se mockean el perfil y la sesión.
 */

vi.mock("next/server", () => ({
  connection: async () => {},
}));

vi.mock("@/lib/queries", () => ({
  getProfile: vi.fn(async () => ({
    id: "user-1",
    email: "manu@test.cl",
    full_name: "Manu",
    plan: "free",
    billing_customer_id: null,
    alert_frequency: "daily",
    alert_channel: "email",
    unsubscribe_token: null,
    unsubscribed: false,
    created_at: "2026-01-01T00:00:00Z",
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
  })),
}));

import UpgradePage from "@/app/(dashboard)/upgrade/page";

const PAYMENT_ENV = [
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
  const element = await UpgradePage({ searchParams: Promise.resolve({}) });
  return renderToStaticMarkup(element);
}

beforeEach(() => {
  stubPaymentEnv();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/upgrade sin proveedor de pagos", () => {
  it("no lanza y muestra los planes", async () => {
    stubPaymentEnv({ PAYMENT_PROVIDER: "flow" });
    const html = await renderPage();
    expect(html).toContain("Plan Pro");
    expect(html).toContain("Plan Elite");
    expect(html).toContain("$9.990");
  });

  it("muestra el aviso de pagos no disponibles", async () => {
    stubPaymentEnv({ PAYMENT_PROVIDER: "flow" });
    const html = await renderPage();
    expect(html).toContain("Los pagos no están disponibles por ahora. Vuelve a intentarlo más tarde.");
  });

  it("deja el botón de pago deshabilitado", async () => {
    stubPaymentEnv({ PAYMENT_PROVIDER: "flow" });
    const html = await renderPage();
    const submit = (html.match(/<button[^>]*type="submit"[^>]*>/) ?? [])[0] ?? "";
    // Atributo real `disabled`, no la clase CSS `disabled:pointer-events-none`.
    expect(submit).toMatch(/\sdisabled(=|\s|>)/);
  });

  it("los selectores de plan siguen activos (solo el pago se bloquea)", async () => {
    stubPaymentEnv({ PAYMENT_PROVIDER: "flow" });
    const html = await renderPage();
    const planButtons = html.match(/<button[^>]*type="button"[^>]*>/g) ?? [];
    // Botón mensual/anual + los dos selectores de plan.
    expect(planButtons.length).toBeGreaterThanOrEqual(4);
    for (const button of planButtons) {
      expect(button).not.toMatch(/\sdisabled(=|\s|>)/);
    }
  });

  it("los medios de pago quedan deshabilitados", async () => {
    stubPaymentEnv({ PAYMENT_PROVIDER: "flow" });
    const html = await renderPage();
    const radios = html.match(/<input[^>]*type="radio"[^>]*>/g) ?? [];
    expect(radios).toHaveLength(3);
    for (const radio of radios) {
      expect(radio).toMatch(/\sdisabled(=|\s|>)/);
    }
  });

  it("no anuncia el modo prueba cuando no hay pagos", async () => {
    stubPaymentEnv({ PAYMENT_PROVIDER: "flow" });
    const html = await renderPage();
    expect(html).not.toContain("Modo prueba");
  });
});

describe("/upgrade con mock permitido", () => {
  it("no muestra el aviso y el botón de pago queda habilitado", async () => {
    stubPaymentEnv({ PAYMENT_PROVIDER: "mock" });
    const html = await renderPage();
    expect(html).not.toContain("Los pagos no están disponibles por ahora.");
    expect(html).toContain("Modo prueba");
    const submit = (html.match(/<button[^>]*type="submit"[^>]*>/) ?? [])[0] ?? "";
    expect(submit).not.toMatch(/\sdisabled(=|\s|>)/);
    const radios = html.match(/<input[^>]*type="radio"[^>]*>/g) ?? [];
    for (const radio of radios) {
      expect(radio).not.toMatch(/\sdisabled(=|\s|>)/);
    }
  });
});
