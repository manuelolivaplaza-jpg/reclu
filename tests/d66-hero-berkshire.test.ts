import { describe, expect, it } from "vitest";
import { buildFeaturedHeroCards } from "@/lib/hero-featured";
import type { Portfolio } from "@/lib/types";

const p = (id: string, slug: string, name: string): Portfolio =>
  ({ id, slug, name, manager: null, followers: 1, category: "hedge_fund", cover_image: null, portrait_image: null, return_ytd: 10, premium: false } as unknown as Portfolio);

describe("D66: Berkshire usa la serie del 13F", () => {
  it("si la fila de catalogo no tiene serie, toma la del alias y enlaza a el", () => {
    const series = new Map([["b13", [{ date: "2026-08-01", value: 0 }, { date: "2026-09-01", value: 5 }]]]);
    const cards = buildFeaturedHeroCards([p("b", "berkshire-hathaway", "Berkshire Hathaway"), p("b13", "berkshire-hathaway-13f", "Berkshire Hathaway 13F")], series);
    expect(cards[0].name).toBe("Berkshire Hathaway");
    expect(cards[0].slug).toBe("berkshire-hathaway-13f");
    expect(cards[0].spark?.length).toBe(2);
    expect(cards[0].returnPct).toBe(5);
  });
});
