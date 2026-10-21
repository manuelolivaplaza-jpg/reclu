import { describe, expect, it } from "vitest";
import {
  CHILE_AMOUNT_MESSAGE,
  HOLDING_ENTRY_MODE_LABELS,
  isChileanPosition,
  resolveHoldingsEntry,
} from "@/lib/holdings-entry";
import { normalizeDetectedRow } from "@/lib/portfolio-image-import";
import { amountCurrencyProblems } from "@/lib/portfolio-image-rows";
import { detectedToEntryRows } from "@/lib/portfolio-image-entry";

describe("montos solo en USD (decision de Manu, 21-oct)", () => {
  it("la etiqueta del modo monto dice USD", () => {
    expect(HOLDING_ENTRY_MODE_LABELS.amount).toMatch(/USD/);
  });

  it("detecta acciones chilenas por CLP, mercado CL o .SN", () => {
    expect(isChileanPosition({ symbol: "SQM-B", priceCurrency: "CLP" })).toBe(true);
    expect(isChileanPosition({ symbol: "CHILE", market: "CL" })).toBe(true);
    expect(isChileanPosition({ symbol: "FALABELLA.SN" })).toBe(true);
    expect(isChileanPosition({ symbol: "AAPL", priceCurrency: "USD" })).toBe(false);
  });

  it("modo monto rechaza acciones chilenas y no pide tipo de cambio", () => {
    const result = resolveHoldingsEntry("amount", [
      { symbol: "AAPL", amount: 1000, price: 200, priceCurrency: "USD" },
      { symbol: "SQM-B", amount: 500000, price: 40000, priceCurrency: "CLP" },
    ]);
    expect(result.holdings).toHaveLength(0);
    const messages = result.errors.map((e) => e.message);
    expect(messages).toContain(CHILE_AMOUNT_MESSAGE);
    expect(messages.some((m) => /tipo de cambio/i.test(m))).toBe(false);
  });

  it("modo monto con todo en USD funciona", () => {
    const result = resolveHoldingsEntry("amount", [
      { symbol: "AAPL", amount: 750, price: 150, priceCurrency: "USD" },
      { symbol: "MSFT", amount: 250, price: 250, priceCurrency: "USD" },
    ]);
    expect(result.errors).toHaveLength(0);
    expect(result.holdings.map((h) => h.weight)).toEqual([75, 25]);
  });

  it("las acciones chilenas siguen permitidas por cantidad", () => {
    const result = resolveHoldingsEntry("shares", [
      { symbol: "SQM-B", shares: 10, price: 40000, priceCurrency: "CLP" },
    ]);
    expect(result.errors).toHaveLength(0);
  });

  it("imagen: un monto en CLP o en otra moneda se marca para corregir", () => {
    const clp = normalizeDetectedRow({ symbol: "SQM-B", amount: 500000, currency: "CLP" })!;
    const eur = normalizeDetectedRow({ symbol: "SAP", amount: 1000, currency: "EUR" })!;
    const usd = normalizeDetectedRow({ symbol: "AAPL", amount: 1000, currency: "USD" })!;
    expect(eur.amountNeedsUsd).toBe(true);
    expect(usd.amountNeedsUsd).toBeUndefined();
    expect(amountCurrencyProblems([clp, eur, usd])).toEqual(["SQM-B", "SAP"]);
  });

  it("imagen: montos no USD no eligen el modo monto ni sirven de peso", () => {
    const out = detectedToEntryRows([
      { symbol: "AAPL", quantity: null, amount: 1000, weight: null, currency: "USD" },
      { symbol: "SAP", quantity: null, amount: 1000, weight: 50, currency: null, amountNeedsUsd: true },
    ]);
    expect(out.mode).toBe("percentage");
  });
});
