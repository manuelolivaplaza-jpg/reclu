/**
 * ticker-queries.ts — Consultas y lógica pura para la página por acción
 * (/accion/[symbol]). F7. No reemplaza a queries.ts: convive con él.
 *
 * Lógica pura (testeable con Vitest, sin red):
 *  - normalizeSymbol
 *  - summarizeHolders (consenso por ticker desde filas crudas)
 *  - filterAlertsBySymbol
 * Acceso a datos:
 *  - getTickerOverview (Supabase real o demo rotulada)
 */

import { createClient } from "@/lib/supabase/server";
import type { Alert, Portfolio } from "@/lib/types";
import { DEMO_PORTFOLIOS, demoAlerts, demoHoldings } from "@/lib/demo-data";

// ---- Tipos ----

export interface TickerHolder {
  portfolio: Pick<
    Portfolio,
    "id" | "slug" | "name" | "category" | "country" | "manager" | "followers"
  >;
  /** Peso vigente del símbolo en la cartera (0–100). */
  weight: number;
  previousWeight: number | null;
  /** Fecha de la fila vigente. */
  asOf: string;
  /** Primera fecha en que el símbolo aparece en la cartera (historial). */
  firstSeen: string;
  returnPct: number | null;
}

export interface TickerConsensus {
  holders: TickerHolder[];
  portfolioCount: number;
  avgWeight: number;
  maxWeight: number;
}

export interface TickerOverview {
  symbol: string;
  /** Nombre del activo si algún portafolio lo reporta. */
  displayName: string | null;
  consensus: TickerConsensus;
  alerts: Alert[];
  price: number | null;
  currency: string | null;
  /** True cuando los datos vienen de demo-data (se rotula "datos de ejemplo"). */
  isDemo: boolean;
}

// ---- Lógica pura ----

/** Normaliza un símbolo de URL: trim + mayúsculas. */
export function normalizeSymbol(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Fila cruda de holding para un símbolo, independiente del origen. */
export interface RawHoldingRow {
  portfolioId: string;
  asOf: string;
  weight: number;
  previousWeight: number | null;
  name: string | null;
  priceCurrent: number | null;
  returnPct: number | null;
  currency: string | null;
}

type PortfolioMeta = TickerHolder["portfolio"];

/**
 * Consenso por ticker: deduplica filas históricas por cartera (se queda con
 * la fila de as_of más reciente y registra la primera aparición), resuelve
 * metadatos del portafolio y ordena por peso descendente.
 */
export function summarizeHolders(
  rows: RawHoldingRow[],
  portfolioById: Map<string, PortfolioMeta>,
): {
  holders: TickerHolder[];
  avgWeight: number;
  maxWeight: number;
  displayName: string | null;
  price: number | null;
  currency: string | null;
} {
  const byPortfolio = new Map<
    string,
    { latest: RawHoldingRow; firstSeen: string }
  >();

  for (const row of rows) {
    if (!Number.isFinite(row.weight) || row.weight < 0) continue;
    const existing = byPortfolio.get(row.portfolioId);
    if (!existing) {
      byPortfolio.set(row.portfolioId, { latest: row, firstSeen: row.asOf });
      continue;
    }
    if (row.asOf > existing.latest.asOf) existing.latest = row;
    if (row.asOf < existing.firstSeen) existing.firstSeen = row.asOf;
  }

  const holders: TickerHolder[] = [];
  let displayName: string | null = null;
  let price: number | null = null;
  let currency: string | null = null;

  for (const [portfolioId, entry] of byPortfolio) {
    const portfolio = portfolioById.get(portfolioId);
    if (!portfolio) continue; // portafolio inactivo o eliminado
    if (!displayName && entry.latest.name) displayName = entry.latest.name;
    if (price === null && entry.latest.priceCurrent !== null) {
      price = entry.latest.priceCurrent;
      currency = entry.latest.currency;
    }
    holders.push({
      portfolio,
      weight: entry.latest.weight,
      previousWeight: entry.latest.previousWeight,
      asOf: entry.latest.asOf,
      firstSeen: entry.firstSeen,
      returnPct: entry.latest.returnPct,
    });
  }

  holders.sort(
    (a, b) =>
      b.weight - a.weight ||
      a.portfolio.name.localeCompare(b.portfolio.name),
  );

  const avgWeight =
    holders.length === 0
      ? 0
      : holders.reduce((sum, h) => sum + h.weight, 0) / holders.length;
  const maxWeight = holders.length === 0 ? 0 : holders[0].weight;

  return { holders, avgWeight, maxWeight, displayName, price, currency };
}

/**
 * Alertas de un símbolo: match exacto por payload.symbol (insensible a
 * mayúsculas) o mención del símbolo en el título con límite de palabra.
 * Símbolos de 1 carácter solo matchean por payload (evita falsos positivos).
 */
export function filterAlertsBySymbol(alerts: Alert[], symbol: string): Alert[] {
  const target = normalizeSymbol(symbol);
  if (!target) return [];
  const short = target.length < 2;
  const titleRe = new RegExp(`\\b${escapeRegExp(target)}\\b`, "i");
  return alerts.filter((alert) => {
    const payloadSymbol = (alert.payload?.symbol as unknown as string) ?? "";
    if (typeof payloadSymbol === "string" && payloadSymbol.trim().toUpperCase() === target) {
      return true;
    }
    if (short) return false;
    return titleRe.test(alert.title);
  });
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
}

// ---- Acceso a datos ----

/** Misma regla que queries.ts: sin URL real, el sitio está en modo demo. */
function isSupabaseLive(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return url.startsWith("https://") && !url.includes("placeholder");
}

/**
 * Panorama completo de un símbolo: quiénes lo tienen (con peso y desde
 * cuándo), alertas recientes y consenso. En modo demo usa demo-data
 * rotulada; con Supabase real consulta holdings + portafolios + alertas.
 */
export async function getTickerOverview(rawSymbol: string): Promise<TickerOverview> {
  const symbol = normalizeSymbol(rawSymbol);

  // --- Modo demo ---
  if (!isSupabaseLive()) {
    const portfolioById = new Map<string, PortfolioMeta>();
    const rows: RawHoldingRow[] = [];
    for (const portfolio of DEMO_PORTFOLIOS) {
      portfolioById.set(portfolio.id, portfolio);
      for (const holding of demoHoldings(portfolio.slug)) {
        if (normalizeSymbol(holding.symbol) !== symbol) continue;
        rows.push({
          portfolioId: portfolio.id,
          asOf: holding.as_of,
          weight: holding.weight,
          previousWeight: holding.previous_weight,
          name: holding.name,
          priceCurrent: holding.price_current,
          returnPct: holding.return_pct,
          currency: holding.currency,
        });
      }
    }
    const summary = summarizeHolders(rows, portfolioById);
    return {
      symbol,
      displayName: summary.displayName,
      consensus: {
        holders: summary.holders,
        portfolioCount: summary.holders.length,
        avgWeight: summary.avgWeight,
        maxWeight: summary.maxWeight,
      },
      alerts: filterAlertsBySymbol(demoAlerts(), symbol),
      price: summary.price,
      currency: summary.currency,
      isDemo: true,
    };
  }

  // --- Supabase real ---
  const supabase = await createClient();

  // 1) Portafolios activos (para metadatos y filtrar inactivos).
  const { data: portfolios } = await supabase
    .from("portfolios")
    .select("id, slug, name, category, country, manager, followers")
    .eq("is_active", true);
  const portfolioById = new Map<string, PortfolioMeta>();
  for (const portfolio of portfolios ?? []) {
    portfolioById.set(portfolio.id, portfolio);
  }

  // 2) Todas las filas históricas del símbolo (una sola consulta).
  const { data: holdingRows, error: holdingsError } = await supabase
    .from("holdings")
    .select(
      "portfolio_id, as_of, weight, previous_weight, name, price_current, return_pct, currency",
    )
    .eq("symbol", symbol)
    .order("as_of", { ascending: true });
  if (holdingsError) {
    console.warn("[reclu] getTickerOverview holdings error:", holdingsError.message);
  }

  const rows: RawHoldingRow[] = (holdingRows ?? []).map((row) => ({
    portfolioId: row.portfolio_id,
    asOf: String(row.as_of ?? ""),
    weight: Number(row.weight ?? 0),
    previousWeight:
      row.previous_weight === null ? null : Number(row.previous_weight),
    name: row.name ?? null,
    priceCurrent:
      row.price_current === null ? null : Number(row.price_current),
    returnPct: row.return_pct === null ? null : Number(row.return_pct),
    currency: row.currency ?? null,
  }));

  const summary = summarizeHolders(rows, portfolioById);

  // 3) Alertas publicadas recientes → filtrado por símbolo en JS.
  const { data: alertRows } = await supabase
    .from("alerts")
    .select(
      `
      *,
      portfolio:portfolios!inner ( id, slug, name )
      `,
    )
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .limit(200);

  return {
    symbol,
    displayName: summary.displayName,
    consensus: {
      holders: summary.holders,
      portfolioCount: summary.holders.length,
      avgWeight: summary.avgWeight,
      maxWeight: summary.maxWeight,
    },
    alerts: filterAlertsBySymbol((alertRows ?? []) as Alert[], symbol),
    price: summary.price,
    currency: summary.currency,
    isDemo: summary.holders.length === 0 && (alertRows ?? []).length === 0,
  };
}

/**
 * Símbolos más comunes del catálogo (para enlaces relacionados).
 * Pure: recibe pares (portfolioId, holdings) ya resueltos.
 */
export function topSymbolsByCount(
  holdingsByPortfolio: { portfolioId: string; symbols: string[] }[],
  limit = 8,
): { symbol: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const entry of holdingsByPortfolio) {
    const seen = new Set<string>();
    for (const symbol of entry.symbols) {
      const normalized = normalizeSymbol(symbol);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([symbol, count]) => ({ symbol, count }))
    .sort((a, b) => b.count - a.count || a.symbol.localeCompare(b.symbol))
    .slice(0, limit);
}
