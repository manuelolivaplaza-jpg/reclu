import { describe, expect, it } from "vitest";
import {
  PAGE_SIZE,
  consensusFromRows,
  firstPage,
  hasMore,
  nextCount,
  portfolioIdsWithSymbol,
} from "@/lib/explore-paging";

describe("paginación de /explore", () => {
  const list = Array.from({ length: 40 }, (_, i) => i);
  it("primera página de PAGE_SIZE", () => {
    expect(firstPage(list)).toHaveLength(PAGE_SIZE);
    expect(firstPage([1, 2])).toEqual([1, 2]);
  });
  it("suma de a una página sin pasarse del total", () => {
    expect(nextCount(40, 18)).toBe(36);
    expect(nextCount(40, 36)).toBe(40);
    expect(hasMore(40, 36)).toBe(true);
    expect(hasMore(40, 40)).toBe(false);
  });
});

describe("consenso con una sola consulta", () => {
  const rows = [
    { portfolio_id: "a", symbol: "NVDA" },
    { portfolio_id: "a", symbol: "nvda " },
    { portfolio_id: "b", symbol: "NVDA" },
    { portfolio_id: "b", symbol: "AAPL" },
    { portfolio_id: "c", symbol: "" },
  ];
  it("cuenta carteras distintas por símbolo", () => {
    expect(consensusFromRows(rows)).toEqual([
      { symbol: "NVDA", count: 2 },
      { symbol: "AAPL", count: 1 },
    ]);
  });
  it("filtra ids por símbolo", () => {
    expect([...portfolioIdsWithSymbol(rows, "AAPL")]).toEqual(["b"]);
  });
});
