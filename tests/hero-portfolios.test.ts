import { describe, expect, it } from "vitest";
import { buildHeroCards, pickHeroPortfolios } from "@/lib/hero-portfolios";
import type { Portfolio } from "@/lib/types";

function p(over: Partial<Portfolio>): Portfolio {
  return {
    id: over.slug ?? "x", slug: "x", name: "X", description: "", category: "politicians" as Portfolio["category"],
    source: "s", manager: null, country: "US", followers: 0, return_ytd: 10, premium: false, tags: [],
    cover_image: null, created_at: "", updated_at: "", ...over,
  };
}

describe("pickHeroPortfolios", () => {
  it("excluye premium y sin return_ytd, ordena por seguidores", () => {
    const out = pickHeroPortfolios([
      p({ slug: "a", name: "A", followers: 5 }),
      p({ slug: "b", name: "B", followers: 50, premium: true }),
      p({ slug: "c", name: "C", followers: 9, return_ytd: null }),
      p({ slug: "d", name: "D", followers: 20 }),
    ]);
    expect(out.map((c) => c.slug)).toEqual(["d", "a"]);
    expect(out.every((c) => !c.isExample)).toBe(true);
  });
  it("no inyecta ejemplos inventados cuando hay menos de 3 portafolios reales", () => {
    const out = buildHeroCards([p({ slug: "a" })]);
    expect(out).toHaveLength(1);
    expect(out[0].slug).toBe("a");
    expect(out[0].isExample).toBe(false);
  });
});
