import { describe, expect, it } from "vitest";
import { slimSpark, slimCardStats, toExploreCardPortfolio, SPARK_MAX_POINTS } from "@/lib/explore-slim";

describe("explore-slim", () => {
  it("limita a 60 puntos con 2 decimales", () => {
    const levels = Array.from({ length: 500 }, (_, i) => 1 + i / 1234.5678);
    const s = slimSpark(levels);
    expect(s.length).toBe(SPARK_MAX_POINTS);
    expect(s[0]).toBe(0);
    for (const v of s) expect(Math.round(v * 100) / 100).toBe(v);
  });
  it("omite stats vacíos", () => {
    const out = slimCardStats(["a", "b"], {
      a: { pct: null, label: "", spark: [], estimated: false, asOf: null },
      b: { pct: 12.3456, label: "desde ago 2024", spark: [1, 1.1, 1.2], estimated: true, asOf: "2026-01-01" },
    });
    expect(out.a).toBeUndefined();
    expect(out.b).toEqual({ pct: 12.35, label: "desde ago 2024", spark: [0, 10, 20], estimated: true });
  });
  it("solo campos dibujados", () => {
    const p = toExploreCardPortfolio({ id: "1", slug: "s", name: "N", description: "x".repeat(500), category: "model", source: "x", manager: null, country: "US", followers: 1, return_ytd: 1, premium: false, tags: ["a"], cover_image: null, created_at: "", updated_at: "" });
    expect(Object.keys(p).sort()).toEqual(["category", "country", "cover_image", "followers", "id", "name", "portrait_image", "premium", "slug"]);
  });
});