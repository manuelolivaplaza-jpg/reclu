import { describe, expect, it } from "vitest";
import {
  CHILE_PRICE_SUFFIX,
  priceSymbolCandidates,
} from "@/lib/holdings-prices";

/**
 * F78: búsqueda de precios para la carga de cartera. La moneda del precio
 * manda y los tickers chilenos viven con sufijo `.SN`.
 */

describe("priceSymbolCandidates", () => {
  it("para un ticker US devuelve solo el ticker", () => {
    expect(priceSymbolCandidates("AAPL", "US", "USD")).toEqual(["AAPL"]);
  });

  it("para un ticker chileno agrega el sufijo .SN", () => {
    expect(priceSymbolCandidates("SQM-B", "CL", "CLP")).toEqual([
      "SQM-B",
      `SQM-B${CHILE_PRICE_SUFFIX}`,
    ]);
  });

  it("la moneda CLP basta para buscar la versión .SN", () => {
    expect(priceSymbolCandidates("SQM-B", null, "CLP")).toEqual([
      "SQM-B",
      `SQM-B${CHILE_PRICE_SUFFIX}`,
    ]);
  });

  it("no duplica el sufijo si el ticker ya lo trae", () => {
    expect(priceSymbolCandidates("SQM-B.SN", "CL", "CLP")).toEqual([
      "SQM-B.SN",
    ]);
  });

  it("normaliza a mayúsculas y descarta el vacío", () => {
    expect(priceSymbolCandidates(" aapl ", "US", "USD")).toEqual(["AAPL"]);
    expect(priceSymbolCandidates("   ", "US", "USD")).toEqual([]);
  });
});
