import { describe, expect, it } from "vitest";
import {
  ALERT_RULE_LIMIT_FREE,
  ALERT_RULE_LIMIT_PAID,
  alertRuleInputSchema,
  alertRuleLimitFor,
  formatRuleAmount,
  friendlyAlertRuleDbError,
  parseAlertRuleRows,
  ruleMatches,
  type AlertMatchInput,
} from "@/lib/alert-rules";

const nvdaAlert: AlertMatchInput = {
  portfolio_id: "d1",
  title: "Nancy Pelosi compró $1M–$5M en NVDA",
  payload: { symbol: "nvda", value_usd: 1_000_000 },
  portfolio: {
    id: "d1",
    slug: "pelosi-tracker",
    name: "Pelosi Tracker",
    manager: "Nancy Pelosi",
    source: "house_disclosure",
  },
};

describe("alertRuleInputSchema", () => {
  it("normaliza símbolo, fuente y monto", () => {
    const ticker = alertRuleInputSchema.safeParse({ kind: "ticker", value: " nvda " });
    expect(ticker.success).toBe(true);
    if (ticker.success) {
      expect(ticker.data.value).toBe("NVDA");
      expect(ticker.data.channel).toBe("email");
    }

    const source = alertRuleInputSchema.safeParse({
      kind: "source",
      value: "House_Disclosure",
      channel: "both",
    });
    expect(source.success).toBe(true);
    if (source.success) expect(source.data.value).toBe("house_disclosure");

    const amount = alertRuleInputSchema.safeParse({ kind: "min_amount", value: "1000000.00" });
    expect(amount.success).toBe(true);
    if (amount.success) expect(amount.data.value).toBe("1000000");

    const portfolio = alertRuleInputSchema.safeParse({ kind: "portfolio", value: "  Nancy   Pelosi " });
    expect(portfolio.success).toBe(true);
    if (portfolio.success) expect(portfolio.data.value).toBe("Nancy Pelosi");
  });

  it("rechaza símbolo, canal, monto y tipo inválidos", () => {
    expect(alertRuleInputSchema.safeParse({ kind: "ticker", value: "NV DA" }).success).toBe(false);
    expect(alertRuleInputSchema.safeParse({ kind: "ticker", value: "NVDA", channel: "sms" }).success).toBe(false);
    expect(alertRuleInputSchema.safeParse({ kind: "min_amount", value: "0" }).success).toBe(false);
    expect(alertRuleInputSchema.safeParse({ kind: "min_amount", value: "1M" }).success).toBe(false);
    expect(alertRuleInputSchema.safeParse({ kind: "portfolio", value: "A" }).success).toBe(false);
    expect(alertRuleInputSchema.safeParse({ kind: "source", value: "Casa de Bolsa" }).success).toBe(false);
    expect(alertRuleInputSchema.safeParse({ kind: "sms", value: "NVDA" }).success).toBe(false);
  });
});

describe("alertRuleLimitFor", () => {
  it("da 3 en gratis y 50 en pro, elite y prueba", () => {
    expect(ALERT_RULE_LIMIT_FREE).toBe(3);
    expect(ALERT_RULE_LIMIT_PAID).toBe(50);
    expect(alertRuleLimitFor("free")).toBe(3);
    expect(alertRuleLimitFor("pro")).toBe(50);
    expect(alertRuleLimitFor("elite")).toBe(50);
    expect(alertRuleLimitFor("free", "2099-01-01T00:00:00Z")).toBe(50);
    expect(alertRuleLimitFor("free", "2000-01-01T00:00:00Z")).toBe(3);
    expect(alertRuleLimitFor("desconocido")).toBe(3);
  });
});

describe("ruleMatches", () => {
  it("avisa si cualquier fuente compra NVDA", () => {
    const rule = { kind: "ticker" as const, value: "NVDA", channel: "email" as const };
    expect(ruleMatches(rule, nvdaAlert)).toBe(true);
    expect(
      ruleMatches(rule, {
        portfolio_id: "otro",
        payload: { symbol: "NVDA" },
        portfolio: { slug: "gottheimer-tracker", name: "Josh Gottheimer Tracker" },
      }),
    ).toBe(true);
    expect(ruleMatches(rule, { payload: { symbols: ["MSFT", "nvda"] } })).toBe(true);
    expect(ruleMatches(rule, { payload: { symbol: "TSLA" }, title: "Mención de NVDA en el texto" })).toBe(false);
    expect(ruleMatches({ ...rule, active: false }, nvdaAlert)).toBe(false);
  });

  it("avisa si Pelosi opera, por slug, nombre o lista de acumulación", () => {
    const rule = { kind: "portfolio" as const, value: "Pelosi" };
    expect(ruleMatches(rule, nvdaAlert)).toBe(true);
    expect(ruleMatches({ kind: "portfolio", value: "pelosi-tracker" }, nvdaAlert)).toBe(true);
    expect(
      ruleMatches(rule, {
        payload: {
          symbol: "NVDA",
          portfolios: [{ slug: "pelosi-tracker", name: "Pelosi Tracker" }],
        },
      }),
    ).toBe(true);
    expect(ruleMatches({ kind: "portfolio", value: "Larrain" }, { portfolio: { manager: "Larraín Vial" } })).toBe(true);
    expect(ruleMatches(rule, { portfolio: { slug: "khanna-tracker", name: "Ro Khanna Tracker" } })).toBe(false);
  });

  it("compara la fuente en forma exacta", () => {
    const rule = { kind: "source" as const, value: "house_disclosure" };
    expect(ruleMatches(rule, nvdaAlert)).toBe(true);
    expect(ruleMatches(rule, { payload: { source: "HOUSE_DISCLOSURE" } })).toBe(true);
    expect(ruleMatches(rule, { portfolio: { source: "renta4" } })).toBe(false);
  });

  it("avisa compras de más de US$1M y no las de menos", () => {
    const rule = { kind: "min_amount" as const, value: "1000000" };
    expect(ruleMatches(rule, nvdaAlert)).toBe(true);
    expect(ruleMatches(rule, { payload: { value_usd: 1_000_000 } })).toBe(true);
    expect(ruleMatches(rule, { payload: { amount_usd: 999_999 } })).toBe(false);
    expect(ruleMatches(rule, { title: "Pelosi compró $1M–$5M en NVDA", payload: {} })).toBe(true);
    expect(ruleMatches(rule, { title: "Gottheimer compró $15K–$50K", payload: {} })).toBe(false);
    expect(ruleMatches(rule, { title: "NVDA superó el 20% del portafolio", payload: {} })).toBe(false);
    expect(ruleMatches(rule, { payload: { amount_min: 500_000, amount_max: 1_000_000 } })).toBe(true);
    expect(ruleMatches(rule, nvdaAlert)).toBe(ruleMatches({ ...rule, channel: "telegram" }, nvdaAlert));
  });
});

describe("parseo y errores de base", () => {
  it("descarta filas ajenas al esquema", () => {
    const rows = parseAlertRuleRows([
      { id: "1", kind: "ticker", value: "NVDA", channel: "email", active: true },
      { id: "2", kind: "sms", value: "NVDA", channel: "email" },
      { id: "", kind: "ticker", value: "AAPL", channel: "email" },
      null,
    ]);
    expect(rows).toEqual([
      { id: "1", kind: "ticker", value: "NVDA", channel: "email", active: true },
    ]);
  });

  it("traduce el tope, el duplicado y Telegram", () => {
    expect(friendlyAlertRuleDbError("Alcanzaste el límite de reglas de alerta de tu plan.")).toMatch(/límite/);
    expect(friendlyAlertRuleDbError("duplicate key", "23505")).toBe("Ya tienes una regla igual.");
    expect(friendlyAlertRuleDbError("Telegram está disponible en Pro, Elite y durante la prueba.")).toMatch(/Telegram/);
    expect(friendlyAlertRuleDbError("connection reset")).toBeNull();
    expect(formatRuleAmount("1000000")).toBe("US$1.000.000");
  });
});
