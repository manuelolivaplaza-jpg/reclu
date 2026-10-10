import { describe, it, expect } from "vitest";

/**
 * Test the alert change-detection logic used by the detect-changes edge
 * function (mirrors supabase/functions/detect-changes/index.ts).
 */
interface HoldingRow {
  weight: number;
  previous_weight: number | null;
}

function classifyChange(h: HoldingRow): { type: string; severity: string } | null {
  // BUGFIX: null previous_weight means the holding was just created (new
  // trade) — treat as a full-weight change, not as noise.
  const isNewHolding = h.previous_weight === null;
  const delta = isNewHolding ? h.weight : h.weight - h.previous_weight!;
  const absDelta = Math.abs(delta);
  if (!isNewHolding && absDelta < 0.5) return null; // ignore noise

  if (isNewHolding || h.previous_weight === 0) {
    return { type: "new_trade", severity: absDelta >= 5 ? "high" : "medium" };
  }
  if (h.weight === 0) {
    return { type: "sold_trade", severity: absDelta >= 5 ? "high" : "medium" };
  }
  return { type: "weight_change", severity: absDelta >= 5 ? "high" : absDelta >= 2 ? "medium" : "low" };
}

describe("alert change classification", () => {
  it("ignores sub-0.5pp noise", () => {
    expect(classifyChange({ weight: 10.2, previous_weight: 10.0 })).toBeNull();
  });

  it("classifies new trades (previous_weight = 0)", () => {
    const r = classifyChange({ weight: 3, previous_weight: 0 });
    expect(r?.type).toBe("new_trade");
    expect(r?.severity).toBe("medium");
  });

  it("classifies large new trades as high severity", () => {
    const r = classifyChange({ weight: 8, previous_weight: 0 });
    expect(r?.severity).toBe("high");
  });

  it("classifies full exits as sold_trade", () => {
    const r = classifyChange({ weight: 0, previous_weight: 12 });
    expect(r?.type).toBe("sold_trade");
    expect(r?.severity).toBe("high");
  });

  it("classifies weight changes by magnitude", () => {
    // Umbrales: >=5pp high, >=2pp medium, <2pp low
    expect(classifyChange({ weight: 8, previous_weight: 2 })?.severity).toBe("high");
    expect(classifyChange({ weight: 6, previous_weight: 3 })?.severity).toBe("medium");
    expect(classifyChange({ weight: 2.4, previous_weight: 1 })?.severity).toBe("low");
  });

  it("treats null previous_weight as a new trade", () => {
    const r = classifyChange({ weight: 5, previous_weight: null });
    expect(r?.type).toBe("new_trade");
  });
});
