import { describe, it, expect } from "vitest";
import {
  roleFor,
  canViewPremium,
  sliceForRole,
  HOLDING_LIMITS,
  ALERT_LIMITS,
} from "@/lib/access";
import type { Alert, Holding } from "@/lib/types";

function holding(weight: number): Holding {
  return {
    id: `h-${weight}`,
    portfolio_id: "p1",
    symbol: `SYM${weight}`,
    name: `Symbol ${weight}`,
    weight,
    previous_weight: null,
    asset_class: "equity",
    exchange: null,
    currency: "USD",
    as_of: "2026-10-01",
    price_at_disclosure: null,
    price_current: null,
    return_pct: null,
  };
}

function alert(i: number): Alert {
  return {
    id: `a-${i}`,
    portfolio_id: "p1",
    type: "weight_change",
    severity: "medium",
    title: `Alerta ${i}`,
    summary: null,
    payload: {},
    created_at: "2026-10-01T00:00:00Z",
  };
}

describe("roleFor", () => {
  it("returns anon when there is no profile", () => {
    expect(roleFor(null)).toBe("anon");
  });

  it("returns free for an account without a paid plan", () => {
    expect(roleFor({ plan: "free" })).toBe("free");
  });

  it("returns paid for pro and elite", () => {
    expect(roleFor({ plan: "pro" })).toBe("paid");
    expect(roleFor({ plan: "elite" })).toBe("paid");
  });
});

describe("limits", () => {
  it("matches the proposal of the report", () => {
    expect(HOLDING_LIMITS.anon).toBe(5);
    expect(HOLDING_LIMITS.free).toBe(10);
    expect(ALERT_LIMITS.anon).toBe(3);
    expect(ALERT_LIMITS.free).toBe(10);
  });
});

describe("canViewPremium", () => {
  it("only paid roles see premium portfolios in full", () => {
    expect(canViewPremium("anon")).toBe(false);
    expect(canViewPremium("free")).toBe(false);
    expect(canViewPremium("paid")).toBe(true);
  });
});

describe("sliceForRole", () => {
  const data = {
    holdings: [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 5, 1].map(holding),
    alerts: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(alert),
  };

  it("slices both lists for anon", () => {
    const out = sliceForRole(data, "anon");
    expect(out.holdings).toHaveLength(5);
    expect(out.alerts).toHaveLength(3);
    expect(out.holdings![0].weight).toBe(100);
  });

  it("slices both lists for free", () => {
    const out = sliceForRole(data, "free");
    expect(out.holdings).toHaveLength(10);
    expect(out.alerts).toHaveLength(10);
  });

  it("returns everything untouched for paid", () => {
    const out = sliceForRole(data, "paid");
    expect(out.holdings).toHaveLength(12);
    expect(out.alerts).toHaveLength(12);
  });

  it("does not mutate the input", () => {
    sliceForRole(data, "anon");
    expect(data.holdings).toHaveLength(12);
    expect(data.alerts).toHaveLength(12);
  });

  it("tolerates objects without holdings or alerts", () => {
    expect(sliceForRole({}, "anon")).toEqual({});
  });
});
