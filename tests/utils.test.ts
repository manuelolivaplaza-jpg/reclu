import { describe, it, expect } from "vitest";
import { formatCompact, formatPercent, timeAgo } from "@/lib/utils";

describe("formatCompact", () => {
  it("formats thousands with K", () => {
    expect(formatCompact(1_500)).toBe("1.5K");
    expect(formatCompact(999)).toBe("999");
  });

  it("formats millions with M", () => {
    expect(formatCompact(12_400_000)).toBe("12.4M");
  });

  it("formats billions with B", () => {
    expect(formatCompact(2_500_000_000)).toBe("2.5B");
  });

  it("keeps small numbers as-is", () => {
    expect(formatCompact(42)).toBe("42");
    expect(formatCompact(0)).toBe("0");
  });

  it("handles negatives", () => {
    expect(formatCompact(-1_500_000)).toBe("-1.5M");
  });
});

describe("formatPercent", () => {
  it("adds + sign for positive values", () => {
    expect(formatPercent(12.34)).toBe("+12.3%");
  });

  it("keeps - sign for negative values", () => {
    expect(formatPercent(-5.2)).toBe("-5.2%");
  });

  it("respects digit precision", () => {
    expect(formatPercent(3.14159, 2)).toBe("+3.14%");
  });

  it("handles zero", () => {
    expect(formatPercent(0)).toBe("0.0%");
  });
});

describe("timeAgo", () => {
  it("returns relative time in Spanish for recent dates", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const result = timeAgo(twoHoursAgo);
    expect(result).toContain("hora");
  });

  it("handles days", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    expect(timeAgo(threeDaysAgo)).toContain("día");
  });

  it("accepts ISO strings", () => {
    const iso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(timeAgo(iso)).toContain("hora");
  });
});
