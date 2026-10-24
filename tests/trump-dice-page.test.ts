import { describe, expect, it } from "vitest";
import { returnSince, totalFromPct } from "@/lib/trump-dice-page";

describe("trump dice page", () => {
  it("retorno desde el primer cierre >= fecha", () => {
    const r = returnSince([{ date: "2025-08-05", close: 50 }, { date: "2025-08-07", close: 100 }, { date: "2025-09-01", close: 125 }], "2025-08-06");
    expect(r.pct).toBe(25);
    expect(r.baseDate).toBe("2025-08-07");
    expect(r.spark).toEqual([1, 1.25]);
  });
  it("sin precios no inventa", () => expect(returnSince([], "2025-08-06").pct).toBeNull());
  it("total desde value_pct", () => {
    expect(totalFromPct([{ date: "2025-08-01", value: 99 }, { date: "2025-08-06", value: 0 }, { date: "2026-10-22", value: 254.3 }], "2025-08-06")).toBe(254.3);
  });
});
