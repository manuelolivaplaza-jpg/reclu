import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";
import { cacheLife, cacheTag } from "next/cache";
import { cache as reactCache } from "react";
import { PERFORMANCE_TAG, PORTFOLIOS_TAG, PUBLIC_DATA_TAG } from "@/lib/cache-tags";
import type {
  Portfolio,
  Holding,
  Alert,
  Profile,
  Follow,
  UserHolding,
} from "@/lib/types";
import { FREE_PLAN_FOLLOW_LIMIT, PRO_PLAN_FOLLOW_LIMIT } from "@/lib/types";
import { demoFallbackAllowed } from "@/lib/demo-mode";
import { DEMO_PORTFOLIOS, demoPortfolioBySlug, demoHoldings, demoAlerts, HIDDEN_DEMO_SLUGS, demoRedirectTarget, isHiddenSlug } from "@/lib/demo-data";
import {
  HOLDING_LIMITS,
  ALERT_LIMITS,
  type AccessRole,
} from "@/lib/access";
import { isPublicDisclosureSource } from "@/lib/public-disclosure";
import { cardStatFromSeries, cardStatsById, type CardStat } from "@/lib/card-series";
import { groupBySymbol, latestSnapshot } from "@/lib/composition";
import {
  FREE_BACKTEST_WINDOW_DAYS,
  trimSeriesToWindow,
} from "@/lib/backtest-window";

/** True cuando Supabase está configurado con valores reales (no placeholder). */
function isSupabaseLive(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return url.startsWith("https://") && !url.includes("placeholder");
}

// ---- Portfolios ----
export async function getPortfolios(filters?: {
  category?: string;
  search?: string;
  country?: string;
}): Promise<Portfolio[]> {
  // Sin backend real -> datos de demostración (el sitio se ve vivo).
  if (!isSupabaseLive()) {
    let list = DEMO_PORTFOLIOS.filter((p) => !isHiddenSlug(p.slug));
    if (filters?.category && filters.category !== "all") list = list.filter((p) => p.category === filters.category);
    if (filters?.country && filters.country !== "all") list = list.filter((p) => p.country === filters.country);
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || (p.manager ?? "").toLowerCase().includes(q));
    }
    return list;
  }
  return getPortfoliosPublic(
    filters?.category ?? "all",
    filters?.search ?? "",
    filters?.country ?? "all",
  );
}

/**
 * D36: lectura pública cacheada (1 h mínimo, tag "portfolios"). Cliente anon
 * sin cookies: el catálogo es público (RLS "portfolios public read").
 */
async function getPortfoliosPublic(category: string, search: string, country: string): Promise<Portfolio[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(PUBLIC_DATA_TAG, PORTFOLIOS_TAG);
  const filters = { category, search, country };
  const supabase = createPublicClient();
  let query = supabase
    .from("portfolios")
    .select("*")
    .eq("is_active", true)
    .order("followers", { ascending: false });

  if (filters?.category && filters.category !== "all") {
    query = query.eq("category", filters.category);
  }
  if (filters?.country && filters.country !== "all") {
    query = query.eq("country", filters.country);
  }
  if (filters?.search) {
    query = query.or(
      `name.ilike.%${filters.search}%,description.ilike.%${filters.search}%,manager.ilike.%${filters.search}%`,
    );
  }

  const { data, error } = await query;
  if (error) {
    console.warn("[reclu] getPortfolios error:", error.message);
    return [];
  }
  // DB real pero vacía (seed no corrido) -> caemos a demo para no ver el sitio vacío.
  if (!data || data.length === 0) {
    // D35: en producción nunca se muestran datos inventados.
    return demoFallbackAllowed() ? DEMO_PORTFOLIOS.filter((p) => !isHiddenSlug(p.slug)) : [];
  }
  return data;
}

/**
 * Slug real al que redirige un portafolio oculto (cifras inventadas), o `null`
 * si no aplica. Solo redirige si el portafolio real está activo/disponible.
 *
 * Lectura con el cliente anónimo: la política RLS `portfolios public read`
 * limita el select a `is_active = true`, así que normalmente la fila inactiva
 * no se puede leer y caemos al mapa estático de `demo-data` (no usamos el
 * cliente admin aquí). Si la RLS sí deja leer la fila, preferimos su
 * `replaced_by_slug`.
 */
export async function getPortfolioRedirect(slug: string): Promise<string | null> {
  if (!isHiddenSlug(slug)) return null;

  const fallback = HIDDEN_DEMO_SLUGS[slug] ?? null;
  if (!isSupabaseLive()) return demoRedirectTarget(slug);

  const supabase = await createClient();

  let target: string | null = fallback;
  const { data: hiddenRow } = await supabase
    .from("portfolios")
    .select("slug, replaced_by_slug, is_active")
    .eq("slug", slug)
    .maybeSingle();
  if (hiddenRow?.replaced_by_slug) target = hiddenRow.replaced_by_slug;
  if (!target) return null;

  // El destino solo vale si está activo (el cliente anónimo sí puede leerlo).
  const { data: realRow } = await supabase
    .from("portfolios")
    .select("slug, is_active")
    .eq("slug", target)
    .eq("is_active", true)
    .maybeSingle();
  return realRow ? target : null;
}

export async function getPortfolioBySlug(slug: string): Promise<Portfolio | null> {
  if (!isSupabaseLive()) return demoPortfolioBySlug(slug);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("portfolios")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();
  if (error) return null;
  return data;
}

function performanceValue(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string" && raw.trim() !== "") {
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

/**
 * Serie real de rendimiento. value = value_pct.
 * Sin tabla, sin filas o ante cualquier fallo: [] (no se inventa una curva).
 *
 * Muro 048: se pide por `get_portfolio_performance`, que recorta según el
 * plan de auth.uid() (premium oculto a no pagos, 90 días para anon/free).
 * Además se recorta otra vez en el servidor por si la RPC devolviera más
 * historial del que corresponde (defensa en profundidad).
 */
export async function getPerformance(
  portfolioId: string,
  limit = 365,
  opts?: { role?: AccessRole; source?: string | null },
): Promise<{ date: string; value: number }[]> {
  if (!isSupabaseLive()) return [];

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_portfolio_performance", {
      p_portfolio: portfolioId,
    });

    if (error || !Array.isArray(data)) {
      if (error) console.warn("[reclu] getPerformance error:", error.message);
      return [];
    }

    const points: { date: string; value: number }[] = [];
    for (const row of data) {
      if (!row || typeof row !== "object") continue;
      const record = row as { date?: unknown; value_pct?: unknown };
      const value = performanceValue(record.value_pct);
      if (typeof record.date !== "string" || record.date.length === 0 || value === null) continue;
      points.push({ date: record.date, value });
    }

    const trimmed =
      opts?.role && opts.role !== "paid"
        ? trimSeriesToWindow(points, FREE_BACKTEST_WINDOW_DAYS, opts?.source)
        : points;
    return trimmed.slice(-limit);
  } catch (err) {
    console.warn(
      "[reclu] getPerformance error:",
      err instanceof Error ? err.message : "unknown",
    );
    return [];
  }
}

// ---- Holdings ----
/**
 * Holdings ordenados por peso descendente.
 *
 * Muro de pago (migración 012): usa la función security definer
 * `get_portfolio_holdings` que recorta según el plan de auth.uid().
 * Si la función aún no existe (migración sin aplicar), cae a la lectura
 * anon directa y recorta en el servidor — la página nunca envía al
 * navegador más de lo que el plan permite.
 */
export async function getHoldings(
  portfolioId: string,
  opts?: { role?: AccessRole },
): Promise<Holding[]> {
  // En modo demo, portfolioId es el slug (d1, d7...). Resolvemos por slug.
  if (!isSupabaseLive()) {
    const slug = DEMO_PORTFOLIOS.find((p) => p.id === portfolioId)?.slug ?? portfolioId;
    const list = demoHoldings(slug);
    if (slug === "trump-compra") return list;
    return sliceHoldings(list, opts?.role);
  }

  const supabase = await createClient();

  // Camino con migración 012 aplicada: RPC con recorte en la base.
  const slugRow = await supabase
    .from("portfolios")
    .select("slug, source")
    .eq("id", portfolioId)
    .maybeSingle();
  if (slugRow.data?.slug) {
    const { data: rpc, error: rpcError } = await supabase
      .rpc("get_portfolio_holdings", { p_slug: slugRow.data.slug });
    if (!rpcError && Array.isArray(rpc)) {
      // D39: sin la migración 067 la RPC trae todos los snapshots mezclados.
      return currentHoldings(rpc as Holding[]);
    }
    // Si la función no existe, seguimos por el camino legacy de abajo.
  }

  // Fallback (migración no aplicada): lectura directa + recorte servidor.
  const { data, error } = await supabase
    .from("holdings")
    .select("*")
    .eq("portfolio_id", portfolioId)
    .order("weight", { ascending: false });
  if (error) {
    console.warn("[reclu] getHoldings error:", error.message);
    return [];
  }
  if (!data || data.length === 0) {
    if (!demoFallbackAllowed()) return [];
    // Buscar el slug real para servir demo si la DB está vacía.
    const { data: pf } = await supabase.from("portfolios").select("slug").eq("id", portfolioId).maybeSingle();
    return pf ? sliceHoldings(demoHoldings(pf.slug), opts?.role) : [];
  }
  const current = currentHoldings(data as Holding[]);
  if (isPublicDisclosureSource(slugRow.data?.source)) return current;
  return sliceHoldings(current, opts?.role);
}

/** D39: último snapshot (as_of) y una fila por símbolo. */
function currentHoldings(list: Holding[]): Holding[] {
  return groupBySymbol(latestSnapshot(list));
}

/** Recorte en servidor según rol (muro de pago real). */
function sliceHoldings(list: Holding[], role: AccessRole | undefined): Holding[] {
  if (!role) return list;
  const limit = HOLDING_LIMITS[role];
  return Number.isFinite(limit) ? list.slice(0, limit) : list;
}

/**
 * Holdings COMPLETOS con cliente de servicio — solo agregados del servidor
 * (radar de consenso, filtros por símbolo, comparador). El resultado se
 * agrega antes de llegar al navegador; nunca se expone crudo.
 * Requiere migración 012 aplicada si el catálogo vive tras el muro.
 */
export async function getAllHoldingsAdmin(portfolioId: string): Promise<Holding[]> {
  const admin = createAdminClient();
  if (!admin) return getHoldings(portfolioId);
  const { data, error } = await admin
    .from("holdings")
    .select("*")
    .eq("portfolio_id", portfolioId)
    .order("weight", { ascending: false });
  if (error) {
    console.warn("[reclu] getAllHoldingsAdmin error:", error.message);
    return [];
  }
  return (data ?? []) as Holding[];
}

/**
 * Símbolos de varios portafolios en UNA consulta (cliente de servicio),
 * para agregados del servidor (consenso, filtro por símbolo). Nunca se
 * envía crudo al navegador. Sin cliente de servicio cae a la lectura
 * por portafolio (getAllHoldingsAdmin).
 */
/**
 * Serie completa de rendimiento leída con el cliente admin, SOLO para que el
 * servidor calcule el % agregado del ranking. Nunca se envía la serie al
 * cliente (el muro de 90 días de getPerformance sigue aplicando a los gráficos).
 */
export async function getPerformanceSeriesAdmin(
  portfolioIds: string[],
): Promise<Map<string, { date: string; value: number; estimated: boolean }[]>> {
  const out = new Map<string, { date: string; value: number; estimated: boolean }[]>();
  if (portfolioIds.length === 0 || !isSupabaseLive()) return out;
  const ids = [...new Set(portfolioIds)].sort();
  const byId = await getPerformanceSeriesAdminCached(ids);
  for (const id of portfolioIds) {
    const points = byId[id];
    if (points) out.set(id, points);
  }
  return out;
}

/** Filas por página de PostgREST (max-rows por defecto de Supabase). */
export const PERFORMANCE_PAGE_SIZE = 1000;

type SeriesRow = { portfolio_id?: unknown; date?: unknown; value_pct?: unknown; is_estimated?: unknown };

/**
 * Agrupa filas de portfolio_performance por portafolio (orden por fecha).
 * Pura: cubierta en tests/d36-cache.test.ts.
 */
export function groupPerformanceRows(
  rows: SeriesRow[],
  ids: string[],
): Record<string, { date: string; value: number; estimated: boolean }[]> {
  const out: Record<string, { date: string; value: number; estimated: boolean }[]> = {};
  for (const id of ids) out[id] = [];
  for (const row of rows) {
    if (typeof row.portfolio_id !== "string" || !(row.portfolio_id in out)) continue;
    const value = performanceValue(row.value_pct);
    if (typeof row.date !== "string" || value === null) continue;
    out[row.portfolio_id].push({ date: row.date, value, estimated: row.is_estimated === true });
  }
  for (const id of ids) out[id].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

/**
 * D36: una sola consulta `.in("portfolio_id", ids)` (antes, un await por
 * portafolio). Se pagina por PERFORMANCE_PAGE_SIZE: la primera página trae
 * el conteo y el resto se pide en paralelo. Cacheada 1 h (tag "performance").
 * Si una página falla se devuelve lo que se pudo agrupar (sin inventar).
 */
async function getPerformanceSeriesAdminCached(
  ids: string[],
): Promise<Record<string, { date: string; value: number; estimated: boolean }[]>> {
  "use cache";
  cacheLife("hours");
  cacheTag(PUBLIC_DATA_TAG, PERFORMANCE_TAG);
  const admin = createAdminClient();
  if (!admin || ids.length === 0) return {};
  const since = new Date(Date.now() - 800 * 86_400_000).toISOString().slice(0, 10);
  const page = (from: number, withCount: boolean) =>
    admin
      .from("portfolio_performance")
      .select("portfolio_id,date,value_pct,is_estimated", withCount ? { count: "exact" } : undefined)
      .in("portfolio_id", ids)
      .gte("date", since)
      .order("portfolio_id", { ascending: true })
      .order("date", { ascending: true })
      .range(from, from + PERFORMANCE_PAGE_SIZE - 1);
  try {
    const first = await page(0, true);
    if (first.error || !Array.isArray(first.data)) {
      if (first.error) console.warn("[reclu] getPerformanceSeriesAdmin error:", first.error.message);
      return groupPerformanceRows([], ids);
    }
    const rows: SeriesRow[] = [...(first.data as SeriesRow[])];
    const total = typeof first.count === "number" ? first.count : rows.length;
    const offsets: number[] = [];
    for (let from = PERFORMANCE_PAGE_SIZE; from < total; from += PERFORMANCE_PAGE_SIZE) offsets.push(from);
    const rest = await Promise.all(offsets.map((from) => page(from, false)));
    for (const res of rest) {
      if (res.error || !Array.isArray(res.data)) continue;
      rows.push(...(res.data as SeriesRow[]));
    }
    return groupPerformanceRows(rows, ids);
  } catch (err) {
    console.warn("[reclu] getPerformanceSeriesAdmin error:", err instanceof Error ? err.message : "unknown");
    return groupPerformanceRows([], ids);
  }
}

/**
 * Última fecha con punto estimado (proyección con posiciones actuales) de un
 * portafolio, o null si toda la serie es real. Solo expone una fecha.
 */
/**
 * D29: ids de portafolios con al menos un punto en portfolio_performance
 * (RPC 060, solo ids). null si la RPC no existe o falla: la UI no marca nada.
 */
export async function getPortfolioIdsWithSeriesAdmin(): Promise<Set<string> | null> {
  if (!isSupabaseLive()) return null;
  const ids = await getPortfolioIdsWithSeriesCached();
  return ids ? new Set(ids) : null;
}

/** D36: cacheada 1 h (tag "performance"); devuelve un arreglo serializable. */
async function getPortfolioIdsWithSeriesCached(): Promise<string[] | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(PUBLIC_DATA_TAG, PERFORMANCE_TAG);
  const set = await readPortfolioIdsWithSeries();
  return set ? [...set] : null;
}

async function readPortfolioIdsWithSeries(): Promise<Set<string> | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  try {
    const { data, error } = await admin.rpc("portfolio_ids_with_series");
    if (error || !Array.isArray(data)) return null;
    const ids = new Set<string>();
    for (const row of data as unknown[]) {
      if (typeof row === "string") ids.add(row);
      else if (row && typeof row === "object") {
        const v = Object.values(row as Record<string, unknown>)[0];
        if (typeof v === "string") ids.add(v);
      }
    }
    return ids;
  } catch {
    return null;
  }
}

export async function getEstimatedUntil(portfolioId: string): Promise<string | null> {
  if (!isSupabaseLive()) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  try {
    const { data, error } = await admin
      .from("portfolio_performance")
      .select("date")
      .eq("portfolio_id", portfolioId)
      .eq("is_estimated", true)
      .order("date", { ascending: false })
      .limit(1);
    if (error || !Array.isArray(data) || data.length === 0) return null;
    const date = (data[0] as { date?: unknown }).date;
    return typeof date === "string" ? date : null;
  } catch {
    return null;
  }
}

/**
 * D43: retorno + sparkline de TODAS las tarjetas del catalogo, ya calculados
 * (unos KB). Antes /explore pedia la serie completa (~800 dias x ~120
 * portafolios, decenas de miles de filas, ~100 paginas) dos veces por
 * request y la cache en memoria casi nunca acertaba.
 */
export async function getExploreCardStats(): Promise<Record<string, CardStat>> {
  if (!isSupabaseLive()) return {};
  try {
    return await getExploreCardStatsCached();
  } catch (err) {
    console.warn("[reclu] getExploreCardStats error:", err instanceof Error ? err.message : String(err));
    return {};
  }
}

async function getExploreCardStatsCached(): Promise<Record<string, CardStat>> {
  "use cache: remote";
  cacheLife("hours");
  cacheTag(PUBLIC_DATA_TAG, PERFORMANCE_TAG, PORTFOLIOS_TAG);
  const catalog = await getPortfoliosPublic("all", "", "all");
  const ids = [...new Set(catalog.map((p) => p.id))].sort();
  const byId = await getPerformanceSeriesAdminCached(ids);
  const series = new Map(Object.entries(byId));
  return cardStatsById(catalog, series);
}

/** Toma las tarjetas pedidas; sin serie => tarjeta sin cifra. */
export function pickCardStats(
  portfolios: readonly { id: string; slug: string }[],
  all: Record<string, CardStat>,
): Record<string, CardStat> {
  const out: Record<string, CardStat> = {};
  for (const p of portfolios) out[p.id] = all[p.id] ?? cardStatFromSeries(p.slug, undefined);
  return out;
}

/**
 * D43: alertas publicadas por portafolio (todas, no solo las ultimas 100 que
 * devolvia get_alerts), cacheadas en remoto 1 h. Los premium se marcan para
 * filtrarlos por plan fuera del cache.
 */
export async function getAlertCountsForRanking(paid: boolean): Promise<Record<string, number>> {
  if (!isSupabaseLive()) return {};
  try {
    const rows = await getAlertCountsCached();
    const out: Record<string, number> = {};
    for (const [id, v] of Object.entries(rows)) if (!v.premium || paid) out[id] = v.count;
    return out;
  } catch (err) {
    console.warn("[reclu] getAlertCountsForRanking error:", err instanceof Error ? err.message : String(err));
    return {};
  }
}

async function getAlertCountsCached(): Promise<Record<string, { count: number; premium: boolean }>> {
  "use cache: remote";
  cacheLife("hours");
  cacheTag(PUBLIC_DATA_TAG, PORTFOLIOS_TAG);
  const admin = createAdminClient();
  if (!admin) return {};
  const { data: pfs, error } = await admin.from("portfolios").select("id, premium").eq("is_active", true);
  if (error || !Array.isArray(pfs)) throw new Error(error?.message || "portfolios");
  const premium = new Map((pfs as { id: string; premium?: boolean }[]).map((p) => [p.id, p.premium === true]));
  const out: Record<string, { count: number; premium: boolean }> = {};
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error: aErr } = await admin
      .from("alerts")
      .select("portfolio_id")
      .eq("is_published", true)
      .order("id")
      .range(from, from + PAGE - 1);
    if (aErr) throw new Error(aErr.message || "alerts");
    for (const row of data ?? []) {
      const id = (row as { portfolio_id?: unknown }).portfolio_id;
      if (typeof id !== "string" || !premium.has(id)) continue;
      const cur = out[id] ?? { count: 0, premium: premium.get(id) === true };
      cur.count += 1;
      out[id] = cur;
    }
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export async function getHoldingSymbolsAdmin(
  portfolioIds: string[],
): Promise<{ portfolio_id: string; symbol: string }[]> {
  if (portfolioIds.length === 0) return [];
  const admin = createAdminClient();
  if (!admin) {
    const lists = await Promise.all(
      portfolioIds.map(async (id) =>
        (await getAllHoldingsAdmin(id)).map((h) => ({ portfolio_id: id, symbol: h.symbol })),
      ),
    );
    return lists.flat();
  }
  try {
    return await getHoldingSymbolsCached([...new Set(portfolioIds)].sort());
  } catch (err) {
    const e = err as { message?: string; code?: string } | undefined;
    console.warn("[reclu] getHoldingSymbolsAdmin error:", e?.message || e?.code || String(err));
    return [];
  }
}

/**
 * D42: cacheada 1 h (tag portfolios). Pagina con range(): antes un .in() de
 * 200 portafolios devolvia como mucho 1000 filas (tope de PostgREST) y el
 * consenso quedaba truncado. Un error se lanza para no cachear una lista vacia.
 */
async function getHoldingSymbolsCached(portfolioIds: string[]): Promise<{ portfolio_id: string; symbol: string }[]> {
  // D43: remoto. /explore se renderiza por request (searchParams + cookies) y
  // en Vercel cada instancia tiene su propia memoria: con "use cache" el
  // hit rate era bajo y cada request repetia las consultas.
  "use cache: remote";
  cacheLife("hours");
  cacheTag(PUBLIC_DATA_TAG, PORTFOLIOS_TAG);
  const admin = createAdminClient();
  if (!admin) return [];
  const out: { portfolio_id: string; symbol: string }[] = [];
  const PAGE = 1000;
  for (let i = 0; i < portfolioIds.length; i += 200) {
    const chunk = portfolioIds.slice(i, i + 200);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await admin
        .from("holdings")
        .select("portfolio_id, symbol")
        .in("portfolio_id", chunk)
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message || error.code || "holdings");
      for (const row of data ?? []) {
        const r = row as { portfolio_id?: unknown; symbol?: unknown };
        if (typeof r.portfolio_id === "string" && typeof r.symbol === "string") {
          out.push({ portfolio_id: r.portfolio_id, symbol: r.symbol });
        }
      }
      if (!data || data.length < PAGE) break;
    }
  }
  return out;
}

// ---- Alerts ----
/**
 * Alertas publicadas. Muro de pago: usa la función security definer
 * `get_alerts`, que recorta según el plan de auth.uid() (topes 3/10/p_limit)
 * y devuelve `summary` solo a pro/elite. El rol de la app se aplica otra vez
 * en el servidor (defensa en profundidad).
 *
 * `portfolioIds` permite juntar las alertas de varios portafolios (dashboard)
 * sin leer la tabla directo. La lectura directa de `alerts` ya no sirve para
 * anon/authenticated: la 048 revocó el privilegio sobre `summary` y un
 * `select("*")` falla.
 */
export async function getAlerts(
  portfolioId?: string,
  limit = 20,
  opts?: { role?: AccessRole; portfolioIds?: string[] },
): Promise<Alert[]> {
  const ids = opts?.portfolioIds?.length
    ? opts.portfolioIds
    : [portfolioId];

  if (!isSupabaseLive()) {
    const demo = portfolioId
      ? demoAlerts(portfolioId)
      : opts?.portfolioIds?.length
        ? demoAlerts().filter((alert) => ids.includes(alert.portfolio_id))
        : demoAlerts();
    return applyAlertAccess(demo, opts?.role).slice(0, limit);
  }

  try {
    const supabase = await createClient();
    const responses = await Promise.all(
      ids.map((id) =>
        supabase.rpc("get_alerts", {
          p_portfolio: id ?? null,
          p_limit: Math.min(Math.max(limit, 1), 100),
        }),
      ),
    );

    const merged: Alert[] = [];
    for (const { data, error } of responses) {
      if (error) {
        console.warn("[reclu] getAlerts error:", error.message);
        continue;
      }
      if (Array.isArray(data)) merged.push(...(data as Alert[]));
    }

    const byId = new Map<string, Alert>();
    for (const alert of merged) {
      if (alert?.id) byId.set(alert.id, alert);
    }
    const sorted = [...byId.values()].sort((a, b) =>
      String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
    );
    return applyAlertAccess(sorted, opts?.role).slice(0, limit);
  } catch (err) {
    console.warn(
      "[reclu] getAlerts error:",
      err instanceof Error ? err.message : "unknown",
    );
    return [];
  }
}

/**
 * Recorte de alertas según rol (muro de pago real). Para anon/free el
 * resumen AI se elimina aunque la RPC lo devolviera.
 */
function applyAlertAccess(list: Alert[], role: AccessRole | undefined): Alert[] {
  const limit = role ? ALERT_LIMITS[role] : Infinity;
  const capped = Number.isFinite(limit) ? list.slice(0, limit) : list;
  if (!role || role === "paid") return capped;
  return capped.map((alert) => ({ ...alert, summary: null }));
}

// ---- Profile ----
/** D43: auth.getUser() es una llamada de red; se deduplica por request. */
const getAuthUser = reactCache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
});

export const getProfile = reactCache(async (): Promise<Profile | null> => {
  const { supabase, user } = await getAuthUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (error) return null;
  return data;
});

// ---- Follows ----
export async function getFollows(): Promise<Follow[]> {
  const { supabase, user } = await getAuthUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("follows")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[reclu] getFollows error:", error.message);
    return [];
  }
  return data ?? [];
}

export async function isFollowing(portfolioId: string): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("follows")
    .select("portfolio_id")
    .eq("user_id", user.id)
    .eq("portfolio_id", portfolioId)
    .maybeSingle();
  return !!data;
}

/**
 * Follow a portfolio, enforcing plan limits (free 2 / pro 15 / elite unlimited).
 * Returns { ok, error, reason?, limit? }.
 */
export async function followPortfolio(portfolioId: string): Promise<{
  ok: boolean;
  error?: string;
  reason?: "limit_reached" | "auth_required" | "premium_required";
  /** Plan limit hit, for a tailored message. */
  limit?: number;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "auth_required" };

  // Check plan + limits
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .single();
  const plan = profile?.plan ?? "free";

  // Check portfolio premium status (any paid plan unlocks it)
  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("premium")
    .eq("id", portfolioId)
    .single();
  if (portfolio?.premium && (plan === "free")) {
    return { ok: false, reason: "premium_required" };
  }

  if (plan !== "elite") {
    // Límite desde la fuente única src/lib/plans.ts (free 2 / pro 15).
    // Nota: isTrialPro no aplica al límite de follows (la prueba es de Pro
    // para alertas/IA; el límite de seguidos sigue siendo el del plan real).
    const limit = plan === "pro" ? PRO_PLAN_FOLLOW_LIMIT : FREE_PLAN_FOLLOW_LIMIT;
    const { count } = await supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);
    if ((count ?? 0) >= limit) {
      return { ok: false, reason: "limit_reached", limit };
    }
  }

  const { error } = await supabase
    .from("follows")
    .insert({ user_id: user.id, portfolio_id: portfolioId });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function unfollowPortfolio(portfolioId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("user_id", user.id)
    .eq("portfolio_id", portfolioId);
  return { ok: !error };
}

// ---- User's own holdings (comparison) ----
export async function getUserHoldings(): Promise<UserHolding[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("user_holdings")
    // F80: solo las columnas que usan los consumidores (compare y el editor).
    // Antes era select("*"), que también arrastraba id, user_id y created_at.
    .select("symbol,name,weight,quantity,avg_cost,market,currency")
    .eq("user_id", user.id)
    .order("weight", { ascending: false });
  if (error) {
    console.warn("[reclu] getUserHoldings error:", error.message);
    return [];
  }
  return data ?? [];
}

/**
 * D40: nombre real por símbolo, tomado de otras filas de `holdings` que sí
 * lo traen (13F, ETF). Solo lectura con cliente de servicio, cacheada 1 h.
 * Símbolos sin ningún nombre conocido no aparecen (no se inventa).
 */
export async function getSymbolNamesAdmin(symbols: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(symbols.map((s) => String(s ?? "").trim().toUpperCase()))].filter((s) => s && s.length <= 12).sort();
  if (unique.length === 0 || !isSupabaseLive()) return new Map();
  const rows = await getSymbolNamesCached(unique);
  return new Map(rows);
}

async function getSymbolNamesCached(symbols: string[]): Promise<[string, string][]> {
  "use cache";
  cacheLife("hours");
  cacheTag(PUBLIC_DATA_TAG, PORTFOLIOS_TAG);
  const admin = createAdminClient();
  if (!admin) return [];
  try {
    const { data, error } = await admin
      .from("holdings")
      .select("symbol,name")
      .in("symbol", symbols)
      .not("name", "is", null)
      .limit(2000);
    if (error || !Array.isArray(data)) return [];
    const out = new Map<string, string>();
    for (const row of data as { symbol?: unknown; name?: unknown }[]) {
      const sym = typeof row.symbol === "string" ? row.symbol.trim().toUpperCase() : "";
      const name = typeof row.name === "string" ? row.name.replace(/^\s*corto\s*:\s*/i, "").trim() : "";
      if (!sym || !name || name.toUpperCase() === sym) continue;
      const prev = out.get(sym);
      // Prefiere el nombre más largo (suele ser el oficial del 13F/ETF).
      if (!prev || name.length > prev.length) out.set(sym, name);
    }
    return [...out];
  } catch {
    return [];
  }
}
