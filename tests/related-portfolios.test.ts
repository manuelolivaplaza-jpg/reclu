import { describe, expect, it } from "vitest";
import {
  RELATED_PORTFOLIOS_LIMIT,
  RELATED_TICKERS_LIMIT,
  openPortfolioTickers,
  relatedPortfolios,
  relatedTickers,
} from "@/lib/related-portfolios";
import type { Portfolio, PortfolioCategory } from "@/lib/types";

function portfolio(
  slug: string,
  category: PortfolioCategory,
  followers: number,
  name = slug,
): Portfolio {
  return {
    id: `id-${slug}`,
    slug,
    name,
    description: "",
    category,
    source: "test",
    manager: null,
    country: "US",
    followers,
    return_ytd: null,
    premium: false,
    tags: [],
    cover_image: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

const CATALOG: Portfolio[] = [
  portfolio("berkshire-hathaway", "hedge_fund", 999),
  portfolio("scion-asset-management", "hedge_fund", 900),
  portfolio("scion-13f", "hedge_fund", 60),
  portfolio("duquesne-family-office", "hedge_fund", 800),
  portfolio("duquesne-13f", "hedge_fund", 50),
  portfolio("bridgewater-all-weather", "hedge_fund", 700),
  portfolio("bridgewater-13f", "hedge_fund", 40),
  portfolio("mubadala-sovereign", "hedge_fund", 600),
  portfolio("pershing-square", "hedge_fund", 30),
  portfolio("pelosi-tracker", "political_us", 5000),
];

describe("portafolios relacionados", () => {
  const related = relatedPortfolios("berkshire-hathaway", "hedge_fund", CATALOG);

  it("misma categoría, sin el actual y sin slugs viejos", () => {
    expect(related).toHaveLength(RELATED_PORTFOLIOS_LIMIT);
    expect(related.map((p) => p.slug)).not.toContain("berkshire-hathaway");
    expect(related.every((p) => p.category === "hedge_fund")).toBe(true);
    for (const legacy of [
      "scion-asset-management",
      "duquesne-family-office",
      "bridgewater-all-weather",
      "mubadala-sovereign",
    ]) {
      expect(related.map((p) => p.slug)).not.toContain(legacy);
    }
  });

  it("ordena por seguidores y recorta a 4", () => {
    expect(related.map((p) => p.slug)).toEqual([
      "scion-13f",
      "duquesne-13f",
      "bridgewater-13f",
      "pershing-square",
    ]);
  });

  it("reconoce el slug viejo del propio portafolio por su canónico", () => {
    const desdeViejo = relatedPortfolios("scion-asset-management", "hedge_fund", CATALOG);
    expect(desdeViejo.map((p) => p.slug)).not.toContain("scion-13f");
    expect(desdeViejo.map((p) => p.slug)).not.toContain("scion-asset-management");
    expect(desdeViejo).toHaveLength(RELATED_PORTFOLIOS_LIMIT);
  });

  it("sin categoría no hay bloque", () => {
    expect(relatedPortfolios("berkshire-hathaway", null, CATALOG)).toEqual([]);
    expect(relatedPortfolios("berkshire-hathaway", "model", CATALOG)).toEqual([]);
  });

  it("sin catálogo tampoco", () => {
    expect(relatedPortfolios("berkshire-hathaway", "hedge_fund", [])).toEqual([]);
  });
});

describe("acciones más seguidas", () => {
  it("hasta 8 símbolos, en MAYÚSCULAS, por consenso y sin duplicados", () => {
    const known = [
      { symbol: "nvda", portfolioCount: 4 },
      { symbol: " NVDA ", portfolioCount: 6 },
      { symbol: "AAPL", portfolioCount: 5 },
      { symbol: "SQM-B", portfolioCount: 2 },
      { symbol: "", portfolioCount: 9 },
      { symbol: "   ", portfolioCount: 9 },
      { symbol: "MSFT", portfolioCount: 3 },
      { symbol: "GOOGL", portfolioCount: 1 },
      { symbol: "AMZN", portfolioCount: 1 },
      { symbol: "META", portfolioCount: 1 },
      { symbol: "TSLA", portfolioCount: 1 },
      { symbol: "BRK.B", portfolioCount: 1 },
    ];

    const symbols = relatedTickers(known);

    expect(symbols).toHaveLength(RELATED_TICKERS_LIMIT);
    expect(symbols.slice(0, 4)).toEqual(["NVDA", "AAPL", "MSFT", "SQM-B"]);
    expect(new Set(symbols).size).toBe(symbols.length);
    expect(symbols).not.toContain("");
  });

  it("nunca usa las posiciones de un portafolio cerrado", () => {
    const known = [{ symbol: "NVDA", portfolioCount: 3 }];
    const posicionesCerradas = [{ symbol: "AAPL" }, { symbol: "PLTR" }];

    // El portafolio actual es un 13F: sus posiciones no se pueden enlazar.
    expect(openPortfolioTickers({ category: "hedge_fund" }, posicionesCerradas)).toEqual([]);
    expect(openPortfolioTickers({ category: "political_us" }, posicionesCerradas)).toEqual([]);
    // Y la lista global tampoco las incorpora por su cuenta.
    expect(relatedTickers(known)).toEqual(["NVDA"]);
  });

  it("sí usa las posiciones de una cartera abierta a anónimos", () => {
    expect(openPortfolioTickers({ category: "broker_cl" }, [{ symbol: "sqm-b " }, { symbol: "COPEC" }])).toEqual([
      "SQM-B",
      "COPEC",
    ]);
    // Sin holdings o sin portafolio no hay nada que enlazar.
    expect(openPortfolioTickers({ category: "broker_cl" }, [])).toEqual([]);
    expect(openPortfolioTickers(null, [{ symbol: "COPEC" }])).toEqual([]);
  });
});
