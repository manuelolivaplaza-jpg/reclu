/**
 * import-holdings.ts — Importación de cartera desde CSV (F45).
 *
 * Puro: Papa Parse + Zod. No toca red, cookies ni base de datos, así que se
 * puede testear con Vitest sin mocks.
 *
 * Formato: una columna de símbolo y una de cantidad. Acepta encabezados en
 * español o inglés (`símbolo`/`symbol`/`ticker`, `cantidad`/`quantity`/...).
 *
 * `user_holdings` guarda un peso (`weight`), no una cantidad, y F45 no trae
 * migración. Por eso la cantidad se traduce a peso relativo:
 *
 *     weight = cantidad / suma_de_cantidades * 100
 *
 * No es el porcentaje real del patrimonio: sin precios no se puede valorar
 * la cartera. La UI lo explica y no se usa para recomendaciones.
 */
import Papa from "papaparse";
import { z } from "zod";

export const MAX_IMPORT_ROWS = 100;
/** Tope defensivo del texto CSV antes de parsear (1 MB). */
export const MAX_CSV_LENGTH = 1_000_000;
export const MAX_QUANTITY = 1e12;

/** Símbolo permitido: letras, dígitos, punto y guion (ej. SQM-B, BRK.B). */
export const importSymbolSchema = z
  .string()
  .trim()
  .min(1, "Símbolo vacío.")
  .max(20, "Símbolo demasiado largo.")
  .regex(/^[A-Za-z0-9.-]+$/, "Símbolo inválido.")
  .transform((symbol) => symbol.toUpperCase());

const quantitySchema = z
  .number()
  .finite("Cantidad inválida.")
  .positive("La cantidad debe ser mayor que 0.")
  .max(MAX_QUANTITY, "Cantidad demasiado grande.");

export const importRowSchema = z.object({
  symbol: importSymbolSchema,
  quantity: quantitySchema,
});

export const importSymbolsSchema = z.array(importSymbolSchema).max(MAX_IMPORT_ROWS);

export interface ParsedImportRow {
  symbol: string;
  quantity: number;
  /** Peso relativo por cantidad (0–100). Ver nota del encabezado. */
  weight: number;
}

export interface ParsedHoldingsCsv {
  rows: ParsedImportRow[];
  /** Filas ignoradas y motivo. Si hay filas válidas, la importación sigue. */
  errors: string[];
  totalQuantity: number;
}

/** Fila pública de "quién más tiene X" (no incluye datos personales del usuario). */
export interface OverlapHolder {
  portfolioId: string;
  slug: string;
  name: string;
  category: string;
  weight: number;
}

export interface OverlapEntry {
  symbol: string;
  totalHolders: number;
  holders: OverlapHolder[];
  /** La RPC 015 no respondió (migración sin aplicar o error de red). */
  unavailable: boolean;
}

const SYMBOL_HEADERS = [
  "symbol",
  "simbolo",
  "ticker",
  "accion",
  "activo",
  "instrumento",
];
const QUANTITY_HEADERS = [
  "quantity",
  "cantidad",
  "qty",
  "shares",
  "acciones",
  "numero_acciones",
  "numero_de_acciones",
  "unidades",
  "units",
];

/**
 * Normaliza un encabezado: quita BOM, acentos, espacios y mayúsculas.
 * "Símbolo" y " SÍMBOLO " quedan como "simbolo".
 */
export function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function pickColumn(fields: string[], aliases: string[]): string | null {
  for (const alias of aliases) {
    if (fields.includes(alias)) return alias;
  }
  return null;
}

/**
 * Convierte una cantidad de CSV a número.
 * Acepta "1.234,56" (formato chileno), "1,234.56" (anglosajón), "1 234",
 * porcentajes y símbolos de moneda. Devuelve null si no es numérica.
 */
export function parseQuantity(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (raw === null || raw === undefined) return null;

  let text = String(raw).trim();
  if (!text) return null;

  // Deja solo dígitos, separadores y signo.
  text = text.replace(/\s/g, "").replace(/[^\d.,+-]/g, "");
  if (!text) return null;

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      // 1.234,56 -> 1234.56
      text = text.replace(/\./g, "").replace(",", ".");
    } else {
      // 1,234.56 -> 1234.56
      text = text.replace(/,/g, "");
    }
  } else if (lastComma !== -1) {
    const parts = text.split(",");
    // Una coma = decimal ("1,5"); una coma con 3 dígitos = miles ("1,500").
    if (parts.length === 2 && parts[1].length !== 3) text = `${parts[0]}.${parts[1]}`;
    else text = text.replace(/,/g, "");
  } else if (lastDot !== -1) {
    const parts = text.split(".");
    // Varios puntos o un punto con 3 dígitos = separador de miles.
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      text = text.replace(/\./g, "");
    }
  }

  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function roundWeight(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Parsea el CSV completo. Las filas inválidas se acumulan en `errors` y se
 * ignoran; si no queda ninguna fila válida, `rows` viene vacío.
 * Símbolos repetidos se suman (insensible a mayúsculas).
 */
export function parseHoldingsCsv(text: string): ParsedHoldingsCsv {
  const empty: ParsedHoldingsCsv = { rows: [], errors: [], totalQuantity: 0 };

  if (typeof text !== "string" || !text.trim()) {
    return { ...empty, errors: ["El CSV está vacío."] };
  }
  if (text.length > MAX_CSV_LENGTH) {
    return { ...empty, errors: ["El CSV supera 1 MB. Divide la cartera en archivos más chicos."] };
  }

  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: normalizeHeader,
  });

  const errors: string[] = [];
  for (const issue of result.errors.slice(0, 3)) {
    const line = (issue.row ?? 0) + 2;
    errors.push(`Fila ${line}: ${issue.message}`);
  }

  const fields = result.meta.fields ?? [];
  const symbolKey = pickColumn(fields, SYMBOL_HEADERS);
  const quantityKey = pickColumn(fields, QUANTITY_HEADERS);

  if (!symbolKey) {
    return {
      ...empty,
      errors: [...errors, "Falta la columna de símbolo (symbol, ticker o símbolo)."],
    };
  }
  if (!quantityKey) {
    return {
      ...empty,
      errors: [...errors, "Falta la columna de cantidad (quantity, cantidad o acciones)."],
    };
  }

  const bySymbol = new Map<string, number>();

  result.data.forEach((row, index) => {
    const rawSymbol = row[symbolKey] ?? "";
    const rawQuantity = row[quantityKey];
    // Fila completamente vacía: se ignora sin ruido.
    if (!String(rawSymbol).trim() && !String(rawQuantity ?? "").trim()) return;

    const quantity = parseQuantity(rawQuantity);
    const parsed = importRowSchema.safeParse({ symbol: rawSymbol, quantity });
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "fila inválida.";
      errors.push(`Fila ${index + 2}: ${message}`);
      return;
    }

    const previous = bySymbol.get(parsed.data.symbol) ?? 0;
    bySymbol.set(parsed.data.symbol, previous + parsed.data.quantity);
  });

  if (bySymbol.size > MAX_IMPORT_ROWS) {
    return {
      ...empty,
      errors: [
        ...errors,
        `Máximo ${MAX_IMPORT_ROWS} símbolos distintos por CSV (llegaron ${bySymbol.size}).`,
      ],
    };
  }

  const totalQuantity = [...bySymbol.values()].reduce((sum, value) => sum + value, 0);
  if (!(totalQuantity > 0)) {
    return {
      rows: [],
      errors: errors.length > 0 ? errors : ["No se encontraron filas válidas."],
      totalQuantity: 0,
    };
  }

  const rows: ParsedImportRow[] = [...bySymbol.entries()].map(([symbol, quantity]) => ({
    symbol,
    quantity,
    weight: roundWeight((quantity / totalQuantity) * 100),
  }));

  // Ajuste de redondeo: la suma queda exactamente en 100.
  if (rows.length > 0) {
    const sum = rows.reduce((acc, row) => acc + row.weight, 0);
    const last = rows[rows.length - 1];
    last.weight = roundWeight(last.weight + (100 - sum));
  }

  return { rows, errors, totalQuantity };
}
