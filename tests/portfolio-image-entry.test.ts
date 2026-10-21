import { describe, expect, it } from "vitest";
import { detectedToEntryRows } from "@/lib/portfolio-image-entry";

const p = (symbol: string, q: number | null, a: number | null, w: number | null, c: "USD" | "CLP" | null = null) => ({
  symbol,
  quantity: q,
  amount: a,
  weight: w,
  currency: c,
});

describe("detectedToEntryRows (F79 + F78)", () => {
  it("con cantidades en todas usa el modo acciones", () => {
    const out = detectedToEntryRows([p("AAPL", 10, null, null), p("SQM-B", 5, null, null, "CLP")]);
    expect(out.mode).toBe("shares");
    expect(out.rows[0].values.shares).toBe(10);
    expect(out.rows[1].currency).toBe("CLP");
    expect(out.rows[1].market).toBe("CL");
  });

  it("con montos en todas usa el modo monto", () => {
    const out = detectedToEntryRows([p("AAPL", null, 1000, null), p("MSFT", null, 500, null)]);
    expect(out.mode).toBe("amount");
    expect(out.rows.map((r) => r.values.amount)).toEqual([1000, 500]);
  });

  it("si es mixto cae a porcentaje que suma 100", () => {
    const out = detectedToEntryRows([p("AAPL", 10, null, null), p("MSFT", null, null, 30)]);
    expect(out.mode).toBe("percentage");
    const total = out.rows.reduce((s, r) => s + (r.values.percentage ?? 0), 0);
    expect(Math.round(total)).toBe(100);
  });
});
