import { describe, expect, it } from "vitest";
import {
  INSIDER_BACKTEST,
  INSIDER_DISCLAIMER,
  filingHref,
  formatIsoDate,
  formatSignedPct,
  formatUsd,
  holdingsAtLatestAsOf,
  ownerRoleLabel,
  toInsiderTrade,
} from "@/lib/insider-queries";

describe("holdingsAtLatestAsOf", () => {
  it("se queda con la fila más reciente de cada símbolo", () => {
    const book = holdingsAtLatestAsOf([
      { symbol: "ttd", as_of: "2026-03-01", weight: 50 },
      { symbol: "TTD", as_of: "2026-10-19", weight: 40 },
      { symbol: "KKR", as_of: "2026-10-18T23:00:00Z", weight: 30 },
      { symbol: "KKR", as_of: "2026-10-19", weight: 60 },
      { symbol: " ", as_of: "2026-10-19", weight: 99 },
    ]);
    expect(book.map((row) => `${row.symbol}:${row.as_of}:${row.weight}`)).toEqual([
      "KKR:2026-10-19:60",
      "TTD:2026-10-19:40",
    ]);
  });

  it("devuelve vacío si no hay filas", () => {
    expect(holdingsAtLatestAsOf([])).toEqual([]);
  });
});

describe("toInsiderTrade", () => {
  it("no copia la dirección aunque venga en la fila", () => {
    const trade = toInsiderTrade({
      id: "1",
      symbol: "TTD",
      owner_name: "Jeff Green",
      owner_title: "Chief Executive Officer",
      is_director: true,
      is_officer: true,
      trans_date: "2026-03-02",
      filed_at: "2026-03-04",
      code: "P",
      value_usd: "148101266",
      source_url: "https://www.sec.gov/Archives/edgar/data/1671933/example.xml",
      rptOwnerStreet1: "123 Market Street",
      rptOwnerCity: "Los Angeles",
      rptOwnerState: "CA",
      rptOwnerZipCode: "90001",
    });
    expect(trade).not.toBeNull();
    const serialized = JSON.stringify(trade);
    expect(serialized).not.toContain("Market");
    expect(serialized).not.toContain("Los Angeles");
    expect(serialized).not.toContain("90001");
    expect(trade?.valueUsd).toBe(148101266);
    expect(trade?.code).toBe("P");
  });

  it("rechaza un código que no es P ni S", () => {
    expect(
      toInsiderTrade({
        id: "1",
        symbol: "TTD",
        owner_name: "Jeff Green",
        trans_date: "2026-03-02",
        filed_at: "2026-03-04",
        code: "M",
        source_url: "https://www.sec.gov/Archives/example",
      }),
    ).toBeNull();
  });
});

describe("formato y aviso", () => {
  it("formatea montos, fechas y el cargo", () => {
    expect(formatUsd(148101266)).toBe("US$148.101.266");
    expect(formatUsd(null)).toBe("—");
    expect(formatSignedPct(-1.8)).toBe("-1,80%");
    expect(formatSignedPct(8.11)).toBe("+8,11%");
    expect(formatIsoDate("2026-10-16")).toBe("16 oct 2026");
    expect(ownerRoleLabel({ ownerTitle: null, isDirector: true, isOfficer: false })).toBe("Director");
  });

  it("solo acepta enlaces https", () => {
    expect(filingHref("https://www.sec.gov/Archives/edgar/data/1/a.xml")).toContain("sec.gov");
    expect(filingHref("http://www.sec.gov/Archives/a.xml")).toBeNull();
    expect(filingHref("javascript:alert(1)")).toBeNull();
  });

  it("publica el backtest honesto y el aviso fijo", () => {
    expect(INSIDER_DISCLAIMER).toBe(
      "Simulación histórica con fines informativos. No es recomendación de inversión.",
    );
    expect(INSIDER_BACKTEST.events).toBe(270);
    expect(INSIDER_BACKTEST.excluded).toBe(112);
    expect(INSIDER_BACKTEST.avgPct).toBe(-1.8);
    expect(INSIDER_BACKTEST.medianPct).toBe(-5.45);
    expect(INSIDER_BACKTEST.spyAvgPct).toBe(8.11);
    expect(INSIDER_BACKTEST.beatSpy).toBe(88);
    expect(INSIDER_BACKTEST.priceAsOf).toBe("2026-10-16");
    expect(INSIDER_BACKTEST.runOn).toBe("2026-10-19");
    expect(INSIDER_BACKTEST.valueUsd).toBe(265131);
    expect(INSIDER_BACKTEST.spyValueUsd).toBe(291908);
  });
});
