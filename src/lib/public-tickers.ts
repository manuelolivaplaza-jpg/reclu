/**
 * B1/T3 — catálogo público de tickers para las fichas /accion.
 *
 * Dos lecturas, ambas de servidor y cacheadas 1 h (tag `portfolios`, el mismo
 * que invalida el pipeline diario vía /api/revalidate):
 *
 *  - `getKnownTickerSymbols()`: símbolos reales (MAYÚSCULAS) del último
 *    snapshot de los portafolios activos, más los curados en
 *    `ticker_profile`, con cuántos portafolios activos los tienen. Lo usan el
 *    sitemap (B2) y los enlaces internos (B8).
 *  - `getTickerPublicSummary(symbol)`: resumen SIN posiciones de pago
 *    (símbolo, nombre del activo, sector y número agregado de portafolios)
 *    para la ficha /accion cuando el rol actual ve 0 carteras (decisión 1b
 *    de Manu, 10-nov 23:10).
 *
 * Reglas duras:
 *  - Nunca se devuelven pesos, montos, cantidades, fechas de compra ni
 *    slugs/nombres de portafolios: solo agregados. El nombre del activo sale
 *    de `holdings.name` y el sector de `ticker_profile`.
 *  - `holdings` está tras el muro de la migración 012: la lectura usa el
 *    cliente admin SOLO en servidor y el resultado se agrega aquí antes de
 *    salir. Nunca se importa este módulo desde un componente de cliente.
 *  - Con error de datos, `getKnownTickerSymbols()` devuelve `[]` y
 *    `getTickerPublicSummary()` devuelve `null` (nunca se inventa).
 *  - Sin Supabase configurado el catálogo devuelve `[]` y el resumen se arma
 *    con `demo-data`, rotulado como ejemplo, para que la ficha funcione en
 *    local.
 *
 * `src/lib/accion-gate.ts` (proxy) no puede llamar a las funciones cacheadas
 * —`cacheLife()` solo existe dentro del render de App Router—, así que repite
 * el mismo criterio símbolo por símbolo: existe si hay una fila en `holdings`
 * o en `ticker_profile`. Si cambia el criterio, cámbialo también allí.
 */

import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { PUBLIC_DATA_TAG, PORTFOLIOS_TAG } from "@/lib/cache-tags";
import { groupBySymbol, latestSnapshot } from "@/lib/composition";
import { normalizeSymbol } from "@/lib/ticker-queries";
import { DEMO_PORTFOLIOS, demoHoldings, isHiddenSlug } from "@/lib/demo-data";

/** Resumen público de un ticker. Nunca incluye posiciones. */
export interface TickerPublicSummary {
  symbol: string;
  /** Nombre del activo según `holdings.name` (null si la fuente no lo trae). */
  name: string | null;
  /** Sector curado en `ticker_profile` (null si no hay fila o no lo declara). */
  sector: string | null;
  /** Portafolios activos que lo tienen en su último snapshot. */
  portfolioCount: number;
  /** True solo en modo demo: la ficha debe rotular "datos de ejemplo". */
  isDemo?: boolean;
}

/** Símbolo real y cuántos portafolios activos lo tienen. */
export interface KnownTickerSymbol {
  symbol: string;
  portfolioCount: number;
}

/** Entrada del catálogo cacheado (una por símbolo real). */
interface CatalogEntry {
  symbol: string;
  portfolioCount: number;
  sector: string | null;
}

/** Filas por página de PostgREST (max-rows por defecto de Supabase). */
const PAGE = 1000;
/** Portafolios por consulta `.in()` (mismo tamaño que queries.ts). */
const ID_CHUNK = 80;
/** Tope defensivo de filas del catálogo completo (una lectura por hora). */
const MAX_CATALOG_ROWS = 200_000;
/** Tope de filas del símbolo consultado (todas sus fechas y carteras). */
const MAX_SYMBOL_ROWS = 5_000;

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

interface BookRow {
  portfolio_id: string;
  symbol: string;
  as_of: string;
  weight: number;
}

interface SymbolRow {
  portfolio_id: string;
  as_of: string;
  name: string | null;
}

/** True cuando Supabase está configurado con valores reales (no placeholder). */
function isSupabaseLive(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return url.startsWith("https://") && !url.includes("placeholder");
}

/** ILIKE exacto: `%` y `_` no actúan como comodines (misma regla que ticker-queries). */
function escapeLike(symbol: string): string {
  return symbol.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function toWeight(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function toBookRow(value: unknown): BookRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.portfolio_id !== "string" || typeof row.symbol !== "string") {
    return null;
  }
  return {
    portfolio_id: row.portfolio_id,
    symbol: row.symbol,
    as_of: String(row.as_of ?? "").slice(0, 10),
    weight: toWeight(row.weight),
  };
}

/** Ids de los portafolios activos, o null si la lectura falla. */
async function readActivePortfolioIds(
  admin: AdminClient,
): Promise<Set<string> | null> {
  const { data, error } = await admin
    .from("portfolios")
    .select("id")
    .eq("is_active", true);
  if (error || !Array.isArray(data)) {
    if (error) console.warn("[reclu] public-tickers portfolios:", error.message);
    return null;
  }
  const ids = new Set<string>();
  for (const row of data) {
    const id = (row as { id?: unknown }).id;
    if (typeof id === "string" && id.length > 0) ids.add(id);
  }
  return ids;
}

/**
 * Libro de las carteras pedidas (`portfolio_id`, `symbol`, `as_of`, `weight`),
 * paginado por `id` para no depender del tope de PostgREST. Devuelve null si
 * una página falla: el llamador decide si puede seguir sin esos datos.
 */
async function readBooks(
  admin: AdminClient,
  portfolioIds: string[],
  maxRows: number,
): Promise<BookRow[] | null> {
  if (portfolioIds.length === 0) return [];
  const rows: BookRow[] = [];
  for (let i = 0; i < portfolioIds.length; i += ID_CHUNK) {
    const chunk = portfolioIds.slice(i, i + ID_CHUNK);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await admin
        .from("holdings")
        .select("portfolio_id, symbol, as_of, weight")
        .in("portfolio_id", chunk)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) {
        console.warn("[reclu] public-tickers holdings:", error.message);
        return null;
      }
      const page = (data ?? []) as unknown[];
      for (const value of page) {
        const row = toBookRow(value);
        if (row) rows.push(row);
      }
      if (page.length < PAGE) break;
      if (rows.length >= maxRows) {
        console.warn("[reclu] public-tickers: tope de filas del libro alcanzado");
        return rows;
      }
    }
  }
  return rows;
}

/** Sector curado por símbolo (`ticker_profile`). Sin fila = null. */
async function readSectorMap(
  admin: AdminClient,
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const { data, error } = await admin
    .from("ticker_profile")
    .select("symbol, sector");
  if (error || !Array.isArray(data)) {
    if (error) console.warn("[reclu] public-tickers ticker_profile:", error.message);
    return out;
  }
  for (const value of data) {
    const row = value as { symbol?: unknown; sector?: unknown };
    const symbol = normalizeSymbol(typeof row.symbol === "string" ? row.symbol : "");
    if (!symbol) continue;
    const sector =
      typeof row.sector === "string" && row.sector.trim().length > 0
        ? row.sector.trim()
        : null;
    out.set(symbol, sector);
  }
  return out;
}

/**
 * Catálogo completo: por cada cartera activa se toma su último `as_of` y, de
 * ahí, una fila por símbolo (mismo criterio que la ficha: `latestSnapshot` +
 * `groupBySymbol`). El número es cuántas carteras activas lo tienen en su
 * último snapshot; los símbolos que solo están en `ticker_profile` entran con
 * 0. Nunca lanza: ante cualquier error devuelve [].
 */
async function readCatalog(): Promise<CatalogEntry[]> {
  const admin = createAdminClient();
  if (!admin) return [];

  const ids = await readActivePortfolioIds(admin);
  if (!ids || ids.size === 0) return [];

  const books = await readBooks(admin, [...ids], MAX_CATALOG_ROWS);
  if (!books) return [];

  const byPortfolio = new Map<string, BookRow[]>();
  for (const row of books) {
    const list = byPortfolio.get(row.portfolio_id);
    if (list) list.push(row);
    else byPortfolio.set(row.portfolio_id, [row]);
  }

  const counts = new Map<string, number>();
  for (const list of byPortfolio.values()) {
    for (const holding of groupBySymbol(latestSnapshot(list))) {
      const symbol = normalizeSymbol(holding.symbol);
      if (!symbol) continue;
      counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
    }
  }

  const sectors = await readSectorMap(admin);
  for (const symbol of sectors.keys()) {
    if (!counts.has(symbol)) counts.set(symbol, 0);
  }

  return [...counts.entries()]
    .map(([symbol, portfolioCount]) => ({
      symbol,
      portfolioCount,
      sector: sectors.get(symbol) ?? null,
    }))
    .sort(
      (a, b) =>
        b.portfolioCount - a.portfolioCount ||
        a.symbol.localeCompare(b.symbol),
    );
}

/** `"use cache"` + 1 h: una lectura por ventana para sitemap, fichas y enlaces. */
async function getCatalogCached(): Promise<CatalogEntry[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(PUBLIC_DATA_TAG, PORTFOLIOS_TAG);
  try {
    return await readCatalog();
  } catch (err) {
    console.warn(
      "[reclu] getKnownTickerSymbols error:",
      err instanceof Error ? err.message : String(err),
    );
    return [];
  }
}

/**
 * Todos los símbolos reales con cuántos portafolios activos los tienen,
 * ordenados por ese número (desc) y luego por símbolo.
 * Sin Supabase o con error de datos devuelve [] (nunca bloquea a quien lo use).
 */
export async function getKnownTickerSymbols(): Promise<KnownTickerSymbol[]> {
  if (!isSupabaseLive()) return [];
  const catalog = await getCatalogCached();
  return catalog.map((entry) => ({
    symbol: entry.symbol,
    portfolioCount: entry.portfolioCount,
  }));
}

/** Filas del símbolo en todas sus fechas y carteras (más recientes primero). */
async function readSymbolRows(
  admin: AdminClient,
  symbol: string,
): Promise<SymbolRow[] | null> {
  const rows: SymbolRow[] = [];
  for (let from = 0; from < MAX_SYMBOL_ROWS; from += PAGE) {
    const { data, error } = await admin
      .from("holdings")
      .select("portfolio_id, symbol, as_of, name")
      .ilike("symbol", escapeLike(symbol))
      .order("as_of", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) {
      console.warn("[reclu] public-tickers symbol:", error.message);
      return null;
    }
    const page = (data ?? []) as unknown[];
    for (const value of page) {
      if (!value || typeof value !== "object") continue;
      const row = value as Record<string, unknown>;
      if (typeof row.portfolio_id !== "string") continue;
      // `ilike` no distingue mayúsculas: se compara ya normalizado.
      if (normalizeSymbol(String(row.symbol ?? "")) !== symbol) continue;
      rows.push({
        portfolio_id: row.portfolio_id,
        as_of: String(row.as_of ?? "").slice(0, 10),
        name: typeof row.name === "string" ? row.name.trim() : null,
      });
    }
    if (page.length < PAGE) break;
  }
  return rows;
}

/** Fila curada del símbolo, o null si la tabla no responde. */
async function readSector(
  admin: AdminClient,
  symbol: string,
): Promise<{ found: boolean; sector: string | null } | null> {
  const { data, error } = await admin
    .from("ticker_profile")
    .select("symbol, sector")
    .eq("symbol", symbol)
    .maybeSingle();
  if (error) return null;
  if (!data) return { found: false, sector: null };
  const sector = (data as { sector?: unknown }).sector;
  return {
    found: true,
    sector:
      typeof sector === "string" && sector.trim().length > 0
        ? sector.trim()
        : null,
  };
}

/** Primer nombre real de las filas del símbolo (vienen de la más reciente). */
function pickName(rows: SymbolRow[], symbol: string): string | null {
  for (const row of rows) {
    const name = row.name?.trim() ?? "";
    if (name.length > 0 && normalizeSymbol(name) !== symbol) return name;
  }
  return null;
}

/** Ejecuta `task` sobre la lista con un máximo de tareas en paralelo. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let index = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(limit, 1), items.length) },
    async () => {
      for (;;) {
        const i = index;
        index += 1;
        if (i >= items.length) return;
        out[i] = await task(items[i]);
      }
    },
  );
  await Promise.all(workers);
  return out;
}

/**
 * ¿El símbolo sigue en el último snapshot de esta cartera? Se compara la
 * fecha máxima del símbolo en la cartera con cualquier fila posterior: si no
 * hay ninguna, esa fecha ES el último snapshot. Una sola fila de respuesta.
 * `null` si la lectura falla (no se cuenta).
 */
async function holdingIsCurrent(
  admin: AdminClient,
  portfolioId: string,
  asOf: string,
): Promise<boolean | null> {
  const { data, error } = await admin
    .from("holdings")
    .select("id")
    .eq("portfolio_id", portfolioId)
    .gt("as_of", asOf)
    .limit(1);
  if (error) return null;
  return Array.isArray(data) ? data.length === 0 : null;
}

async function readSummary(
  admin: AdminClient,
  symbol: string,
): Promise<TickerPublicSummary | null> {
  const rows = await readSymbolRows(admin, symbol);
  if (!rows) return null;

  const profile = await readSector(admin, symbol);

  // Existe solo en el perfil curado: ficha sin carteras.
  if (rows.length === 0) {
    if (!profile || !profile.found) return null;
    return {
      symbol,
      name: null,
      sector: profile.sector,
      portfolioCount: 0,
      isDemo: false,
    };
  }

  const name = pickName(rows, symbol);

  const activeIds = await readActivePortfolioIds(admin);
  if (!activeIds) {
    // No se pudo confirmar el número: se muestra el mínimo (sin frase ni CTA).
    return {
      symbol,
      name,
      sector: profile?.sector ?? null,
      portfolioCount: 0,
      isDemo: false,
    };
  }

  // Fecha más reciente del símbolo en cada cartera activa (las filas vienen de
  // la más nueva a la más vieja, así que la primera de cada cartera es su máximo).
  const symbolAsOf = new Map<string, string>();
  for (const row of rows) {
    if (!activeIds.has(row.portfolio_id)) continue;
    if (!symbolAsOf.has(row.portfolio_id)) {
      symbolAsOf.set(row.portfolio_id, row.as_of);
    }
  }

  let portfolioCount = 0;
  const holderList = [...symbolAsOf.keys()];
  if (holderList.length > 0) {
    const current = await mapLimit(holderList, 6, (portfolioId) =>
      holdingIsCurrent(admin, portfolioId, symbolAsOf.get(portfolioId) as string),
    );
    portfolioCount = current.filter((flag) => flag === true).length;
  }

  return {
    symbol,
    name,
    sector: profile?.sector ?? null,
    portfolioCount,
    isDemo: false,
  };
}

/** Resumen a partir de `demo-data` (modo demo, sin Supabase configurado). */
function demoSummary(symbol: string): TickerPublicSummary | null {
  const portfolioIds = new Set<string>();
  let name: string | null = null;

  for (const portfolio of DEMO_PORTFOLIOS) {
    if (isHiddenSlug(portfolio.slug)) continue;
    const rows = demoHoldings(portfolio.slug);
    if (rows.length === 0) continue;
    const latest = latestSnapshot(rows);
    const holding = latest.find(
      (row) => normalizeSymbol(row.symbol) === symbol,
    );
    if (!holding) continue;
    portfolioIds.add(portfolio.id);
    if (!name) {
      const candidate = (holding.name ?? "").trim();
      if (candidate.length > 0 && normalizeSymbol(candidate) !== symbol) {
        name = candidate;
      }
    }
  }

  if (portfolioIds.size === 0) return null;
  return {
    symbol,
    name,
    sector: null,
    portfolioCount: portfolioIds.size,
    isDemo: true,
  };
}

async function getTickerPublicSummaryCached(
  symbol: string,
): Promise<TickerPublicSummary | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(PUBLIC_DATA_TAG, PORTFOLIOS_TAG);

  const admin = createAdminClient();
  if (!admin) return null;
  try {
    return await readSummary(admin, symbol);
  } catch (err) {
    console.warn(
      "[reclu] getTickerPublicSummary error:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/**
 * Resumen público de un ticker, o `null` si el ticker no existe (no hay fila
 * en `holdings` ni en `ticker_profile`).
 *
 * Incluye SOLO símbolo, nombre, sector y cuántos portafolios activos lo
 * tienen. Nunca pesos, montos, fechas ni nombres de carteras.
 */
export async function getTickerPublicSummary(
  rawSymbol: string,
): Promise<TickerPublicSummary | null> {
  const symbol = normalizeSymbol(rawSymbol);
  if (!symbol) return null;
  if (!isSupabaseLive()) return demoSummary(symbol);
  return getTickerPublicSummaryCached(symbol);
}
