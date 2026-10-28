import { describe, expect, it } from "vitest";
import { cardStatFromSeries, clipSeriesForSlug } from "@/lib/card-series";
import { displayHoldings, displaySymbol, prettyCompanyName, sourceLabel } from "@/lib/holding-display";
import { formatPctPlain, formatSignedPct } from "@/lib/utils";

describe("D40 card-series", () => {
  it("sin serie no hay retorno ni sparkline", () => {
    expect(cardStatFromSeries("berkshire-hathaway", [])).toEqual({ pct: null, label: "", spark: [], estimated: false, asOf: null });
  });
  it("retorno y sparkline desde la serie real", () => {
    const st = cardStatFromSeries("ibit", [{ date: "2024-08-01", value: 0 }, { date: "2025-01-01", value: 20 }, { date: "2026-10-22", value: 37 }]);
    expect(st.pct).toBe(37);
    expect(st.label).toBe("desde ago 2024");
    expect(st.spark).toEqual([1, 1.2, 1.37]);
    expect(st.asOf).toBe("2026-10-22");
  });
  it("Trump dice cuenta desde el 07-08-2025", () => {
    const s = [{ date: "2025-03-01", value: -50 }, { date: "2025-08-07", value: 0 }, { date: "2026-10-22", value: 100 }];
    expect(clipSeriesForSlug("trump-dice", s).map((p) => p.date)).toEqual(["2025-08-07", "2026-10-22"]);
    expect(cardStatFromSeries("trump-dice", s).pct).toBe(100);
  });
});

describe("D40 holding-display", () => {
  it("Title Case y sin sufijos", () => {
    expect(prettyCompanyName("TESLA INC")).toBe("Tesla");
    expect(prettyCompanyName("ROBINHOOD MARKETS INC - A")).toBe("Robinhood Markets");
    expect(prettyCompanyName("Dell Technologies")).toBe("Dell Technologies");
    expect(prettyCompanyName("")).toBe("");
  });
  it("lado Corto/Largo consistente y nombre desde el mapa", () => {
    const rows = displayHoldings(
      [{ symbol: "BB", name: "Corto: BB" }, { symbol: "AMBA", name: "AMBA" }],
      new Map([["BB", "BLACKBERRY LTD"], ["AMBA", "Ambarella Inc"]]),
    );
    expect(rows.map((r) => [r.side, r.name])).toEqual([["Corto", "Blackberry"], ["Largo", "Ambarella"]]);
  });
  it("sin nombre conocido queda vacío (no inventa)", () => {
    expect(displayHoldings([{ symbol: "BE", name: "BE" }])[0].name).toBe("");
  });
  it("slug de Polymarket truncado", () => {
    const s = displaySymbol("will-bitcoin-dip-to-50000-by-december-31-2026");
    expect(s.length).toBeLessThanOrEqual(12);
    expect(s.endsWith("…")).toBe(true);
    expect(displaySymbol("NVDA")).toBe("NVDA");
  });
  it("etiqueta de fuente", () => {
    expect(sourceLabel("sec_13f")).toBe("SEC 13F");
    expect(sourceLabel("trump_mentions")).toBe("Menciones públicas de Donald Trump");
  });
});

describe("D40 formato es-CL", () => {
  it("coma decimal y signo tipográfico", () => {
    expect(formatPctPlain(46.4)).toBe("46,4%");
    expect(formatPctPlain(-6.5)).toBe("\u22126,5%");
    expect(formatSignedPct(59.4)).toBe("+59,4%");
  });
});
