/**
 * impact-feed.ts — feed "Noticias que te tocan" (F72).
 *
 * Función pura, sin red ni Supabase: recibe las noticias normalizadas, las
 * posiciones (peso en % sobre el valor conocido de su moneda), los perfiles de
 * ticker y los límites del plan, y devuelve las noticias que tocan la cartera
 * ordenadas por relevancia.
 *
 * Reglas (docs/mi-portafolio-ia.md §7-§8):
 * - Solo se muestran las noticias publicadas hace más de `delayHours` horas:
 *   Gratis ve el feed con 24 h de retraso; Pro y Elite, al día.
 * - Las relaciones visibles las define el plan (`newsRelationsFor` de
 *   `plans.ts`, vía `matchNewsToPortfolio`).
 * - La exposición es la suma de pesos de las posiciones tocadas, sin LLM.
 * - Ganar relevancia no cambia el orden de publicación: se ordena por
 *   relevancia descendente y, en empate, por fecha descendente.
 */

import {
  matchNewsToPortfolio,
  newsImportance,
  type NewsItem,
  type NewsMatch,
  type NewsRelation,
  type Position,
  type TickerProfile,
} from "@/lib/news-match";

/** Noticia del feed: `NewsItem` + la URL pública de la fuente. */
export interface FeedNews extends NewsItem {
  url: string;
}

/** Fila del feed lista para pintar. Todo serializable (server → client). */
export interface ImpactFeedEntry {
  id: string;
  source: string;
  url: string;
  title: string;
  publishedAt: string;
  /** Importancia del matcher (1 o 1,2 para 8-K relevantes). */
  importance: number;
  /** Coincidencias noticia × cartera, ya ordenadas por relevancia. */
  matches: NewsMatch[];
  /** La coincidencia de mayor relevancia (define el ticker del panel IA). */
  primary: NewsMatch;
  /** Relevancia de la noticia = la de su mejor coincidencia. */
  relevance: number;
  /** % de la cartera tocado (suma de símbolos distintos, tope 100). */
  exposurePct: number;
  /** Relaciones presentes, en orden estable para los chips. */
  relations: NewsRelation[];
}

export interface BuildImpactFeedOptions {
  news: readonly FeedNews[];
  positions: readonly Position[];
  profiles: readonly TickerProfile[];
  plan?: string | null;
  trialEndsAt?: string | null;
  /** Retraso del plan en horas (`newsDelayHours` de `portfolioLimitsFor`). */
  delayHours?: number;
  now?: number;
  minRelevance?: number;
  limit?: number;
  /** Atajo para tests o feeds ya filtrados; reemplaza lo que da el plan. */
  relations?: readonly NewsRelation[];
}

/** Orden estable de las relaciones (chips y desempates). */
export const NEWS_RELATION_ORDER: readonly NewsRelation[] = [
  "direct",
  "sector",
  "competitor",
  "supplier",
  "macro",
];

/** Etiqueta en español de cada relación. */
export const RELATION_LABEL: Record<NewsRelation, string> = {
  direct: "Directo",
  sector: "Sector",
  competitor: "Competidor",
  supplier: "Proveedor",
  macro: "Macro",
};

/** Nombre legible de la fuente (códigos de la migración 051). */
export const SOURCE_LABEL: Record<string, string> = {
  sec_8k: "SEC 8-K",
  cmf_hechos: "CMF · Hechos esenciales",
};

export function sourceLabelFor(source: string | null | undefined): string {
  const value = (source ?? "").trim();
  if (value.length === 0) return "Fuente";
  return SOURCE_LABEL[value] ?? value;
}

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
];

/**
 * Fecha ISO → "20 oct 2026" usando solo la parte de fecha del ISO (UTC), para
 * que el HTML del servidor y el del cliente coincidan sin depender de la zona.
 */
export function formatNewsDate(iso: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec((iso ?? "").trim());
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return "";
  return `${day} ${MONTHS_ES[month - 1]} ${year}`;
}

/** Porcentaje con un decimal y coma: 12.34 → "12,3%". */
export function formatExposure(pct: number | null | undefined): string {
  if (typeof pct !== "number" || !Number.isFinite(pct)) return "—";
  const clamped = Math.min(100, Math.max(0, pct));
  return `${clamped.toFixed(1).replace(".", ",")}%`;
}

/** Momento (ms) desde el cual una noticia ya se puede mostrar. */
export function newsDelayCutoff(now: number, delayHours: number): number {
  const hours =
    typeof delayHours === "number" && Number.isFinite(delayHours) && delayHours > 0
      ? delayHours
      : 0;
  return now - hours * 3_600_000;
}

/** ¿La noticia ya superó el retraso del plan? Fecha inválida → false. */
export function isNewsVisibleAt(
  publishedAt: string,
  delayHours: number,
  now: number,
): boolean {
  const published = Date.parse(publishedAt);
  if (!Number.isFinite(published)) return false;
  return published <= newsDelayCutoff(now, delayHours);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function relationsOf(matches: readonly NewsMatch[]): NewsRelation[] {
  const present = new Set(matches.map((match) => match.relation));
  return NEWS_RELATION_ORDER.filter((relation) => present.has(relation));
}

/**
 * Cruza cada noticia con la cartera y devuelve el feed ordenado.
 *
 * Las noticias sin coincidencias, sin fecha válida o todavía dentro del
 * retraso del plan se descartan.
 */
export function buildImpactFeed(
  options: BuildImpactFeedOptions,
): ImpactFeedEntry[] {
  const now =
    typeof options.now === "number" && Number.isFinite(options.now)
      ? options.now
      : Date.now();
  const delayHours = options.delayHours ?? 0;
  const limit =
    typeof options.limit === "number" && Number.isFinite(options.limit)
      ? Math.max(0, Math.floor(options.limit))
      : 40;

  const entries: ImpactFeedEntry[] = [];

  for (const news of options.news) {
    if (!isNewsVisibleAt(news.publishedAt, delayHours, now)) continue;

    const matches = matchNewsToPortfolio(
      news,
      [...options.positions],
      [...options.profiles],
      {
        plan: options.plan,
        trialEndsAt: options.trialEndsAt,
        now,
        minRelevance: options.minRelevance,
        relations: options.relations,
      },
    );
    if (matches.length === 0) continue;

    // Suma de pesos por símbolo distinto: el matcher ya devuelve uno por
    // símbolo, pero se deduplica por si el llamador pasa duplicados.
    const seen = new Set<string>();
    let exposed = 0;
    for (const match of matches) {
      if (seen.has(match.symbol)) continue;
      seen.add(match.symbol);
      exposed += match.exposurePct;
    }

    entries.push({
      id: news.id,
      source: news.source,
      url: news.url,
      title: news.title,
      publishedAt: news.publishedAt,
      importance: newsImportance(news),
      matches,
      primary: matches[0],
      relevance: matches[0].relevance,
      exposurePct: round1(Math.min(100, Math.max(0, exposed))),
      relations: relationsOf(matches),
    });
  }

  entries.sort(
    (a, b) =>
      b.relevance - a.relevance ||
      Date.parse(b.publishedAt) - Date.parse(a.publishedAt) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

  return limit > 0 ? entries.slice(0, limit) : entries;
}
