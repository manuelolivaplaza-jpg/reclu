/**
 * news-feed.ts — lectura pública de noticias para el feed de F72.
 *
 * `news_items` y `news_tickers` son de lectura pública, pero la migración 051
 * solo concede las columnas `id, source, url, title, published_at` (nunca
 * `summary`). Las posiciones NO se leen aquí: las pasa la página desde el
 * cliente de sesión, que es el único que puede verlas por RLS.
 *
 * El cliente de Supabase se recibe como argumento para poder probar el
 * ensamblado sin red y para no crear un cliente nuevo en cada consulta.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildImpactFeed, type FeedNews, type ImpactFeedEntry } from "@/lib/impact-feed";
import type { NewsRelation, Position, TickerProfile } from "@/lib/news-match";

/** Ventana de noticias que se consulta (el retraso máximo de plan es 24 h). */
export const NEWS_LOOKBACK_DAYS = 7;
/** Tope de noticias crudas por lectura antes de ordenar por relevancia. */
export const NEWS_FETCH_LIMIT = 80;

const CHUNK = 50;

const VALID_RELATIONS: readonly NewsRelation[] = [
  "direct",
  "sector",
  "supplier",
  "competitor",
  "macro",
];

interface NewsRow {
  id: string;
  source: string;
  url: string;
  title: string;
  published_at: string;
}

interface NewsTickerRow {
  news_id: string;
  symbol: string;
  relation: string;
  confidence: number | string | null;
}

interface ProfileRow {
  symbol: string;
  sector: string | null;
  industry: string | null;
  peers: string[] | null;
  suppliers: string[] | null;
  macro_factors: string[] | null;
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function toConfidence(value: number | string | null): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 1;
}

/**
 * Noticias de los últimos `days` días con sus tickers. Devuelve `[]` si la
 * consulta falla: la página sigue funcionando sin feed.
 */
export async function loadRecentNews(
  supabase: SupabaseClient,
  options: { sinceIso: string; limit?: number },
): Promise<FeedNews[]> {
  const limit = options.limit ?? NEWS_FETCH_LIMIT;
  const { data, error } = await supabase
    .from("news_items")
    .select("id, source, url, title, published_at")
    .gte("published_at", options.sinceIso)
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[reclu] news_items:", error.message);
    return [];
  }

  const rows = (data ?? []) as NewsRow[];
  if (rows.length === 0) return [];

  const tickersByNews = new Map<string, FeedNews["tickers"]>();
  for (const group of chunks(
    rows.map((row) => row.id),
    CHUNK,
  )) {
    const { data: tickerData, error: tickerError } = await supabase
      .from("news_tickers")
      .select("news_id, symbol, relation, confidence")
      .in("news_id", group);

    if (tickerError) {
      console.warn("[reclu] news_tickers:", tickerError.message);
      continue;
    }

    for (const row of (tickerData ?? []) as NewsTickerRow[]) {
      const relation = VALID_RELATIONS.find((value) => value === row.relation);
      const symbol = String(row.symbol ?? "").trim().toUpperCase();
      if (!relation || symbol.length === 0) continue;
      const list = tickersByNews.get(row.news_id) ?? [];
      list.push({ symbol, relation, confidence: toConfidence(row.confidence) });
      tickersByNews.set(row.news_id, list);
    }
  }

  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    url: row.url,
    title: row.title,
    publishedAt: row.published_at,
    tickers: tickersByNews.get(row.id) ?? [],
  }));
}

/** Perfiles curados (`ticker_profile`) para los símbolos pedidos. */
export async function loadTickerProfiles(
  supabase: SupabaseClient,
  symbols: readonly string[],
): Promise<TickerProfile[]> {
  const unique = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()))].filter(
    (symbol) => symbol.length > 0,
  );
  if (unique.length === 0) return [];

  const profiles: TickerProfile[] = [];
  for (const group of chunks(unique, CHUNK)) {
    const { data, error } = await supabase
      .from("ticker_profile")
      .select("symbol, sector, industry, peers, suppliers, macro_factors")
      .in("symbol", group);

    if (error) {
      console.warn("[reclu] ticker_profile:", error.message);
      continue;
    }

    for (const row of (data ?? []) as ProfileRow[]) {
      profiles.push({
        symbol: String(row.symbol ?? "").trim().toUpperCase(),
        sector: row.sector ?? "",
        industry: row.industry ?? "",
        peers: row.peers ?? [],
        suppliers: row.suppliers ?? [],
        macroFactors: row.macro_factors ?? [],
      });
    }
  }

  return profiles;
}

export interface LoadImpactFeedOptions {
  /** Posiciones con peso en % (ver `valuatePortfolio`). */
  positions: readonly Position[];
  plan?: string | null;
  trialEndsAt?: string | null;
  delayHours?: number;
  now?: number;
  limit?: number;
}

/**
 * Carga y cruza las noticias recientes con la cartera. No lanza: si falta una
 * tabla o falla una lectura, devuelve lo que haya (posiblemente `[]`).
 */
export async function loadImpactFeed(
  supabase: SupabaseClient,
  options: LoadImpactFeedOptions,
): Promise<ImpactFeedEntry[]> {
  if (options.positions.length === 0) return [];

  const now =
    typeof options.now === "number" && Number.isFinite(options.now)
      ? options.now
      : Date.now();
  const sinceIso = new Date(now - NEWS_LOOKBACK_DAYS * 86_400_000).toISOString();

  const news = await loadRecentNews(supabase, { sinceIso });

  const symbols = new Set<string>();
  for (const position of options.positions) {
    symbols.add(position.symbol.trim().toUpperCase());
  }
  for (const item of news) {
    for (const ticker of item.tickers) symbols.add(ticker.symbol);
  }

  const profiles = await loadTickerProfiles(supabase, [...symbols]);

  return buildImpactFeed({
    news,
    positions: options.positions,
    profiles,
    plan: options.plan,
    trialEndsAt: options.trialEndsAt,
    delayHours: options.delayHours,
    now,
    limit: options.limit,
  });
}
