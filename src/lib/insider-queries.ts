/**
 * Compras de ejecutivos (SEC Form 4).
 *
 * La tabla `insider_trades` es lectura pública (migración 016): no tiene
 * direcciones. El libro del portafolio NO se lee aquí. La página pide los
 * holdings con `get_portfolio_holdings` (muro de pago, migración 012) y
 * se queda con la fila de `as_of` más reciente de cada símbolo.
 *
 * Sin Supabase configurado se devuelven filas de ejemplo, rotuladas.
 */

import { createClient } from "@/lib/supabase/server";

/** Aviso fijo de la señal. No es una estrategia. */
export const INSIDER_DISCLAIMER =
  "Simulación histórica con fines informativos. No es recomendación de inversión.";

/**
 * Backtest del 1S-2026. Fuente: scrapers/data/insiders/insiders_resumen.json
 * y insiders_compras_1M_2026H1.csv. Corte de precios 2026-10-16.
 * Corrida del 2026-10-19. No le ganó al SPY.
 */
export const INSIDER_BACKTEST = {
  periodLabel: "1S-2026",
  priceAsOf: "2026-10-16",
  runOn: "2026-10-19",
  events: 270,
  excluded: 112,
  avgPct: -1.8,
  medianPct: -5.45,
  spyAvgPct: 8.11,
  beatSpy: 88,
  weekAvgPct: 0.04,
  monthAvgPct: 1.03,
  stakeUsd: 1000,
  valueUsd: 265131,
  spyValueUsd: 291908,
} as const;

export interface InsiderTrade {
  id: string;
  symbol: string;
  ownerName: string;
  ownerTitle: string | null;
  isDirector: boolean | null;
  isOfficer: boolean | null;
  transDate: string;
  filedAt: string;
  code: "P" | "S";
  valueUsd: number | null;
  sourceUrl: string;
}

export interface InsiderTradesResult {
  trades: InsiderTrade[];
  /** True cuando las filas salen del ejemplo local, no de la base. */
  demo: boolean;
}

const TRADE_LIMIT = 20;

const MONTHS_ES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

function isSupabaseLive(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return url.startsWith("https://") && !url.includes("placeholder");
}

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

/** Día calendario de un `as_of` (date o timestamp). */
export function asOfDay(value: string): string {
  return value.slice(0, 10);
}

/**
 * Libro vigente: una fila por símbolo, la de `as_of` más reciente.
 * El recorte del plan ya ocurrió en `get_portfolio_holdings`.
 * El scraper de Form 4 deja una sola fila por símbolo; esto cubre
 * un `as_of` viejo que todavía esté en la respuesta.
 */
export function holdingsAtLatestAsOf<
  T extends { symbol: string; as_of: string; weight: number },
>(rows: T[]): T[] {
  const best = new Map<string, T>();
  for (const row of rows) {
    const key = row.symbol.trim().toUpperCase();
    if (!key) continue;
    const current = best.get(key);
    if (!current || asOfDay(row.as_of) >= asOfDay(current.as_of)) {
      best.set(key, row);
    }
  }
  return [...best.values()].sort(
    (a, b) => b.weight - a.weight || a.symbol.localeCompare(b.symbol),
  );
}

/**
 * Mapea una fila cruda y descarta cualquier campo que no sea de mercado.
 * Una dirección que viniera de más no se copia.
 */
export function toInsiderTrade(raw: Record<string, unknown>): InsiderTrade | null {
  const id = asText(raw.id);
  const symbol = asText(raw.symbol);
  const ownerName = asText(raw.owner_name);
  const transDate = asText(raw.trans_date);
  const filedAt = asText(raw.filed_at);
  const sourceUrl = asText(raw.source_url);
  const code = asText(raw.code);
  if (!id || !symbol || !ownerName || !transDate || !filedAt || !sourceUrl) return null;
  if (code !== "P" && code !== "S") return null;
  return {
    id,
    symbol,
    ownerName,
    ownerTitle: asText(raw.owner_title),
    isDirector: asBool(raw.is_director),
    isOfficer: asBool(raw.is_officer),
    transDate,
    filedAt,
    code,
    valueUsd: asNumber(raw.value_usd),
    sourceUrl,
  };
}

/** Cargo visible. Si el XML no trae título, cae a director / ejecutivo. */
export function ownerRoleLabel(trade: Pick<InsiderTrade, "ownerTitle" | "isDirector" | "isOfficer">): string {
  if (trade.ownerTitle) return trade.ownerTitle;
  if (trade.isOfficer && trade.isDirector) return "Ejecutivo y director";
  if (trade.isOfficer) return "Ejecutivo";
  if (trade.isDirector) return "Director";
  return "—";
}

/** US$ con miles separados por punto. Sin depender del locale del sistema. */
export function formatUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const negative = value < 0;
  const digits = String(Math.round(Math.abs(value)));
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}US$${grouped}`;
}

/** Porcentaje con signo y coma decimal (es-CL), dos decimales. */
export function formatSignedPct(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2).replace(".", ",")}%`;
}

/** Fecha ISO → "4 mar 2026". Si no parsea, devuelve el texto original. */
export function formatIsoDate(iso: string): string {
  const day = iso.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return iso;
  const month = MONTHS_ES[Number(match[2]) - 1];
  if (!month) return iso;
  return `${Number(match[3])} ${month} ${match[1]}`;
}

/** Solo https. Cualquier otro esquema no se vuelve enlace. */
export function filingHref(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Ejemplos públicos (filings reales citados en el backtest y el fixture TTD).
 * Sirven solo sin Supabase. No son el libro en vivo.
 */
const DEMO_INSIDER_TRADES: InsiderTrade[] = [
  {
    id: "demo-ttd",
    symbol: "TTD",
    ownerName: "Jeff Green",
    ownerTitle: "Chief Executive Officer",
    isDirector: true,
    isOfficer: true,
    transDate: "2026-03-02",
    filedAt: "2026-03-04",
    code: "P",
    valueUsd: 148101266,
    sourceUrl: "https://www.sec.gov/Archives/edgar/data/1671933/000167144526000004/wk-form4_1772674051.xml",
  },
  {
    id: "demo-kkr",
    symbol: "KKR",
    ownerName: "Matt Cohler",
    ownerTitle: "Co-Chief Executive Officer",
    isDirector: false,
    isOfficer: true,
    transDate: "2026-02-18",
    filedAt: "2026-02-18",
    code: "P",
    valueUsd: 30121046,
    sourceUrl: "https://www.sec.gov/Archives/edgar/data/1404912/000114036126006058/",
  },
  {
    id: "demo-msci",
    symbol: "MSCI",
    ownerName: "Henry A Fernandez",
    ownerTitle: "Chairman and CEO",
    isDirector: true,
    isOfficer: true,
    transDate: "2026-02-17",
    filedAt: "2026-02-17",
    code: "P",
    valueUsd: 3560239,
    sourceUrl: "https://www.sec.gov/Archives/edgar/data/1408198/000141675026000006/",
  },
];

/** Últimas compras P. Vacío si la tabla no existe o la consulta falla. */
export async function getInsiderTrades(limit = TRADE_LIMIT): Promise<InsiderTradesResult> {
  const cap = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : TRADE_LIMIT;
  if (!isSupabaseLive()) {
    return { trades: DEMO_INSIDER_TRADES.slice(0, cap), demo: true };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("insider_trades")
      .select(
        "id, symbol, owner_name, owner_title, is_director, is_officer, trans_date, filed_at, code, value_usd, source_url",
      )
      .eq("code", "P")
      .order("filed_at", { ascending: false })
      .order("value_usd", { ascending: false })
      .limit(cap);

    if (error || !Array.isArray(data)) {
      if (error) console.warn("[reclu] getInsiderTrades error:", error.message);
      return { trades: [], demo: false };
    }

    const trades: InsiderTrade[] = [];
    for (const row of data) {
      if (!row || typeof row !== "object") continue;
      const trade = toInsiderTrade(row as Record<string, unknown>);
      if (trade?.code === "P") trades.push(trade);
    }
    return { trades, demo: false };
  } catch (err) {
    console.warn(
      "[reclu] getInsiderTrades error:",
      err instanceof Error ? err.message : "unknown",
    );
    return { trades: [], demo: false };
  }
}
