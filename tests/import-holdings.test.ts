import { describe, it, expect } from "vitest";
import {
  MAX_IMPORT_ROWS,
  normalizeHeader,
  parseHoldingsCsv,
  parseQuantity,
} from "@/lib/import-holdings";

describe("parseQuantity", () => {
  it("acepta enteros y decimales simples", () => {
    expect(parseQuantity("12")).toBe(12);
    expect(parseQuantity("1.5")).toBe(1.5);
    expect(parseQuantity(" 42 ")).toBe(42);
  });

  it("acepta decimales con coma (formato chileno)", () => {
    expect(parseQuantity("1,5")).toBe(1.5);
    expect(parseQuantity("1.234,56")).toBe(1234.56);
  });

  it("acepta separador de miles anglosajón", () => {
    expect(parseQuantity("1,234.56")).toBe(1234.56);
    expect(parseQuantity("1.234.567")).toBe(1234567);
  });

  it("ignora símbolos de moneda y espacios", () => {
    expect(parseQuantity("$ 1.000")).toBe(1000);
    expect(parseQuantity("12 acciones")).toBe(12);
  });

  it("devuelve null si no es numérico", () => {
    expect(parseQuantity("")).toBeNull();
    expect(parseQuantity("abc")).toBeNull();
    expect(parseQuantity(undefined)).toBeNull();
  });
});

describe("normalizeHeader", () => {
  it("quita BOM, acentos, espacios y mayúsculas", () => {
    expect(normalizeHeader("\uFEFFSímbolo")).toBe("simbolo");
    expect(normalizeHeader(" Número de Acciones ")).toBe("numero_de_acciones");
  });
});

describe("parseHoldingsCsv", () => {
  it("convierte símbolo y cantidad en pesos relativos", () => {
    const result = parseHoldingsCsv("simbolo,cantidad\nAAPL,10\nMSFT,30\n");
    expect(result.errors).toEqual([]);
    expect(result.totalQuantity).toBe(40);
    expect(result.rows).toEqual([
      { symbol: "AAPL", quantity: 10, weight: 25 },
      { symbol: "MSFT", quantity: 30, weight: 75 },
    ]);
  });

  it("acepta encabezados en inglés y BOM", () => {
    const result = parseHoldingsCsv("\uFEFFsymbol,quantity\nnvda,2\n");
    expect(result.rows[0]).toEqual({ symbol: "NVDA", quantity: 2, weight: 100 });
  });

  it("acepta encabezados con acento y punto y coma", () => {
    const result = parseHoldingsCsv("Símbolo;Cantidad\nSQM-B;1,5\nCOPEC;2,5\n");
    expect(result.rows.map((row) => row.symbol)).toEqual(["SQM-B", "COPEC"]);
    expect(result.rows[0].weight).toBe(37.5);
    expect(result.rows[1].weight).toBe(62.5);
  });

  it("suma símbolos repetidos sin distinguir mayúsculas", () => {
    const result = parseHoldingsCsv("ticker,shares\nAAPL,10\naapl,15\n");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({ symbol: "AAPL", quantity: 25, weight: 100 });
  });

  it("ignora filas inválidas y conserva las válidas", () => {
    const result = parseHoldingsCsv(
      "symbol,quantity\nAAPL,10\n,5\nMSFT,-2\nTSLA,abc\nNVDA,3\n",
    );
    expect(result.rows.map((row) => row.symbol)).toEqual(["AAPL", "NVDA"]);
    expect(result.errors.length).toBe(3);
  });

  it("rechaza un CSV vacío", () => {
    expect(parseHoldingsCsv("   ").errors[0]).toMatch(/vacío/i);
  });

  it("rechaza si falta la columna de símbolo o de cantidad", () => {
    expect(parseHoldingsCsv("nombre,cantidad\nAAPL,10\n").errors[0]).toMatch(/símbolo/i);
    expect(parseHoldingsCsv("symbol,peso\nAAPL,10\n").errors[0]).toMatch(/cantidad/i);
  });

  it("rechaza símbolos con caracteres peligrosos", () => {
    const result = parseHoldingsCsv("symbol,quantity\nAAPL;DROP,10\nMSFT,5\n");
    expect(result.rows.map((row) => row.symbol)).toEqual(["MSFT"]);
    expect(result.errors.length).toBe(1);
  });

  it("limita a 100 símbolos distintos", () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `SYM${i},1`);
    const result = parseHoldingsCsv(`symbol,quantity\n${rows.join("\n")}`);
    expect(result.rows).toEqual([]);
    expect(result.errors[0]).toMatch(/Máximo 100/);
  });

  it("los pesos suman 100 con redondeo a dos decimales", () => {
    const result = parseHoldingsCsv("symbol,quantity\nA,1\nB,1\nC,1\n");
    const total = result.rows.reduce((sum, row) => sum + row.weight, 0);
    expect(total).toBeCloseTo(100, 2);
  });
});
