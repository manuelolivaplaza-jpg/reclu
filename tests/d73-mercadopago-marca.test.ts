import { describe, it, expect, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  buildExternalReference,
  createMercadoPagoProvider,
  parseExternalReference,
  stateFromPreapproval,
  verifyMercadoPagoSignature,
} from "@/lib/billing/mercadopago";
import { getPaymentProvider } from "@/lib/billing";
import { brandDomain, brandUrl } from "@/lib/brand";
import { siteUrl } from "@/lib/site";

const KEYS = [
  "PAYMENT_PROVIDER", "PAYMENT_MODE", "VERCEL_ENV", "CHECKOUT_ENABLED", "ALLOW_MOCK_PAYMENTS",
  "MERCADOPAGO_ACCESS_TOKEN", "MERCADOPAGO_WEBHOOK_SECRET", "MP_ACCESS_TOKEN", "MP_WEBHOOK_SECRET",
  "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_BRAND_DOMAIN",
];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
function env(vars: Record<string, string>) {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, vars);
}
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
});

function sign(secret: string, id: string, requestId: string, ts = "1704908010") {
  const v1 = createHmac("sha256", secret).update(`id:${id};request-id:${requestId};ts:${ts};`).digest("hex");
  return `ts=${ts},v1=${v1}`;
}

describe("Mercado Pago (d73)", () => {
  it("external_reference ida y vuelta", () => {
    const ref = buildExternalReference("u-1", "elite", "anual");
    expect(parseExternalReference(ref)).toEqual({ userId: "u-1", plan: "elite", period: "anual" });
    expect(parseExternalReference("basura").plan).toBeNull();
  });

  it("mapea el preapproval a estado canónico", () => {
    const s = stateFromPreapproval({
      status: "authorized",
      external_reference: "u|pro|mensual",
      next_payment_date: "2026-12-01T00:00:00.000-03:00",
      auto_recurring: { frequency: 1 },
    });
    expect(s.status).toBe("active");
    expect(s.plan).toBe("pro");
    expect(s.period).toBe("mensual");
    expect(s.currentPeriodEnd?.toISOString()).toBe("2026-12-01T03:00:00.000Z");
    expect(stateFromPreapproval({ status: "cancelled" }).cancelAtPeriodEnd).toBe(true);
    expect(stateFromPreapproval({ status: "pending" }).status).toBe("pending");
  });

  it("firma: acepta la válida y rechaza secreto vacío", () => {
    expect(verifyMercadoPagoSignature("s3", sign("s3", "abc123", "r1"), "r1", "ABC123")).toBe(true);
    expect(verifyMercadoPagoSignature("", sign("s3", "abc123", "r1"), "r1", "abc123")).toBe(false);
  });

  it("sin PAYMENT_PROVIDER usa Mercado Pago si hay token, y mock si no", () => {
    env({ MERCADOPAGO_ACCESS_TOKEN: "TEST-x" });
    expect(getPaymentProvider().id).toBe("mercadopago");
    env({});
    expect(getPaymentProvider().id).toBe("mock");
  });

  it("webhook: rechaza firma inválida sin consultar al API", async () => {
    env({ MERCADOPAGO_ACCESS_TOKEN: "TEST-x", MERCADOPAGO_WEBHOOK_SECRET: "sec" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await createMercadoPagoProvider().verifyNotification({
      rawBody: JSON.stringify({ type: "subscription_preapproval", data: { id: "pre123" } }),
      headers: { "x-signature": "ts=1,v1=00", "x-request-id": "r1" },
      query: new URLSearchParams("data.id=pre123&type=subscription_preapproval"),
    });
    expect(r.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("webhook: firma válida consulta el preapproval y arma un eventId estable", async () => {
    env({ MERCADOPAGO_ACCESS_TOKEN: "TEST-x", MERCADOPAGO_WEBHOOK_SECRET: "sec" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      id: "pre123", status: "authorized", external_reference: "u|elite|mensual",
      next_payment_date: "2026-12-01T00:00:00Z",
    }), { status: 200 })));
    const input = {
      rawBody: JSON.stringify({ type: "subscription_preapproval", data: { id: "pre123" } }),
      headers: { "x-signature": sign("sec", "pre123", "r1"), "x-request-id": "r1" },
      query: new URLSearchParams("data.id=pre123&type=subscription_preapproval"),
    };
    const a = await createMercadoPagoProvider().verifyNotification(input);
    const b = await createMercadoPagoProvider().verifyNotification(input);
    expect(a.ok).toBe(true);
    expect(a.providerSubscriptionId).toBe("pre123");
    expect(a.state?.plan).toBe("elite");
    expect(a.eventId).toBe(b.eventId);
  });

  it("webhook: body con otro id que el firmado se rechaza", async () => {
    env({ MERCADOPAGO_ACCESS_TOKEN: "TEST-x", MERCADOPAGO_WEBHOOK_SECRET: "sec" });
    const r = await createMercadoPagoProvider().verifyNotification({
      rawBody: JSON.stringify({ type: "subscription_preapproval", data: { id: "otro" } }),
      headers: { "x-signature": sign("sec", "pre123", "r1"), "x-request-id": "r1" },
      query: new URLSearchParams("data.id=pre123"),
    });
    expect(r.ok).toBe(false);
  });
});

describe("Marca Fraccion (d73)", () => {
  it("dominio por defecto fraccion.si y configurable", () => {
    env({});
    expect(brandDomain()).toBe("fraccion.si");
    env({ NEXT_PUBLIC_BRAND_DOMAIN: "https://otro.si/" });
    expect(brandUrl()).toBe("https://otro.si");
  });

  it("producción sin NEXT_PUBLIC_SITE_URL usa el dominio de marca", () => {
    env({ VERCEL_ENV: "production" });
    expect(siteUrl()).toBe("https://fraccion.si");
    env({});
    expect(siteUrl()).toBe("http://localhost:3000");
  });
});
