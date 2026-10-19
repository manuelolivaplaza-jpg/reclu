import { describe, it, expect } from "vitest";
import {
  PLANS,
  getPlan,
  followLimitFor,
  followLimitLabel,
  chatQuotaFor,
  canUseRealtime,
  isInTrial,
  isTrialPro,
  trialDaysLeft,
  allowedFrequencies,
  formatClp,
  TRIAL_DAYS,
} from "@/lib/plans";

describe("planes: fuente única de verdad", () => {
  it("Pro vale $12.990 CLP/mes y Elite $16.990 CLP/mes", () => {
    expect(PLANS.pro.monthlyPrice).toBe(12990);
    expect(PLANS.elite.monthlyPrice).toBe(16990);
    expect(PLANS.free.monthlyPrice).toBe(0);
  });

  it("el ciclo anual aplica 20% de descuento exacto", () => {
    expect(PLANS.pro.annualMonthlyPrice).toBe(10390); // 12990 * 0.8 = 10392 → redondeo a $10
    expect(PLANS.elite.annualMonthlyPrice).toBe(13590); // 16990 * 0.8 = 13592 → redondeo a $10
    expect(PLANS.pro.annualTotalPrice).toBe(PLANS.pro.annualMonthlyPrice * 12);
  });

  it("límites de follows: 2 gratis / 15 pro / ilimitado elite", () => {
    expect(followLimitFor("free")).toBe(2);
    expect(followLimitFor("pro")).toBe(15);
    expect(followLimitFor("elite")).toBe(Infinity);
    expect(followLimitLabel("elite")).toBe("Ilimitados");
  });

  it("cupos de chat: 5/día gratis, 50/semana pro, ilimitado elite", () => {
    expect(chatQuotaFor("free")).toEqual({ limit: 5, window: "day" });
    expect(chatQuotaFor("pro")).toEqual({ limit: 50, window: "week" });
    expect(chatQuotaFor("elite").window).toBe("unlimited");
    expect(chatQuotaFor("elite").limit).toBe(Infinity);
  });

  it("un plan desconocido cae a Gratis", () => {
    expect(getPlan("noexiste").id).toBe("free");
    expect(getPlan(null).id).toBe("free");
    expect(followLimitFor(undefined)).toBe(2);
  });

  it("frecuencias permitidas por plan", () => {
    expect(allowedFrequencies("free")).toEqual(["daily", "weekly"]);
    expect(allowedFrequencies("pro")).toEqual(["realtime", "daily", "weekly"]);
    expect(allowedFrequencies("elite")).toEqual(["realtime", "daily", "weekly"]);
  });

  it("canUseRealtime solo para pro/elite (y prueba)", () => {
    expect(canUseRealtime("free")).toBe(false);
    expect(canUseRealtime("pro")).toBe(true);
    expect(canUseRealtime("elite")).toBe(true);
  });
});

describe("prueba de 7 días", () => {
  const now = Date.parse("2026-10-18T12:00:00Z");

  it("la prueba dura 7 días desde el alta", () => {
    expect(TRIAL_DAYS).toBe(7);
  });

  it("gratis con prueba vigente se trata como pro", () => {
    const ends = "2026-10-21T12:00:00Z"; // 3 días en el futuro
    expect(isInTrial(ends, now)).toBe(true);
    expect(isTrialPro("free", ends, now)).toBe(true);
    expect(canUseRealtime("free", ends, now)).toBe(true);
    expect(allowedFrequencies("free", ends, now)).toContain("realtime");
  });

  it("prueba vencida vuelve a gratis", () => {
    const ends = "2026-10-10T12:00:00Z";
    expect(isInTrial(ends, now)).toBe(false);
    expect(isTrialPro("free", ends, now)).toBe(false);
    expect(canUseRealtime("free", ends, now)).toBe(false);
  });

  it("la prueba no degrada a un plan pagado", () => {
    const ends = "2026-10-21T12:00:00Z";
    expect(isTrialPro("elite", ends, now)).toBe(false);
    expect(canUseRealtime("pro", null, now)).toBe(true);
  });

  it("trialDaysLeft cuenta días completos y tolera basura", () => {
    expect(trialDaysLeft("2026-10-21T12:00:00Z", now)).toBe(3);
    expect(trialDaysLeft("2026-10-10T12:00:00Z", now)).toBe(0);
    expect(trialDaysLeft(null, now)).toBeNull();
    expect(trialDaysLeft("basura", now)).toBeNull();
  });
});

describe("formatClp", () => {
  it("formatea pesos chilenos con punto de miles", () => {
    expect(formatClp(12990)).toBe("$12.990");
    expect(formatClp(16990)).toBe("$16.990");
    expect(formatClp(0)).toBe("$0");
    expect(formatClp(10390)).toBe("$10.390");
  });
});
