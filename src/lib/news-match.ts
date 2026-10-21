/**
 * Matcher noticia → tickers y relevancia (F68).
 *
 * Función pura: no toca la red ni la base de datos. El llamador decide si la
 * función está habilitada (`isNewsImpactEnabled()` de `portfolio-flags.ts`) y
 * pasa las relaciones permitidas por plan (`newsRelationsFor()` de `plans.ts`).
 *
 * Regla de relevancia (docs/mi-portafolio-ia.md §5):
 *   relevancia = confianza × (peso / 100) × importancia
 *
 * La importancia es 1 por defecto y 1,2 para un 8-K con los items 1.01
 * (acuerdo material), 2.01 (cierre de adquisición) o 5.02 (cambio de
 * directivos). No se usa ningún LLM: la exposición es la suma de pesos de las
 * posiciones tocadas.
 */

import type { NewsRelation } from "@/lib/plans";
import { newsRelationsFor } from "@/lib/plans";

export type { NewsRelation } from "@/lib/plans";

// ---- Tipos ----

/** Ticker mencionado por la fuente de la noticia. */
export interface NewsTicker {
  symbol: string;
  relation: NewsRelation;
  /** Confianza de la fuente, 0–1. */
  confidence: number;
}

/** Noticia normalizada (news_items de la migración 051). */
export interface NewsItem {
  id: string;
  source: string;
  title: string;
  publishedAt: string;
  tickers: NewsTicker[];
  /** Formulario SEC cuando la fuente lo trae (p. ej. "8-K"). */
  form?: string;
  /** Items del 8-K cuando la fuente los trae (p. ej. ["5.02"]). */
  items?: string[];
}

/** Perfil de un ticker (ticker_profile de la migración 051). */
export interface TickerProfile {
  symbol: string;
  sector: string;
  industry: string;
  peers: string[];
  suppliers: string[];
  /** Factores macro que afectan al ticker (p. ej. ["tasas", "cobre"]). */
  macroFactors: string[];
}

/** Posición del usuario. El peso va en porcentaje, 0–100. */
export interface Position {
  symbol: string;
  weight: number;
}

/** Resultado del cruce noticia × cartera. */
export interface NewsMatch {
  symbol: string;
  relation: NewsRelation;
  /** Confianza de la relación, 0–1. */
  confidence: number;
  /** Peso de la posición tocada, 0–100. */
  exposurePct: number;
  /** confianza × (peso / 100) × importancia. */
  relevance: number;
}

/** Opciones del matcher. */
export interface MatchOptions {
  /** Plan del usuario; define qué relaciones ve (Gratis solo directas). */
  plan?: string | null;
  /** Fin de la prueba de Pro (para `newsRelationsFor`). */
  trialEndsAt?: string | null;
  /** Reloj para evaluar la prueba; por defecto `Date.now()`. */
  now?: number;
  /** Relevancia mínima para incluir un match (por defecto 0). */
  minRelevance?: number;
  /** Atajo para tests o feeds ya filtrados: reemplaza lo que da el plan. */
  relations?: readonly NewsRelation[];
}

// ---- Diccionario macro (español e inglés) ----

export interface MacroTopic {
  /** Identificador estable del factor. */
  id: string;
  /** Palabras clave que activan el tema en el título. */
  keywords: readonly string[];
}

export const MACRO_KEYWORDS: readonly MacroTopic[] = [
  { id: "tasa", keywords: ["tasa", "tasas", "rate", "rates"] },
  { id: "cobre", keywords: ["cobre", "copper"] },
  { id: "litio", keywords: ["litio", "lithium"] },
  { id: "dolar", keywords: ["dolar", "dólar", "peso", "pesos", "dollar", "dollars"] },
  { id: "petroleo", keywords: ["petroleo", "petróleo", "oil", "crude"] },
  { id: "arancel", keywords: ["arancel", "aranceles", "tariff", "tariffs"] },
] as const;

/** Items de 8-K que suben la importancia a 1,2. */
export const IMPORTANT_8K_ITEMS: readonly string[] = ["1.01", "2.01", "5.02"];

/** Importancia por defecto de una noticia. */
export const DEFAULT_IMPORTANCE = 1;
/** Importancia de un 8-K con un item relevante. */
export const IMPORTANT_8K_IMPORTANCE = 1.2;

const SECTOR_CONFIDENCE = 0.5;
const SUPPLIER_CONFIDENCE = 0.4;
const COMPETITOR_CONFIDENCE = 0.4;
const MACRO_CONFIDENCE = 0.3;

/** Prioridad para desempatar duplicados: directo manda sobre lo indirecto. */
const RELATION_PRIORITY: Record<NewsRelation, number> = {
  direct: 0,
  sector: 1,
  supplier: 2,
  competitor: 3,
  macro: 4,
};

// ---- Helpers internos ----

function normalizeSymbol(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

/** Minúsculas y sin tildes, para comparar sectores y keywords. */
function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function clamp01(value: number | null | undefined, fallback = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function clampWeight(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/** ¿El texto contiene la palabra/frase como token completo? */
function containsKeyword(haystack: string, keyword: string): boolean {
  const needle = normalizeText(keyword);
  if (needle.length === 0) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(haystack);
}

function symbolSet(values: string[] | null | undefined): Set<string> {
  return new Set((values ?? []).map(normalizeSymbol).filter((s) => s.length > 0));
}

function profileMap(profiles: TickerProfile[]): Map<string, TickerProfile> {
  const map = new Map<string, TickerProfile>();
  for (const profile of profiles) {
    const symbol = normalizeSymbol(profile.symbol);
    if (symbol.length > 0 && !map.has(symbol)) map.set(symbol, profile);
  }
  return map;
}

/**
 * Importancia de la noticia: 1,2 si es un 8-K con items 1.01, 2.01 o 5.02;
 * 1 en cualquier otro caso.
 */
export function newsImportance(news: Pick<NewsItem, "title" | "form" | "items">): number {
  const form = normalizeText(news.form);
  const title = normalizeText(news.title);
  const isEightK = containsKeyword(form, "8-k") || containsKeyword(title, "8-k");
  if (!isEightK) return DEFAULT_IMPORTANCE;

  const items = (news.items ?? []).map((item) => item.trim());
  const titleItems = title.match(/\b(1\.01|2\.01|5\.02)\b/g) ?? [];
  const all = new Set([...items, ...titleItems]);
  return IMPORTANT_8K_ITEMS.some((item) => all.has(item))
    ? IMPORTANT_8K_IMPORTANCE
    : DEFAULT_IMPORTANCE;
}

/** Temas macro que aparecen en el título (según `MACRO_KEYWORDS`). */
function macroTopicsInTitle(title: string): MacroTopic[] {
  const normalizedTitle = normalizeText(title);
  return MACRO_KEYWORDS.filter((topic) =>
    topic.keywords.some((keyword) => containsKeyword(normalizedTitle, keyword)),
  );
}

/** ¿El perfil declara el tema macro? Acepta "rates", "tasas" o "tasa de interés". */
function profileHasMacroFactor(
  profile: TickerProfile,
  topic: MacroTopic,
): boolean {
  const factors = profile.macroFactors ?? [];
  return factors.some((factor) => {
    const normalized = normalizeText(factor);
    if (normalized.length === 0) return false;
    if (normalized === normalizeText(topic.id)) return true;
    return topic.keywords.some((keyword) =>
      containsKeyword(normalized, keyword),
    );
  });
}

/**
 * Noticias de 8-K suelen llegar con el item en el título ("8-K - Item 5.02").
 * Se expone por si el llamador quiere mostrarlo.
 */
export function isImportantEightK(
  news: Pick<NewsItem, "title" | "form" | "items">,
): boolean {
  return newsImportance(news) > DEFAULT_IMPORTANCE;
}

// ---- Matcher principal ----

/**
 * Cruza una noticia con la cartera y devuelve una fila por ticker tocado.
 *
 * Reglas:
 * - `direct`: el ticker de la noticia está en la cartera (confianza de la fuente).
 * - `sector`: el ticker de la noticia y una posición comparten sector (0,5).
 * - `competitor`: el ticker de la noticia está en `peers` de una posición (0,4).
 * - `supplier`: el ticker de la noticia está en `suppliers` de una posición (0,4).
 * - `macro`: una keyword del título calza con `macroFactors` (0,3).
 *
 * Nunca devuelve duplicados: si un símbolo calza por varias vías se queda con
 * la relación de mayor prioridad (directo > sector > proveedor > competidor >
 * macro) y, dentro de la misma relación, con la mayor confianza. El resultado
 * viene ordenado por relevancia descendente y luego por símbolo.
 */
export function matchNewsToPortfolio(
  news: NewsItem,
  positions: Position[],
  profiles: TickerProfile[],
  opts: MatchOptions = {},
): NewsMatch[] {
  if (positions.length === 0) return [];

  const allowed = new Set<NewsRelation>(
    opts.relations ?? newsRelationsFor(opts.plan, opts.trialEndsAt, opts.now),
  );
  const minRelevance =
    typeof opts.minRelevance === "number" && Number.isFinite(opts.minRelevance)
      ? opts.minRelevance
      : 0;
  const importance = newsImportance(news);
  const bySymbol = profileMap(profiles);

  const newsTickers = news.tickers
    .map((ticker) => ({
      symbol: normalizeSymbol(ticker.symbol),
      confidence: clamp01(ticker.confidence, 1),
    }))
    .filter((ticker) => ticker.symbol.length > 0);

  const candidates = new Map<string, NewsMatch>();

  const add = (match: NewsMatch) => {
    if (!allowed.has(match.relation)) return;
    const current = candidates.get(match.symbol);
    if (!current) {
      candidates.set(match.symbol, match);
      return;
    }
    const betterRelation =
      RELATION_PRIORITY[match.relation] < RELATION_PRIORITY[current.relation];
    const sameRelation =
      RELATION_PRIORITY[match.relation] === RELATION_PRIORITY[current.relation];
    if (betterRelation || (sameRelation && match.confidence > current.confidence)) {
      candidates.set(match.symbol, match);
    }
  };

  for (const position of positions) {
    const symbol = normalizeSymbol(position.symbol);
    if (symbol.length === 0) continue;

    const weight = clampWeight(position.weight);
    const positionProfile = bySymbol.get(symbol);
    const base = { symbol, exposurePct: weight };

    // Directo: el ticker de la noticia es la posición.
    const directTickers = newsTickers.filter((ticker) => ticker.symbol === symbol);
    if (directTickers.length > 0) {
      const confidence = Math.max(...directTickers.map((ticker) => ticker.confidence));
      add({
        ...base,
        relation: "direct",
        confidence,
        relevance: round6(confidence * (weight / 100) * importance),
      });
    }

    if (newsTickers.length === 0 || !positionProfile) continue;

    const positionSector = normalizeText(positionProfile.sector);
    const peers = symbolSet(positionProfile.peers);
    const suppliers = symbolSet(positionProfile.suppliers);

    for (const ticker of newsTickers) {
      if (ticker.symbol === symbol) continue;

      const newsProfile = bySymbol.get(ticker.symbol);
      const newsSector = normalizeText(newsProfile?.sector);

      if (positionSector.length > 0 && newsSector === positionSector) {
        add({
          ...base,
          relation: "sector",
          confidence: SECTOR_CONFIDENCE,
          relevance: round6(SECTOR_CONFIDENCE * (weight / 100) * importance),
        });
      }
      if (peers.has(ticker.symbol)) {
        add({
          ...base,
          relation: "competitor",
          confidence: COMPETITOR_CONFIDENCE,
          relevance: round6(COMPETITOR_CONFIDENCE * (weight / 100) * importance),
        });
      }
      if (suppliers.has(ticker.symbol)) {
        add({
          ...base,
          relation: "supplier",
          confidence: SUPPLIER_CONFIDENCE,
          relevance: round6(SUPPLIER_CONFIDENCE * (weight / 100) * importance),
        });
      }
    }
  }

  // Macro: solo depende del título y del perfil de la posición.
  const topics = macroTopicsInTitle(news.title);
  if (topics.length > 0) {
    for (const position of positions) {
      const symbol = normalizeSymbol(position.symbol);
      if (symbol.length === 0) continue;
      const positionProfile = bySymbol.get(symbol);
      if (!positionProfile) continue;
      if (!topics.some((topic) => profileHasMacroFactor(positionProfile, topic))) {
        continue;
      }
      const weight = clampWeight(position.weight);
      add({
        symbol,
        relation: "macro",
        confidence: MACRO_CONFIDENCE,
        exposurePct: weight,
        relevance: round6(MACRO_CONFIDENCE * (weight / 100) * importance),
      });
    }
  }

  return [...candidates.values()]
    .filter((match) => allowed.has(match.relation))
    .filter((match) => match.relevance >= minRelevance)
    .sort(
      (a, b) =>
        b.relevance - a.relevance || (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0),
    );
}

/**
 * Exposición de la cartera a la noticia: suma de los pesos de las posiciones
 * cuyos símbolos aparecen en `news.tickers`. Se calcula sin LLM.
 *
 * Es una cota superior simple (relaciones directas); para el desglose por
 * relación usa `matchNewsToPortfolio().exposurePct`.
 */
export function exposurePct(news: NewsItem, positions: Position[]): number {
  const touched = new Set(
    news.tickers.map((ticker) => normalizeSymbol(ticker.symbol)).filter(Boolean),
  );
  let total = 0;
  for (const position of positions) {
    if (touched.has(normalizeSymbol(position.symbol))) {
      total += clampWeight(position.weight);
    }
  }
  return round6(total);
}
