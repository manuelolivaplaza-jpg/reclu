import { afterEach, describe, expect, it } from "vitest";
import { siteUrl } from "@/lib/site";
import { isIndexableHost } from "@/lib/seo";
import { aiEnabled } from "@/lib/ai-flags";
import { buildComposition } from "@/lib/composition";
import { slugImage } from "@/lib/portfolio-avatar";
import { PLANS } from "@/lib/plans";
import { PLAN_PRICES_CLP } from "@/lib/billing/prices";

const KEYS = ["NEXT_PUBLIC_SITE_URL", "VERCEL_ENV", "VERCEL_URL", "VERCEL_PROJECT_PRODUCTION_URL", "OPENROUTER_API_KEY", "OPENROUTER_MODEL", "CHAT_IA_MODEL"];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("d72: URL del sitio con fallback", () => {
  it("usa NEXT_PUBLIC_SITE_URL si existe", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "app.ejemplo.cl";
    process.env.VERCEL_URL = "x.vercel.app";
    expect(siteUrl()).toBe("https://app.ejemplo.cl");
  });
  it("en producción sin variable cae al dominio de producción de Vercel", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "prod.ejemplo.cl";
    process.env.VERCEL_URL = "deploy-123.vercel.app";
    expect(siteUrl()).toBe("https://prod.ejemplo.cl");
  });
  it("en preview cae a VERCEL_URL", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL = "deploy-123.vercel.app";
    expect(siteUrl()).toBe("https://deploy-123.vercel.app");
  });
});

describe("d72: indexación solo en producción", () => {
  it("preview nunca indexa aunque el host coincida", () => {
    process.env.VERCEL_ENV = "preview";
    expect(isIndexableHost("app.ejemplo.cl", "app.ejemplo.cl")).toBe(false);
  });
  it("producción indexa el host canónico", () => {
    process.env.VERCEL_ENV = "production";
    expect(isIndexableHost("app.ejemplo.cl", "app.ejemplo.cl")).toBe(true);
    expect(isIndexableHost("reclu-amber.vercel.app", "reclu-amber.vercel.app")).toBe(false);
  });
});

describe("d72: flag de IA", () => {
  it("apagado sin clave", () => {
    delete process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_MODEL = "modelo/x";
    expect(aiEnabled()).toBe(false);
  });
  it("encendido con clave y modelo", () => {
    process.env.OPENROUTER_API_KEY = "prueba";
    process.env.OPENROUTER_MODEL = "modelo/x";
    expect(aiEnabled()).toBe(true);
  });
});

describe("d72: composición sin nombres repetidos", () => {
  it("una fila por símbolo y sin nombre igual al ticker", () => {
    const rows = buildComposition(
      [
        { symbol: "INTC", name: "INTC", weight: 20, as_of: "2026-10-01" },
        { symbol: "INTC", name: "INTC", weight: 10, as_of: "2026-10-01" },
        { symbol: "BE", name: "Bloom Energy", weight: 70, as_of: "2026-10-01" },
      ],
      { complete: true },
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.symbol === "INTC")?.name).toBe("");
    expect(rows.find((r) => r.symbol === "BE")?.name).toBe("Bloom Energy");
  });
});

describe("d72: logos y precios", () => {
  it("logos de las 3 carteras chilenas", () => {
    expect(slugImage("consenso-corredoras-cl")).toBe("/portfolios/cl/consenso-corredoras-cl.svg");
    expect(slugImage("fondos-mutuos-acciones-cl")).toBe("/portfolios/cl/fondos-mutuos-acciones-cl.svg");
    expect(slugImage("larrainvial-top-picks")).toBe("/portfolios/cl/larrainvial-top-picks.svg");
  });
  it("/planes y el checkout usan los mismos precios", () => {
    expect(PLANS.pro.monthlyPrice).toBe(PLAN_PRICES_CLP.pro.monthly);
    expect(PLANS.elite.monthlyPrice).toBe(PLAN_PRICES_CLP.elite.monthly);
    expect(PLANS.pro.annualMonthlyPrice).toBe(PLAN_PRICES_CLP.pro.annualMonthly);
    expect(PLANS.elite.annualMonthlyPrice).toBe(PLAN_PRICES_CLP.elite.annualMonthly);
  });
});