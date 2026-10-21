import { describe, expect, it } from "vitest";
import {
  resolveHoldingsEntry,
  roundWeightsTo100,
  type HoldingEntryRow,
} from "@/lib/holdings-entry";

/**
 * F78: conversión pura de cantidad de acciones, monto y porcentaje.
 * Los precios llegan ya resueltos desde `prices`; aquí solo se prueba la
 * aritmética, la moneda y los errores.
 */

function row(overrides: Partial<HoldingEntryRow>): HoldingEntryRow {
  return { symbol: "AAA", ...overrides };
}

describe("porcentaje", () => {
  it("normaliza pesos a 100 y conserva la cantidad si viene", () => {
    const result = resolveHoldingsEntry("percentage", [
      row({ symbol: "AAPL", percentage: 30, shares: 2, avg_cost: 100 }),
      row({ symbol: "MSFT", percentage: 10 }),
    ]);

    expect(result.errors).toEqual([]);
    expect(result.holdings.map((h) => h.weight)).toEqual([75, 25]);
    expect(result.holdings[0].quantity).toBe(2);
    expect(result.holdings[0].avg_cost).toBe(100);
    expect(result.holdings[0].currency).toBe("USD");
    expect(result.baseCurrency).toBeNull();
  });

  it("no exige precio ni tipo de cambio", () => {
    const result = resolveHoldingsEntry("percentage", [
      row({ symbol: "AAPL", percentage: 50, currency: "USD" }),
      row({ symbol: "SQM-B", percentage: 50, currency: "CLP" }),
    ]);

    expect(result.errors).toEqual([]);
    expect(result.holdings.map((h) => h.currency)).toEqual(["USD", "CLP"]);
    expect(result.usesFx).toBe(false);
  });

  it("rechaza un peso en cero", () => {
    const result = resolveHoldingsEntry("percentage", [
      row({ symbol: "AAPL", percentage: 100 }),
      row({ symbol: "MSFT", percentage: 0 }),
    ]);

    expect(result.holdings).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].symbol).toBe("MSFT");
    expect(result.errors[0].message).toMatch(/porcentaje/i);
  });
});

describe("cantidad de acciones", () => {
  it("peso = cantidad × precio / total y conserva la cantidad", () => {
    const result = resolveHoldingsEntry("shares", [
      row({ symbol: "AAPL", shares: 10, price: 100, priceCurrency: "USD" }),
      row({ symbol: "MSFT", shares: 5, price: 200, priceCurrency: "USD" }),
    ]);

    expect(result.errors).toEqual([]);
    expect(result.holdings[0].weight).toBe(50);
    expect(result.holdings[1].weight).toBe(50);
    expect(result.holdings[0].quantity).toBe(10);
    expect(result.holdings[0].currency).toBe("USD");
    expect(result.baseCurrency).toBe("USD");
  });

  it("falla por símbolo cuando no hay precio y no resuelve nada", () => {
    const result = resolveHoldingsEntry("shares", [
      row({ symbol: "AAPL", shares: 10, price: 100 }),
      row({ symbol: "NOPRICE", shares: 5, price: null }),
    ]);

    expect(result.holdings).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].symbol).toBe("NOPRICE");
    expect(result.errors[0].message).toMatch(/no hay precio/i);
  });

  it("acepta acciones fraccionarias", () => {
    const result = resolveHoldingsEntry("shares", [
      row({ symbol: "AAPL", shares: 0.5, price: 100 }),
      row({ symbol: "MSFT", shares: 0.5, price: 300 }),
    ]);

    expect(result.errors).toEqual([]);
    expect(result.holdings[0].quantity).toBe(0.5);
    expect(result.holdings[0].weight).toBe(25);
    expect(result.holdings[1].weight).toBe(75);
  });
});

describe("monto en dinero", () => {
  it("cantidad = monto / precio y peso = monto / total", () => {
    const result = resolveHoldingsEntry("amount", [
      row({ symbol: "AAPL", amount: 1500, price: 150, priceCurrency: "USD" }),
      row({ symbol: "MSFT", amount: 500, price: 250, priceCurrency: "USD" }),
    ]);

    expect(result.errors).toEqual([]);
    expect(result.holdings[0].quantity).toBe(10);
    expect(result.holdings[1].quantity).toBe(2);
    expect(result.holdings[0].weight).toBe(75);
    expect(result.holdings[1].weight).toBe(25);
  });

  it("mantiene decimales en la cantidad", () => {
    const result = resolveHoldingsEntry("amount", [
      row({ symbol: "BRK.A", amount: 100, price: 300 }),
    ]);

    expect(result.holdings[0].quantity).toBeCloseTo(0.333333, 6);
    expect(result.holdings[0].weight).toBe(100);
  });

  it("no inventa costo promedio si no viene", () => {
    const result = resolveHoldingsEntry("amount", [
      row({ symbol: "AAPL", amount: 100, price: 50 }),
    ]);

    expect(result.holdings[0].avg_cost).toBeUndefined();
  });
});

describe("monedas", () => {
  const rows = [
    row({ symbol: "AAPL", amount: 100, price: 100, priceCurrency: "USD" }),
    row({ symbol: "SQM-B", amount: 95000, price: 950, priceCurrency: "CLP" }),
  ];

  // Montos solo en USD (decision de Manu): la mezcla USD/CLP solo puede
  // aparecer en modo acciones.
  const sharesRows = [
    row({ symbol: "AAPL", shares: 1, price: 100, priceCurrency: "USD" }),
    row({ symbol: "SQM-B", shares: 100, price: 950, priceCurrency: "CLP" }),
  ];

  it("modo monto rechaza la accion chilena en vez de pedir tipo de cambio", () => {
    const result = resolveHoldingsEntry("amount", rows);
    expect(result.holdings).toEqual([]);
    expect(result.errors.some((e) => /acciones chilenas/i.test(e.message))).toBe(true);
  });

  it("rechaza mezclar USD y CLP sin tipo de cambio", () => {
    const result = resolveHoldingsEntry("shares", sharesRows);

    expect(result.holdings).toEqual([]);
    expect(result.errors[0].symbol).toBe("*");
    expect(result.errors[0].message).toMatch(/tipo de cambio/i);
    expect(result.errors[0].message).toMatch(/sin mezclar monedas/i);
  });

  it("convierte con CLP por USD cuando se entrega el tipo de cambio", () => {
    const result = resolveHoldingsEntry("shares", sharesRows, { fx: 950 });

    expect(result.errors).toEqual([]);
    expect(result.usesFx).toBe(true);
    expect(result.baseCurrency).toBe("USD");
    // 100 USD y 95.000 CLP / 950 = 100 USD: mitad y mitad.
    expect(result.holdings[0].weight).toBe(50);
    expect(result.holdings[1].weight).toBe(50);
    expect(result.holdings[1].currency).toBe("CLP");
  });

  it("usa la moneda del precio aunque el usuario declare otra", () => {
    const result = resolveHoldingsEntry("shares", [
      row({
        symbol: "SQM-B",
        shares: 1,
        price: 950,
        priceCurrency: "CLP",
        currency: "USD",
      }),
    ]);

    expect(result.holdings[0].currency).toBe("CLP");
  });

  it("sin moneda de precio cae a la moneda de la posición", () => {
    const result = resolveHoldingsEntry("shares", [
      row({ symbol: "SQM-B", shares: 1, price: 950, currency: "CLP" }),
    ]);

    expect(result.holdings[0].currency).toBe("CLP");
  });
});

describe("redondeo estable", () => {
  it("tres tercios suman exactamente 100 con dos decimales", () => {
    const weights = roundWeightsTo100([1, 1, 1]);
    expect(weights).toEqual([33.34, 33.33, 33.33]);
    expect(weights.reduce((sum, value) => sum + value, 0)).toBeCloseTo(100, 10);
  });

  it("reparte el residuo por mayor fracción y mantiene el orden", () => {
    const weights = roundWeightsTo100([1, 2, 3, 4]);
    // 10, 20, 30, 40 exactos.
    expect(weights).toEqual([10, 20, 30, 40]);
  });

  it("valores sin sentido dan pesos en cero", () => {
    expect(roundWeightsTo100([0, -1, Number.NaN])).toEqual([0, 0, 0]);
  });

  it("los pesos de cantidad también suman 100", () => {
    const result = resolveHoldingsEntry("shares", [
      row({ symbol: "A", shares: 1, price: 100 }),
      row({ symbol: "B", shares: 1, price: 100 }),
      row({ symbol: "C", shares: 1, price: 100 }),
    ]);
    const sum = result.holdings.reduce((total, h) => total + h.weight, 0);
    expect(sum).toBeCloseTo(100, 10);
    expect(result.holdings.map((h) => h.weight)).toEqual([33.34, 33.33, 33.33]);
  });
});

describe("validaciones de cartera", () => {
  it("rechaza una cartera vacía", () => {
    const result = resolveHoldingsEntry("shares", []);
    expect(result.errors[0].message).toMatch(/al menos una posición/i);
  });

  it("rechaza símbolos repetidos sin distinguir mayúsculas", () => {
    const result = resolveHoldingsEntry("shares", [
      row({ symbol: "aapl", shares: 1, price: 100 }),
      row({ symbol: "AAPL", shares: 2, price: 100 }),
    ]);

    expect(result.holdings).toEqual([]);
    expect(result.errors[0].message).toMatch(/repetido/i);
  });
});
