import { describe, it, expect } from "vitest";
import { z } from "zod";

/**
 * Test the validation schema used by saveUserHoldings (server action).
 * Mirrors the zod schema in src/app/actions/holdings.ts.
 */
const holdingSchema = z.object({
  symbol: z.string().min(1).max(20),
  name: z.string().max(100).optional().default(""),
  weight: z.number().min(0).max(100),
});

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
