/**
 * ticker-queries.ts — Consultas y lógica pura para la página por acción
 * (/accion/[symbol]). F7. No reemplaza a queries.ts: convive con él.
 *
 * Lógica pura (testeable con Vitest, sin red):
 *  - normalizeSymbol
 *  - summarizeHolders (consenso por ticker desde filas crudas)
 *  - filterAlertsBySymbol
 * Acceso a datos:
 *  - getTickerOverview (Supabase real o demo rotulada).
 *    Con Supabase: RPC get_symbol_holders (015). Si la RPC falla, cliente
 *    admin con rank sobre el as_of vigente y recorte por rol. Sin service
 *    key, la lectura directa pre-012 y el mismo recorte.
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/queries";
import type { Alert, Portfolio } from "@/lib/types";
import { DEMO_PORTFOLIOS, demoAlerts, demoHoldings } from "@/lib/demo-data";
import {
  HOLDING_LIMITS,
  canViewPremium,
  roleFor,
  type AccessRole,
} from "@/lib/access";

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

/**
 * Fila de "quién tiene X" ya resuelta, independiente del origen
 * (RPC get_symbol_holders, cliente admin o lectura legacy pre-012).
 */
export interface SymbolHolderRow {
  portfolioId: string;
  slug: string;
  name: string;
  category: string;
  premium: boolean | null;
  weight: number;
  asOf: string;
  previousWeight: number | null;
  firstSeen: string;
  holdingName: string | null;
  priceCurrent: number | null;
  currency: string | null;
  returnPct: number | null;
  /**
   * Rank de la posición por peso dentro de su cartera en su as_of vigente
   * (1 = mayor peso). Null cuando el origen ya aplicó el recorte (RPC 015).
   */
  rankInPortfolio: number | null;
}

/**
 * Recorte del muro de pago para filas de "quién tiene X" (F9).
 * Misma regla que la RPC get_symbol_holders (migración 015):
 *  - portafolio premium visible solo con plan de pago;
 *  - posición visible solo si su rank ≤ límite del rol (top N por peso).
 * Si rankInPortfolio es null el origen ya recortó (RPC), así que no se corta
 * de más; premium se re-verifica siempre por defensa en profundidad.
 */
export function trimHoldersForRole(
  rows: SymbolHolderRow[],
  role: AccessRole,
): SymbolHolderRow[] {
  const limit = HOLDING_LIMITS[role];
  const capped = Number.isFinite(limit);
  return rows.filter((row) => {
    if (row.premium && !canViewPremium(role)) return false;
    if (capped && row.rankInPortfolio !== null && row.rankInPortfolio > (limit as number)) {
      return false;
    }
    return true;
  });
}

function compareRank(a: RankInput, b: RankInput): number {
  if (a.weight !== b.weight) return b.weight - a.weight;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

/** Posición para rankear dentro del as_of vigente de su cartera. */
export interface RankInput {
  id: string;
  portfolioId: string;
  asOf: string;
  weight: number;
}

/**
 * Rank 1-based de cada posición en el as_of más reciente de su portafolio.
 * Se calcula sobre todas las posiciones de ese día (weight desc, id asc),
 * no sobre un símbolo filtrado de antemano. Fechas anteriores no participan.
 * 1 = mayor peso.
 */
export function rankAtLatestAsOf(rows: RankInput[]): Map<string, number> {
  const maxAsOf = new Map<string, string>();
  for (const row of rows) {
    const current = maxAsOf.get(row.portfolioId);
    if (!current || row.asOf > current) maxAsOf.set(row.portfolioId, row.asOf);
  }

  const latestByPortfolio = new Map<string, RankInput[]>();
  for (const row of rows) {
    if (row.asOf !== maxAsOf.get(row.portfolioId)) continue;
    const list = latestByPortfolio.get(row.portfolioId);
    if (list) list.push(row);
    else latestByPortfolio.set(row.portfolioId, [row]);
  }

  const ranks = new Map<string, number>();
  for (const list of latestByPortfolio.values()) {
    list.sort(compareRank);
    list.forEach((row, index) => {
      ranks.set(row.id, index + 1);
    });
  }
  return ranks;
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
 * rotulada. Con Supabase real el muro de la 012 impide leer holdings
 * directo: se usa la RPC 015 y, si no está, el cliente admin o la
 * lectura legacy, siempre recortada con trimHoldersForRole.
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
  const role = roleFor(await getProfile());

  // Portafolios activos: metadatos de la fila y bandera premium para el muro.
  const { data: portfolios } = await supabase
    .from("portfolios")
    .select("id, slug, name, category, country, manager, followers, premium")
    .eq("is_active", true);
  const portfolioById = new Map<string, PortfolioMeta>();
  const premiumById = new Map<string, boolean>();
  for (const portfolio of portfolios ?? []) {
    premiumById.set(portfolio.id, portfolio.premium === true);
    portfolioById.set(portfolio.id, {
      id: portfolio.id,
      slug: portfolio.slug,
      name: portfolio.name,
      category: portfolio.category,
      country: portfolio.country,
      manager: portfolio.manager,
      followers: portfolio.followers,
    });
  }

  const loaded = await loadSymbolHolders(
    supabase,
    symbol,
    role,
    portfolioById,
    premiumById,
  );
  const summary = summarizeHolders(
    loaded.rows.map(toRawHolding),
    portfolioById,
  );
  if (loaded.firstSeenFromSource) {
    summary.holders = applySourceFirstSeen(summary.holders, loaded.rows);
  }

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

type UserClient = Awaited<ReturnType<typeof createClient>>;
type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

interface HolderLoad {
  rows: SymbolHolderRow[];
  /** La fila ya trae firstSeen (RPC o admin). La lectura legacy trae el historial. */
  firstSeenFromSource: boolean;
}

interface HoldingDbRow {
  id: string;
  portfolio_id: string;
  symbol: string;
  as_of: string;
  weight: number | string | null;
  previous_weight: number | string | null;
  name: string | null;
  price_current: number | string | null;
  return_pct: number | string | null;
  currency: string | null;
}

const HOLDING_COLUMNS =
  "id, portfolio_id, symbol, as_of, weight, previous_weight, name, price_current, return_pct, currency";

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** ILIKE exacto: `%` y `_` no actúan como comodines. */
function ilikeExact(symbol: string): string {
  return symbol.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function toRawHolding(row: SymbolHolderRow): RawHoldingRow {
  return {
    portfolioId: row.portfolioId,
    asOf: row.asOf,
    weight: row.weight,
    previousWeight: row.previousWeight,
    name: row.holdingName,
    priceCurrent: row.priceCurrent,
    returnPct: row.returnPct,
    currency: row.currency,
  };
}

function applySourceFirstSeen(
  holders: TickerHolder[],
  rows: SymbolHolderRow[],
): TickerHolder[] {
  const first = new Map<string, string>();
  for (const row of rows) {
    if (!row.firstSeen) continue;
    const prev = first.get(row.portfolioId);
    if (!prev || row.firstSeen < prev) first.set(row.portfolioId, row.firstSeen);
  }
  return holders.map((holder) => {
    const seen = first.get(holder.portfolio.id);
    return seen ? { ...holder, firstSeen: seen } : holder;
  });
}

function overlayPremium(
  rows: SymbolHolderRow[],
  premiumById: Map<string, boolean>,
): SymbolHolderRow[] {
  return rows.map((row) => {
    const premium = premiumById.get(row.portfolioId);
    if (premium === undefined || premium === row.premium) return row;
    return { ...row, premium };
  });
}

function mapRpcHolder(value: unknown): SymbolHolderRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.portfolio_id !== "string" || typeof row.slug !== "string") return null;
  const asOf = String(row.as_of ?? "");
  const weight = Number(row.weight ?? 0);
  if (!Number.isFinite(weight)) return null;
  return {
    portfolioId: row.portfolio_id,
    slug: row.slug,
    name: typeof row.name === "string" ? row.name : "",
    category: typeof row.category === "string" ? row.category : "",
    premium: row.premium === true,
    weight,
    asOf,
    previousWeight: numOrNull(row.previous_weight),
    firstSeen: String(row.first_seen ?? asOf),
    holdingName: typeof row.holding_name === "string" ? row.holding_name : null,
    priceCurrent: numOrNull(row.price_current),
    currency: typeof row.currency === "string" ? row.currency : null,
    returnPct: numOrNull(row.return_pct),
    rankInPortfolio: null,
  };
}

/**
 * Holdings del símbolo ya recortados al rol.
 * 1) RPC 015 (rank en la base; rankInPortfolio null).
 * 2) Service role: libro del as_of vigente, rank en TS, luego recorte.
 * 3) Sin service key: lectura directa pre-012 y el mismo recorte.
 */
async function loadSymbolHolders(
  supabase: UserClient,
  symbol: string,
  role: AccessRole,
  portfolioById: Map<string, PortfolioMeta>,
  premiumById: Map<string, boolean>,
): Promise<HolderLoad> {
  const { data, error } = await supabase.rpc("get_symbol_holders", {
    p_symbol: symbol,
  });
  if (!error && Array.isArray(data)) {
    const mapped = data.flatMap((item) => {
      const row = mapRpcHolder(item);
      return row ? [row] : [];
    });
    return {
      rows: trimHoldersForRole(overlayPremium(mapped, premiumById), role),
      firstSeenFromSource: true,
    };
  }
  if (error) {
    console.warn("[reclu] get_symbol_holders error:", error.message);
  }

  const admin = createAdminClient();
  if (admin) {
    const adminRows = await loadAdminHolders(
      admin,
      symbol,
      portfolioById,
      premiumById,
    );
    if (adminRows) {
      return {
        rows: trimHoldersForRole(adminRows, role),
        firstSeenFromSource: true,
      };
    }
  }

  const legacy = await loadLegacyHolders(supabase, symbol, portfolioById, premiumById);
  return {
    rows: trimHoldersForRole(legacy, role),
    firstSeenFromSource: false,
  };
}

/**
 * Libro completo del as_of vigente de las carteras que tienen el símbolo.
 * Devuelve null si la lectura admin falla, para caer a la lectura legacy.
 */
async function loadAdminHolders(
  admin: AdminClient,
  symbol: string,
  portfolioById: Map<string, PortfolioMeta>,
  premiumById: Map<string, boolean>,
): Promise<SymbolHolderRow[] | null> {
  const hits = await drainHoldings(admin, { symbolIlike: ilikeExact(symbol) });
  if (hits.error) {
    console.warn("[reclu] getTickerOverview admin symbol error:", hits.error);
    return null;
  }
  const portfolioIds = [
    ...new Set(hits.rows.map((row) => row.portfolio_id)),
  ].filter((id) => portfolioById.has(id));
  if (portfolioIds.length === 0) return [];

  const book = await drainHoldings(admin, { portfolioIds });
  if (book.error) {
    console.warn("[reclu] getTickerOverview admin book error:", book.error);
    return null;
  }
  return holdersFromBook(book.rows, symbol, portfolioById, premiumById);
}

function holdersFromBook(
  book: HoldingDbRow[],
  symbol: string,
  portfolioById: Map<string, PortfolioMeta>,
  premiumById: Map<string, boolean>,
): SymbolHolderRow[] {
  const normalized = book.map((row) => ({
    id: String(row.id),
    portfolioId: row.portfolio_id,
    asOf: String(row.as_of ?? ""),
    weight: Number(row.weight ?? 0),
    symbol: normalizeSymbol(String(row.symbol ?? "")),
    raw: row,
  }));
  const ranks = rankAtLatestAsOf(normalized);

  const maxAsOf = new Map<string, string>();
  const firstSeen = new Map<string, string>();
  for (const row of normalized) {
    const max = maxAsOf.get(row.portfolioId);
    if (!max || row.asOf > max) maxAsOf.set(row.portfolioId, row.asOf);
    if (row.symbol !== symbol) continue;
    const seen = firstSeen.get(row.portfolioId);
    if (!seen || row.asOf < seen) firstSeen.set(row.portfolioId, row.asOf);
  }

  const out: SymbolHolderRow[] = [];
  for (const row of normalized) {
    if (row.symbol !== symbol) continue;
    if (row.asOf !== maxAsOf.get(row.portfolioId)) continue;
    const portfolio = portfolioById.get(row.portfolioId);
    const rank = ranks.get(row.id);
    if (!portfolio || rank === undefined) continue;
    out.push({
      portfolioId: row.portfolioId,
      slug: portfolio.slug,
      name: portfolio.name,
      category: portfolio.category,
      premium: premiumById.get(row.portfolioId) ?? false,
      weight: row.weight,
      asOf: row.asOf,
      previousWeight: numOrNull(row.raw.previous_weight),
      firstSeen: firstSeen.get(row.portfolioId) ?? row.asOf,
      holdingName: row.raw.name ?? null,
      priceCurrent: numOrNull(row.raw.price_current),
      currency: row.raw.currency ?? null,
      returnPct: numOrNull(row.raw.return_pct),
      rankInPortfolio: rank,
    });
  }
  return out;
}

/** Lectura directa de holdings (solo sirve si la 012 aún no quitó el SELECT público). */
async function loadLegacyHolders(
  supabase: UserClient,
  symbol: string,
  portfolioById: Map<string, PortfolioMeta>,
  premiumById: Map<string, boolean>,
): Promise<SymbolHolderRow[]> {
  const { data: holdingRows, error } = await supabase
    .from("holdings")
    .select(
      "portfolio_id, as_of, weight, previous_weight, name, price_current, return_pct, currency",
    )
    .eq("symbol", symbol)
    .order("as_of", { ascending: true });
  if (error) {
    console.warn("[reclu] getTickerOverview holdings error:", error.message);
    return [];
  }

  const rows: SymbolHolderRow[] = [];
  for (const row of holdingRows ?? []) {
    const portfolio = portfolioById.get(row.portfolio_id);
    if (!portfolio) continue;
    const asOf = String(row.as_of ?? "");
    rows.push({
      portfolioId: row.portfolio_id,
      slug: portfolio.slug,
      name: portfolio.name,
      category: portfolio.category,
      premium: premiumById.get(row.portfolio_id) ?? false,
      weight: Number(row.weight ?? 0),
      asOf,
      previousWeight: numOrNull(row.previous_weight),
      firstSeen: asOf,
      holdingName: row.name ?? null,
      priceCurrent: numOrNull(row.price_current),
      currency: row.currency ?? null,
      returnPct: numOrNull(row.return_pct),
      rankInPortfolio: null,
    });
  }
  return rows;
}

async function drainHoldings(
  admin: AdminClient,
  filters: { portfolioIds?: string[]; symbolIlike?: string },
): Promise<{ rows: HoldingDbRow[]; error: string | null }> {
  const pageSize = 1000;
  const rows: HoldingDbRow[] = [];
  if (!filters.symbolIlike && !filters.portfolioIds) {
    return { rows, error: "missing holdings filter" };
  }
  const chunks = filters.portfolioIds
    ? chunkIds(filters.portfolioIds, 80)
    : [undefined];
  if (filters.portfolioIds && filters.portfolioIds.length === 0) {
    return { rows, error: null };
  }

  for (const ids of chunks) {
    for (let from = 0; ; from += pageSize) {
      let query = admin.from("holdings").select(HOLDING_COLUMNS);
      if (filters.symbolIlike) query = query.ilike("symbol", filters.symbolIlike);
      if (ids && ids.length > 0) query = query.in("portfolio_id", ids);
      const { data, error } = await query
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) return { rows, error: error.message };
      const page = (data ?? []) as HoldingDbRow[];
      rows.push(...page);
      if (page.length < pageSize) break;
    }
  }
  return { rows, error: null };
}

function chunkIds(ids: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return chunks;
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
