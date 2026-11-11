import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { signFlowParams } from "@/lib/billing/flow";
import { verifyMercadoPagoSignature } from "@/lib/billing/mercadopago";
import {
  getPaymentProvider,
  getProviderById,
  isMockAllowed,
  PaymentsNotConfiguredError,
} from "@/lib/billing";
import { PLAN_PRICES_CLP, formatCLP } from "@/lib/billing/prices";

// ---- Firma HMAC de Flow ----

describe("signFlowParams (firma Flow.cl)", () => {
  it("ordena los parámetros alfabéticamente y concatena clave+valor", () => {
    // Ejemplo de la documentación de Flow:
    // amount=5000, apiKey=XXXX-XXXX-XXXX, currency=CLP
    // → "amount5000apiKeyXXXX-XXXX-XXXXcurrencyCLP"
    const signature = signFlowParams(
      { apiKey: "XXXX-XXXX-XXXX", currency: "CLP", amount: 5000 },
      "my secret",
    );
    const expected = createHmac("sha256", "my secret")
      .update("amount5000apiKeyXXXX-XXXX-XXXXcurrencyCLP")
      .digest("hex");
    expect(signature).toBe(expected);
  });

  it("es determinista y sensible a la clave", () => {
    const params = { apiKey: "ABC", email: "a@b.cl", externalId: "u-1" };
    const a = signFlowParams(params, "secret1");
    const b = signFlowParams(params, "secret2");
    const a2 = signFlowParams(params, "secret1");
    expect(a).not.toBe(b);
    expect(a).toBe(a2);
  });

  it("no cambia si los parámetros vienen en otro orden", () => {
    const s1 = signFlowParams({ apiKey: "k", externalId: "e1" }, "s");
    const s2 = signFlowParams({ externalId: "e1", apiKey: "k" }, "s");
    expect(s1).toBe(s2);
  });
});

// ---- Verificación de webhook de Mercado Pago ----

function mpSignature(secret: string, dataId: string, requestId: string, ts: string) {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  return `ts=${ts},v1=${createHmac("sha256", secret).update(manifest).digest("hex")}`;
}

describe("verifyMercadoPagoSignature", () => {
  const secret = "mp-webhook-secret";
  const dataId = "2c938084726fca48";
  const requestId = "req-123";
  const ts = "1704908010";

  it("acepta una firma válida (manifest id;request-id;ts)", () => {
    const xSignature = mpSignature(secret, dataId, requestId, ts);
    expect(verifyMercadoPagoSignature(secret, xSignature, requestId, dataId)).toBe(true);
  });

  it("rechaza firma con otro secreto", () => {
    const xSignature = mpSignature("otro-secreto", dataId, requestId, ts);
    expect(verifyMercadoPagoSignature(secret, xSignature, requestId, dataId)).toBe(false);
  });

  it("rechaza firma si el data.id fue manipulado", () => {
    const xSignature = mpSignature(secret, dataId, requestId, ts);
    expect(verifyMercadoPagoSignature(secret, xSignature, requestId, "otro-id")).toBe(false);
  });

  it("rechaza header malformado", () => {
    expect(verifyMercadoPagoSignature(secret, "garbage", requestId, dataId)).toBe(false);
    expect(verifyMercadoPagoSignature(secret, "", requestId, dataId)).toBe(false);
    expect(verifyMercadoPagoSignature(secret, "ts=1", requestId, dataId)).toBe(false);
  });
});

// ---- Proveedor mock (con Supabase stubeado) ----

function stubSupabase(rows: Record<string, unknown>[]) {
  return {
    from: (table: string) => {
      if (table === "subscriptions") {
        return {
          insert: async (row: Record<string, unknown>) => {
            rows.push(row);
            return { error: null };
          },
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "payment_events") {
        return {
          insert: async () => ({ error: null }),
        };
      }
      return {
        insert: async () => ({ error: null }),
        update: () => ({ eq: () => ({ error: null }) }),
      };
    },
  };
}

describe("proveedor mock", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.PAYMENT_PROVIDER = "mock";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  });

  it("createCheckout devuelve URL interna de éxito con el id del pago simulado", async () => {
    const rows: Record<string, unknown>[] = [];
    vi.doMock("@supabase/supabase-js", () => ({
      createClient: () => stubSupabase(rows),
    }));
    const { createMockProvider } = await import("@/lib/billing/mock");
    const provider = createMockProvider();

    const result = await provider.createCheckout({
      userId: "user-1",
      email: "test@test.cl",
      plan: "pro",
      period: "mensual",
      successUrl: "http://localhost:3000/upgrade/exito",
      failureUrl: "http://localhost:3000/upgrade/error",
      webhookUrl: "http://localhost:3000/api/billing/webhook/mock",
    });

    expect(result.url).toContain("/upgrade/exito?mock_payment=mock_");
    expect(result.providerSubscriptionId).toMatch(/^mock_/);
    expect(rows[0]).toMatchObject({
      user_id: "user-1",
      provider: "mock",
      plan: "pro",
      status: "pending",
    });
  });

  it("verifyNotification resuelve el plan/periodo desde la base, no del body", async () => {
    const rows = [
      {
        user_id: "user-1",
        plan: "elite",
        period: "anual",
        status: "pending",
        current_period_end: "2026-12-01T00:00:00.000Z",
        cancel_at_period_end: false,
      },
    ];
    vi.doMock("@supabase/supabase-js", () => ({
      createClient: () => stubSupabase(rows),
    }));
    const { createMockProvider } = await import("@/lib/billing/mock");
    const provider = createMockProvider();

    // El body intenta "pagar" un plan Pro mensual; la base dice elite anual.
    const verification = await provider.verifyNotification({
      rawBody: JSON.stringify({ mockPaymentId: "mock_abc" }),
      headers: {},
      query: new URLSearchParams(),
    });

    expect(verification.ok).toBe(true);
    expect(verification.state?.plan).toBe("elite");
    expect(verification.state?.period).toBe("anual");
    expect(verification.state?.status).toBe("active");
  });

});

// ---- Precios ----

describe("prices", () => {
  it("Pro $9.990/mes y anual $99.900, Elite $16.990/mes", () => {
    expect(PLAN_PRICES_CLP.pro.monthly).toBe(9990);
    expect(PLAN_PRICES_CLP.pro.annualMonthly).toBe(8325);
    expect(PLAN_PRICES_CLP.pro.annualTotal).toBe(99900);
    expect(PLAN_PRICES_CLP.pro.annualMonthly).toBeLessThan(PLAN_PRICES_CLP.pro.monthly);
    expect(PLAN_PRICES_CLP.elite.monthly).toBe(16990);
    expect(PLAN_PRICES_CLP.elite.annualTotal).toBe(163080);
    expect(formatCLP(9990)).toBe("$9.990");
  });
});

// ---- Fail closed: mock solo en desarrollo ----

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

/** Aísla el entorno de pagos. No lee `.env.local`. */
function stubPaymentEnv(overrides: Record<string, string | undefined> = {}) {
  for (const key of PAYMENT_ENV) vi.stubEnv(key, undefined);
  vi.stubEnv("NODE_ENV", "development");
  for (const [key, value] of Object.entries(overrides)) vi.stubEnv(key, value);
}

describe("fail closed del proveedor", () => {
  beforeEach(() => {
    stubPaymentEnv();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sin PAYMENT_PROVIDER y en desarrollo usa mock", () => {
    const provider = getPaymentProvider();
    expect(isMockAllowed()).toBe(true);
    expect(provider.id).toBe("mock");
  });

  it("VERCEL_ENV=production bloquea mock aunque ALLOW_MOCK_PAYMENTS=true", () => {
    stubPaymentEnv({
      PAYMENT_PROVIDER: "mock",
      VERCEL_ENV: "production",
      ALLOW_MOCK_PAYMENTS: "true",
    });
    expect(isMockAllowed()).toBe(false);
    expect(() => getPaymentProvider()).toThrow(PaymentsNotConfiguredError);
    expect(() => getProviderById("mock")).toThrow(PaymentsNotConfiguredError);
  });

  it("NODE_ENV=production exige ALLOW_MOCK_PAYMENTS y cede si VERCEL_ENV no es production", () => {
    stubPaymentEnv({ NODE_ENV: "production", PAYMENT_PROVIDER: "mock" });
    expect(isMockAllowed()).toBe(false);
    expect(() => getPaymentProvider()).toThrow(PaymentsNotConfiguredError);

    stubPaymentEnv({
      NODE_ENV: "production",
      PAYMENT_PROVIDER: "mock",
      ALLOW_MOCK_PAYMENTS: "true",
    });
    expect(isMockAllowed()).toBe(true);
    expect(getPaymentProvider().id).toBe("mock");
  });

  it("flow sin claves lanza PaymentsNotConfiguredError y no cae a mock", () => {
    stubPaymentEnv({ PAYMENT_PROVIDER: "flow" });
    expect(isMockAllowed()).toBe(false);
    expect(() => getPaymentProvider()).toThrow(PaymentsNotConfiguredError);
    expect(() => getProviderById("flow")).toThrow(PaymentsNotConfiguredError);
    try {
      getPaymentProvider();
    } catch (err) {
      expect(err).toBeInstanceOf(PaymentsNotConfiguredError);
      expect((err as PaymentsNotConfiguredError).providerId).toBe("flow");
    }
  });

  it("mercadopago sin claves lanza PaymentsNotConfiguredError y no cae a mock", () => {
    stubPaymentEnv({ PAYMENT_PROVIDER: "mercadopago" });
    expect(isMockAllowed()).toBe(false);
    expect(() => getPaymentProvider()).toThrow(PaymentsNotConfiguredError);
    try {
      getProviderById("mercadopago");
    } catch (err) {
      expect((err as PaymentsNotConfiguredError).providerId).toBe("mercadopago");
    }
  });

  it("el webhook mock responde 404 cuando mock no está permitido", async () => {
    stubPaymentEnv({ VERCEL_ENV: "production", ALLOW_MOCK_PAYMENTS: "true" });
    expect(isMockAllowed()).toBe(false);
    const { POST } = await import("@/app/api/billing/webhook/[provider]/route");
    const res = await POST(
      new Request("http://localhost/api/billing/webhook/mock", {
        method: "POST",
        body: JSON.stringify({ mockPaymentId: "mock_forged" }),
      }),
      { params: Promise.resolve({ provider: "mock" }) },
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(false);
  });
});
