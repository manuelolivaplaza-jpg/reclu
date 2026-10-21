import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * F82 — POST /api/billing/checkout sin proveedor configurado.
 *
 * Antes: el error se traducía a 503 con mensajes distintos según el
 * proveedor ("Pagos no configurados." vs "falta configurar las claves…").
 * Ahora: SIEMPRE 503 con el mismo mensaje genérico, y jamás un 500.
 *
 * Sin Supabase real: se mockea el cliente de sesión.
 */

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
  })),
}));

import { POST } from "@/app/api/billing/checkout/route";
import { PAYMENTS_UNAVAILABLE_ERROR } from "@/lib/billing/messages";

const PAYMENT_ENV = [
  "PAYMENT_PROVIDER",
  "PAYMENT_MODE",
  "VERCEL_ENV",
  "ALLOW_MOCK_PAYMENTS",
  "FLOW_API_KEY",
  "FLOW_SECRET_KEY",
  "MP_ACCESS_TOKEN",
] as const;

function stubPaymentEnv(overrides: Record<string, string | undefined> = {}) {
  for (const key of PAYMENT_ENV) vi.stubEnv(key, undefined);
  vi.stubEnv("NODE_ENV", "development");
  for (const [key, value] of Object.entries(overrides)) vi.stubEnv(key, value);
}

function post(body: unknown = { plan: "pro", period: "mensual" }): Promise<Response> {
  return POST(
    new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  stubPaymentEnv();
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "user-1", email: "manu@test.cl" } },
    error: null,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/billing/checkout sin proveedor de pagos", () => {
  it("sin claves y PAYMENT_PROVIDER=flow responde 503 con el mensaje genérico", async () => {
    stubPaymentEnv({ PAYMENT_PROVIDER: "flow" });
    const res = await post();
    const body = (await res.json()) as { ok: boolean; error: string };

    expect(res.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error).toBe(PAYMENTS_UNAVAILABLE_ERROR);
  });

  it("sin claves y PAYMENT_PROVIDER=mercadopago responde 503 con el mismo mensaje", async () => {
    stubPaymentEnv({ PAYMENT_PROVIDER: "mercadopago" });
    const res = await post();
    const body = (await res.json()) as { ok: boolean; error: string };

    expect(res.status).toBe(503);
    expect(body.error).toBe(PAYMENTS_UNAVAILABLE_ERROR);
  });

  it("en producción sin claves nunca cae a mock ni devuelve 500", async () => {
    stubPaymentEnv({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      PAYMENT_PROVIDER: "mock",
    });
    const res = await post();
    const body = (await res.json()) as { ok: boolean; error: string };

    expect(res.status).toBe(503);
    expect(res.status).not.toBe(500);
    expect(body.error).toBe(PAYMENTS_UNAVAILABLE_ERROR);
  });

  it("el mensaje no revela el proveedor pedido ni las claves faltantes", async () => {
    stubPaymentEnv({ PAYMENT_PROVIDER: "flow" });
    const res = await post();
    const body = (await res.json()) as { error: string };

    expect(body.error).not.toContain("flow");
    expect(body.error).not.toContain("FLOW_API_KEY");
    expect(body.error).not.toContain("FLOW_SECRET_KEY");
  });

  it("sin sesión sigue respondiendo 401 antes de tocar el proveedor", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    stubPaymentEnv({ PAYMENT_PROVIDER: "flow" });
    const res = await post();
    expect(res.status).toBe(401);
  });
});
