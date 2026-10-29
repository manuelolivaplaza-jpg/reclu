import { afterEach, describe, expect, it, vi } from "vitest";
import { demoFallbackAllowed } from "@/lib/demo-mode";
import { getPaymentsAvailability } from "@/lib/billing";
import { buildRobots } from "@/app/robots";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("demoFallbackAllowed", () => {
  it("nunca en producción de Vercel", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(demoFallbackAllowed()).toBe(false);
  });
  it("se apaga con DEMO_FALLBACK=false", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("DEMO_FALLBACK", "false");
    expect(demoFallbackAllowed()).toBe(false);
  });
  it("permitido en staging por defecto", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("DEMO_FALLBACK", "");
    expect(demoFallbackAllowed()).toBe(true);
  });
});

describe("CHECKOUT_ENABLED", () => {
  it("false deja el checkout no disponible sin romper (aunque haya mock)", () => {
    vi.stubEnv("CHECKOUT_ENABLED", "false");
    vi.stubEnv("PAYMENT_PROVIDER", "mock");
    vi.stubEnv("NODE_ENV", "development");
    expect(getPaymentsAvailability()).toEqual({ available: false });
  });
});

describe("robots", () => {
  it("excluye rutas privadas", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://reclu.cl");
    const rules = buildRobots("reclu.cl").rules;
    const r = Array.isArray(rules) ? rules[0] : rules;
    const disallow = ([] as string[]).concat(r.disallow ?? []);
    for (const p of ["/admin/", "/upgrade/", "/mi-portafolio/", "/api/"]) expect(disallow).toContain(p);
  });
});
