import { describe, expect, it } from "vitest";
import { buildFeaturedHeroCards, cumulativeFromPct, monthYear, sparkline } from "@/lib/hero-featured";
import type { Portfolio } from "@/lib/types";

const base = { premium: false, followers: 10, manager: null, category: "thematic", cover_image: null, portrait_image: null, return_ytd: null } as unknown as Portfolio;
const P = (id: string, slug: string, extra: Partial<Portfolio> = {}) => ({ ...base, id, slug, name: slug, ...extra }) as Portfolio;

describe("hero destacado", () => {
  it("acumulado desde value_pct", () => {
    expect(cumulativeFromPct([{ date: "2025-01-01", value: 0 }, { date: "2026-01-01", value: 254.3 }])).toBe(254.3);
    expect(cumulativeFromPct([{ date: "2025-01-01", value: 10 }, { date: "2026-01-01", value: 21 }])).toBe(10);
    expect(cumulativeFromPct([{ date: "2025-01-01", value: 10 }])).toBeNull();
  });
  it("mes y año", () => expect(monthYear("2025-08-06")).toBe("ago 2025"));
  it("sparkline", () => expect(sparkline([{ date: "a", value: 0 }, { date: "b", value: 100 }], 3)).toEqual([1, 2]));
  it("orden Berkshire, Trump (destacado), IBIT y fallback YTD", () => {
    const ps = [P("3", "ibit", { return_ytd: 5 } as Partial<Portfolio>), P("1", "berkshire-hathaway"), P("2", "trump-dice")];
    const s = new Map([["2", [{ date: "2025-08-06", value: 0 }, { date: "2026-10-22", value: 254.3 }]], ["1", [{ date: "2024-09-01", value: 0 }, { date: "2026-10-22", value: 20 }]]]);
    const cards = buildFeaturedHeroCards(ps, s);
    expect(cards.map((c) => c.slug)).toEqual(["berkshire-hathaway", "trump-dice", "ibit"]);
    expect(cards[1].featured).toBe(true);
    expect(cards[1].periodLabel).toBe("desde ago 2025");
    expect(cards[2].periodLabel).toBe("YTD");
  });
  it("sin serie ni YTD no inventa", () => {
    expect(buildFeaturedHeroCards([P("1", "berkshire-hathaway")], new Map())).toEqual([]);
  });
});
