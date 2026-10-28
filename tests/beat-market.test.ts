import { describe, expect, it } from "vitest";
import { beatMarketRowsFromMetrics, sortBeatMarket } from "@/lib/performance-queries";

describe("beat market cacheado (D42)", () => {
  const pfs = [
    { id: "a", slug: "a", name: "A", premium: false },
    { id: "b", slug: "b", name: "B", premium: true },
    { id: "c", slug: "c", name: "C", premium: false },
  ];
  const metrics = [
    { portfolio_id: "a", period: "TOTAL", as_of: "2026-10-01", return_pct: 5, benchmark_return_pct: 4 },
    { portfolio_id: "a", period: "TOTAL", as_of: "2026-10-20", return_pct: 12, benchmark_return_pct: 10, sharpe: 1.2 },
    { portfolio_id: "a", period: "YTD", as_of: "2026-10-21", return_pct: 99, benchmark_return_pct: 1 },
    { portfolio_id: "b", period: "TOTAL", as_of: "2026-10-20", return_pct: 30, benchmark_return_pct: 10 },
    { portfolio_id: "c", period: "TOTAL", as_of: "2026-10-20", return_pct: null, benchmark_return_pct: 10 },
  ];

  it("usa la ultima metrica TOTAL por portafolio y marca premium", () => {
    const rows = beatMarketRowsFromMetrics(pfs, metrics);
    expect(rows.map((r) => [r.slug, r.excess_return_pct, r.premium])).toEqual([["a", 2, false], ["b", 20, true]]);
  });

  it("ordena por exceso", () => {
    const rows = beatMarketRowsFromMetrics(pfs, metrics);
    expect(sortBeatMarket(rows, "excess").map((r) => r.slug)).toEqual(["b", "a"]);
  });
});
