import { describe, it, expect } from "vitest";
import { userHoldingSchema as holdingSchema } from "@/lib/validation";

/**
 * Test the validation schema used by saveUserHoldings (server action).
 */

describe("holdingSchema (mirrors saveUserHoldings)", () => {
  it("accepts a valid holding", () => {
    const result = holdingSchema.safeParse({ symbol: "AAPL", weight: 25 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe(""); // defaults to empty string
    }
  });

  it("rejects empty symbol", () => {
    expect(holdingSchema.safeParse({ symbol: "", weight: 10 }).success).toBe(false);
  });

  it("rejects negative weight", () => {
    expect(holdingSchema.safeParse({ symbol: "AAPL", weight: -5 }).success).toBe(false);
  });

  it("rejects weight over 100", () => {
    expect(holdingSchema.safeParse({ symbol: "AAPL", weight: 101 }).success).toBe(false);
  });

  it("rejects missing weight", () => {
    expect(holdingSchema.safeParse({ symbol: "AAPL" }).success).toBe(false);
  });

  it("acepta cantidad y costo promedio (F60)", () => {
    const result = holdingSchema.safeParse({
      symbol: "AAPL",
      quantity: 10,
      avg_cost: 150.5,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // Sin weight: el peso se calcula por valor de costo (cantidad × costo).
      expect(result.data.weight).toBeCloseTo(1505, 5);
      expect(result.data.currency).toBe("USD");
    }
  });

  it("acepta moneda CLP, mercado y corredora opcionales", () => {
    const result = holdingSchema.safeParse({
      symbol: "SQM-B",
      quantity: 100,
      avg_cost: 35000,
      currency: "CLP",
      market: "CL",
      broker: "Renta 4",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.market).toBe("CL");
      expect(result.data.broker).toBe("Renta 4");
    }
  });

  it("el weight explícito tiene prioridad sobre el valor de costo", () => {
    const result = holdingSchema.safeParse({
      symbol: "AAPL",
      weight: 12.5,
      quantity: 10,
      avg_cost: 100,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.weight).toBe(12.5);
  });

  it("rechaza cantidad o costo negativos", () => {
    expect(
      holdingSchema.safeParse({ symbol: "AAPL", quantity: -1, avg_cost: 100 }).success,
    ).toBe(false);
    expect(
      holdingSchema.safeParse({ symbol: "AAPL", quantity: 1, avg_cost: -100 }).success,
    ).toBe(false);
  });

  it("rechaza cantidad sin costo (no se puede valorar)", () => {
    expect(holdingSchema.safeParse({ symbol: "AAPL", quantity: 10 }).success).toBe(false);
  });

  it("solo acepta monedas y mercados conocidos", () => {
    expect(
      holdingSchema.safeParse({
        symbol: "AAPL",
        quantity: 1,
        avg_cost: 10,
        currency: "EUR",
      }).success,
    ).toBe(false);
    expect(
      holdingSchema.safeParse({
        symbol: "AAPL",
        quantity: 1,
        avg_cost: 10,
        market: "EU",
      }).success,
    ).toBe(false);
  });

  it("limita la corredora a 60 caracteres", () => {
    expect(
      holdingSchema.safeParse({
        symbol: "AAPL",
        quantity: 1,
        avg_cost: 10,
        broker: "x".repeat(61),
      }).success,
    ).toBe(false);
  });
});

describe("weight normalization logic", () => {
  it("normalizes arbitrary weights to sum 100", () => {
    const raw = [
      { symbol: "A", weight: 3 },
      { symbol: "B", weight: 1 },
    ];
    const total = raw.reduce((s, h) => s + h.weight, 0);
    const normalized = raw.map((h) => (h.weight / total) * 100);
    expect(normalized.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 5);
    expect(normalized[0]).toBeCloseTo(75, 5);
  });
});
