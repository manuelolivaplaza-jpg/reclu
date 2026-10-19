import { describe, it, expect } from "vitest";
import {
  buildShoppingList,
  shoppingListToCsv,
  MINIMUM_NOTICE,
  BROKER_MINIMUMS,
} from "@/lib/replicate";
import type { Holding } from "@/lib/types";

function holding(partial: Partial<Holding> & Pick<Holding, "symbol" | "weight">): Holding {
  return {
    id: partial.symbol,
    portfolio_id: "p1",
    name: partial.symbol,
    previous_weight: null,
    asset_class: "equity",
    exchange: null,
    currency: "USD",
    as_of: "2026-01-01",
    price_at_disclosure: null,
    price_current: null,
    return_pct: null,
    ...partial,
    symbol: partial.symbol,
    weight: partial.weight,
  };
}

describe("buildShoppingList", () => {
  it("reparte el monto según el peso (pesos que suman 100)", () => {
    const list = buildShoppingList(
      [
        holding({ symbol: "AAA", weight: 60, price_current: 100, currency: "USD" }),
        holding({ symbol: "BBB", weight: 40, price_current: 50, currency: "USD" }),
      ],
      1_000,
      "USD",
      950,
    );

    // 600 / 100 = 6 acciones; 400 / 50 = 8 acciones
    expect(list.items[0].shares).toBe(6);
    expect(list.items[1].shares).toBe(8);
    expect(list.invertido).toBe(1_000);
    expect(list.restante).toBe(0);
    expect(list.sinPrecio).toBe(0);
  });

  it("normaliza los pesos de las posiciones visibles (top 5 de anónimo)", () => {
    // Solo se ven 2 posiciones que suman 50 de peso: se replica todo el monto.
    const list = buildShoppingList(
      [
        holding({ symbol: "AAA", weight: 30, price_current: 10 }),
        holding({ symbol: "BBB", weight: 20, price_current: 10 }),
      ],
      1_000,
      "USD",
      950,
    );

    expect(list.items[0].targetWeight).toBe(60);
    expect(list.items[1].targetWeight).toBe(40);
    expect(list.items[0].shares).toBe(60);
    expect(list.items[1].shares).toBe(40);
  });

  it("convierte CLP a activos en USD usando el tipo de cambio", () => {
    // 950.000 CLP / 950 = 1.000 USD; 1.000 / 100 = 10 acciones.
    const list = buildShoppingList(
      [holding({ symbol: "AAA", weight: 100, price_current: 100, currency: "USD" })],
      950_000,
      "CLP",
      950,
    );

    expect(list.items[0].shares).toBe(10);
    expect(list.items[0].invested).toBeCloseTo(950_000, 4);
  });

  it("redondea las fracciones a 4 decimales", () => {
    // 100 / 3 = 33.3333...
    const list = buildShoppingList(
      [holding({ symbol: "AAA", weight: 100, price_current: 3, currency: "USD" })],
      100,
      "USD",
      950,
    );

    expect(list.items[0].shares).toBe(33.3333);
  });

  it("sin fracciones compra solo acciones enteras y deja el resto", () => {
    const list = buildShoppingList(
      [holding({ symbol: "AAA", weight: 100, price_current: 3, currency: "USD" })],
      100,
      "USD",
      950,
      { fracciones: false },
    );

    expect(list.items[0].shares).toBe(33);
    expect(list.items[0].invested).toBe(99);
    expect(list.restante).toBe(1);
  });

  it("marca sin precio las posiciones sin precio de referencia", () => {
    const list = buildShoppingList(
      [holding({ symbol: "AAA", weight: 50, price_current: 10 }), holding({ symbol: "BBB", weight: 50 })],
      100,
      "USD",
      950,
    );

    expect(list.items[1].shares).toBeNull();
    expect(list.items[1].warning).toMatch(/precio/i);
    expect(list.sinPrecio).toBe(1);
  });

  it("usa price_at_disclosure cuando no hay precio actual", () => {
    const list = buildShoppingList(
      [holding({ symbol: "AAA", weight: 100, price_at_disclosure: 25 })],
      100,
      "USD",
      950,
    );

    expect(list.items[0].price).toBe(25);
    expect(list.items[0].shares).toBe(4);
  });

  it("no valoriza activos en EUR (sin tipo de cambio)", () => {
    const list = buildShoppingList(
      [holding({ symbol: "AAA", weight: 100, price_current: 10, currency: "EUR" })],
      100,
      "USD",
      950,
    );

    expect(list.items[0].shares).toBeNull();
    expect(list.items[0].warning).toMatch(/moneda/i);
  });

  it("rechaza montos y tipos de cambio inválidos", () => {
    const h = [holding({ symbol: "AAA", weight: 100, price_current: 10 })];
    expect(() => buildShoppingList(h, 0, "USD", 950)).toThrow();
    expect(() => buildShoppingList(h, 100, "USD", 0)).toThrow();
  });

  it("con lista vacía devuelve todo en restante", () => {
    const list = buildShoppingList([], 1_000, "USD", 950);
    expect(list.items).toHaveLength(0);
    expect(list.restante).toBe(1_000);
  });

  it("incluye el aviso de mínimos de las corredoras", () => {
    expect(MINIMUM_NOTICE).toMatch(/mínimo/i);
    expect(BROKER_MINIMUMS.length).toBeGreaterThan(0);
  });
});

describe("shoppingListToCsv", () => {
  it("genera una cabecera y una fila por posición", () => {
    const list = buildShoppingList(
      [holding({ symbol: "AAA", name: "Alfa, Inc.", weight: 100, price_current: 10 })],
      100,
      "USD",
      950,
    );
    const csv = shoppingListToCsv(list);
    const lines = csv.split("\n");

    expect(lines[0]).toContain("symbol");
    expect(lines[0]).toContain("shares");
    expect(lines).toHaveLength(2);
    expect(lines[1].startsWith("AAA,")).toBe(true);
    expect(lines[1]).toContain('"Alfa, Inc."');
  });
});
