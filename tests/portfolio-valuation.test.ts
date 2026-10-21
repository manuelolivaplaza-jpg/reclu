import { describe, expect, it } from "vitest";
import {
  normalizeCurrency,
  valuatePortfolio,
  type PositionValuationInput,
} from "@/lib/portfolio-valuation";

describe("valorización de Mi portafolio", () => {
  it("calcula valor, P&L y peso con precio y costo", () => {
    const { positions, totals } = valuatePortfolio([
      { symbol: "aapl", quantity: 10, avgCost: 100, price: 150, currency: "USD" },
      { symbol: "MSFT", quantity: 5, avgCost: 200, price: 300, currency: "USD" },
    ]);

    const apple = positions[0];
    expect(apple.symbol).toBe("AAPL");
    expect(apple.value).toBe(1500);
    expect(apple.costBasis).toBe(1000);
    expect(apple.pnl).toBe(500);
    expect(apple.pnlPct).toBeCloseTo(50, 6);
    expect(apple.weightPct).toBeCloseTo(50, 6);

    expect(totals).toHaveLength(1);
    expect(totals[0]).toMatchObject({
      currency: "USD",
      totalValue: 3000,
      totalCost: 2000,
      pnl: 1000,
      pricedPositions: 2,
      missingPrices: 0,
    });
    expect(totals[0].pnlPct).toBeCloseTo(50, 6);
  });

  it("sin precio: valor, P&L y peso null y cuenta la posición", () => {
    const { positions, totals } = valuatePortfolio([
      { symbol: "AAPL", quantity: 10, avgCost: 100, price: null, currency: "USD" },
      { symbol: "MSFT", quantity: 5, avgCost: 200, price: 100, currency: "USD" },
    ]);

    expect(positions[0].price).toBeNull();
    expect(positions[0].priceDate).toBeNull();
    expect(positions[0].value).toBeNull();
    expect(positions[0].pnl).toBeNull();
    expect(positions[0].pnlPct).toBeNull();
    expect(positions[0].weightPct).toBeNull();

    expect(totals[0].missingPrices).toBe(1);
    expect(totals[0].pricedPositions).toBe(1);
    // El total solo suma lo que se conoce.
    expect(totals[0].totalValue).toBe(500);
    expect(positions[1].weightPct).toBeCloseTo(100, 6);
  });

  it("un precio 0 o negativo se trata como sin precio", () => {
    const { positions } = valuatePortfolio([
      { symbol: "AAA", quantity: 1, avgCost: 1, price: 0, currency: "USD" },
      { symbol: "BBB", quantity: 1, avgCost: 1, price: -3, currency: "USD" },
    ]);
    expect(positions.map((position) => position.price)).toEqual([null, null]);
    expect(positions.map((position) => position.value)).toEqual([null, null]);
  });

  it("CLP y USD no se convierten ni se suman: totales por moneda", () => {
    const { totals } = valuatePortfolio([
      { symbol: "AAPL", quantity: 2, avgCost: 100, price: 120, currency: "USD" },
      { symbol: "CMPC", quantity: 100, avgCost: 1500, price: 1800, currency: "CLP" },
    ]);

    expect(totals.map((total) => total.currency)).toEqual(["USD", "CLP"]);
    expect(totals[0].totalValue).toBe(240);
    expect(totals[1].totalValue).toBe(180_000);
    // Nunca hay un total mezclado.
    expect(totals).toHaveLength(2);
  });

  it("costo 0: P&L absoluto igual al valor y P&L % null", () => {
    const { positions, totals } = valuatePortfolio([
      { symbol: "FREE", quantity: 10, avgCost: 0, price: 25, currency: "USD" },
    ]);

    expect(positions[0].costBasis).toBe(0);
    expect(positions[0].pnl).toBe(250);
    expect(positions[0].pnlPct).toBeNull();
    expect(totals[0].pnl).toBe(250);
    expect(totals[0].pnlPct).toBeNull();
  });

  it("sin costo promedio hay valor pero P&L null", () => {
    const { positions, totals } = valuatePortfolio([
      { symbol: "NOCST", quantity: 4, avgCost: null, price: 10, currency: "USD" },
    ]);

    expect(positions[0].value).toBe(40);
    expect(positions[0].costBasis).toBeNull();
    expect(positions[0].pnl).toBeNull();
    expect(positions[0].pnlPct).toBeNull();
    expect(totals[0].totalValue).toBe(40);
    expect(totals[0].pnl).toBe(0);
    expect(totals[0].pnlPct).toBeNull();
  });

  it("sin cantidad no hay valor ni costo", () => {
    const { positions } = valuatePortfolio([
      { symbol: "PESO", quantity: null, avgCost: 10, price: 20, currency: "USD" },
    ]);
    expect(positions[0].quantity).toBeNull();
    expect(positions[0].value).toBeNull();
    expect(positions[0].costBasis).toBeNull();
    expect(positions[0].pnl).toBeNull();
  });

  it("normaliza moneda: desconocida cae a USD y acepta minúsculas", () => {
    expect(normalizeCurrency("clp")).toBe("CLP");
    expect(normalizeCurrency(" usd ")).toBe("USD");
    expect(normalizeCurrency("EUR")).toBe("USD");
    expect(normalizeCurrency(null)).toBe("USD");
  });

  it("una cartera vacía no inventa totales", () => {
    const valuation = valuatePortfolio([]);
    expect(valuation.positions).toEqual([]);
    expect(valuation.totals).toEqual([]);
  });

  it("acepta el tipo de entrada de la página", () => {
    const rows: PositionValuationInput[] = [
      { symbol: "AAA", quantity: 1, avgCost: 2, price: 3, currency: "CLP" },
    ];
    expect(valuatePortfolio(rows).positions[0].pnl).toBe(1);
  });
});
