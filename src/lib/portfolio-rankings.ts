/**
 * Rankings de portafolios para la home (D2) — lógica pura + loader de servidor.
 *
 * Dos columnas en el inicio:
 *  - "Mejor rendimiento": top 5 por período (1S 1M 3M 6M 1A 2A).
 *  - "Populares": top 5 por número de seguidores.
 *
 * Reglas duras (no negociables):
 *  - Muro de pago: los portafolios premium solo serankean para quien paga.
 *    Para el resto quedan fuera de la lista (ni nombre, ni cifras).
 *  - Las series vienen SIEMPRE por `getPerformance()` (RPC con recorte por
 *    plan). Nunca se leen tablas directo.
 *  - Sin datos no se inventa nada: un período sin cobertura queda sin
 *   Return y su píldora se deshabilita en la UI.
 *
 * La lógica pura de este archivo no toca red: `periodReturn`, `topByReturn`,
 * `topByFollowers`, `filterPremium` y `formatReturnPct` son funciones puras
 * y están cubiertas en `tests/portfolio-rankings.test.ts`.
 */

import { getPerformanceSeriesAdmin, getPortfolios, getProfile } from "@/lib/queries";
import { cacheLife, cacheTag } from "next/cache";
import { PERFORMANCE_TAG, PORTFOLIOS_TAG, PUBLIC_DATA_TAG } from "@/lib/cache-tags";
import { clipSeriesForSlug } from "@/lib/card-series";
import { demoPerformance } from "@/lib/demo-data";
import { fromPctToLevel, parseDate } from "@/lib/performance";
import { isPaidPlan } from "@/lib/types";
import { formatSignedPct } from "@/lib/utils";

const DAY_MS = 86_400_000;

/**
 * D67: el ranking de rendimiento compite con TODOS los portafolios activos
 * visibles (antes solo los 30 con mas seguidores: Trump dice, con 0
 * seguidores, quedaba fuera). Se mantiene como limite de seguridad.
 */
export const RANKING_CANDIDATES = 500;

/** D67: maximo por familia/gestora y por categoria en "Mejor rendimiento". */
export const MAX_PER_FAMILY = 1;
export const MAX_PER_CATEGORY = 2;

/** Puntos de serie pedidos por portafolio (cubre 2 años calendario). */
const MAX_SERIES_POINTS = 800;

/** Puntos de la serie ilustrativa de demo (2 años). */
const DEMO_SERIES_POINTS = 760;

// ---- Períodos ----

export type RankingPeriodId = "1S" | "1M" | "3M" | "6M" | "1A" | "2A";

export interface RankingPeriod {
  id: RankingPeriodId;
  /** Etiqueta visible de la píldora. */
  label: string;
  /** Días de historia que exige el período. */
  days: number;
}

/** Períodos del selector, en orden. */
export const RANKING_PERIODS: readonly RankingPeriod[] = [
  { id: "1S", label: "1S", days: 7 },
  { id: "1M", label: "1M", days: 30 },
  { id: "3M", label: "3M", days: 91 },
  { id: "6M", label: "6M", days: 182 },
  { id: "1A", label: "1A", days: 365 },
  { id: "2A", label: "2A", days: 730 },
] as const;

// ---- Tipos puros ----

/** Punto de serie: fecha ISO y nivel (índice base 100). */
export interface RankingPoint {
  date: string;
  value: number;
}

/** Candidato al ranking: identidad + métrica del período. */
export interface RankingEntry {
  slug: string;
  name: string;
  manager: string | null;
  coverImage: string | null;
  category?: import("@/lib/types").PortfolioCategory;
  portraitImage?: string | null;
  followers: number;
  /** Retorno del período en %, o null si la serie no lo cubre. */
  returnPct: number | null;
}

// ---- Funciones puras ----

/**
 * Retorno acumulado (%) de los últimos `days` días de una serie de niveles.
 *
 * La serie se espera en niveles (índice base 100, siempre > 0). El corte es
 * el último punto con fecha <= último punto − `days` días. Si no existe
 * ese punto, la serie NO cubre el período y se devuelve null: no se estima
 * ni se completa con datos inventados.
 */
export function periodReturn(series: RankingPoint[], days: number): number | null {
  if (!Number.isFinite(days) || days <= 0) return null;

  const points = (series ?? [])
    .filter(
      (point) =>
        point &&
        typeof point.date === "string" &&
        Number.isFinite(point.value),
    )
    .map((point) => ({ time: parseDate(point.date), value: point.value }))
    .filter((point) => Number.isFinite(point.time))
    .sort((a, b) => a.time - b.time);

  if (points.length < 2) return null;

  const last = points[points.length - 1];
  if (last.value <= 0) return null;
  const cutoff = last.time - days * DAY_MS;

  let base: { time: number; value: number } | null = null;
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].time <= cutoff) {
      base = points[i];
      break;
    }
  }
  if (!base || base.value <= 0) return null;

  const value = (last.value / base.value - 1) * 100;
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

/**
 * Formato de porcentaje en formato chileno: `+12,3%` / `-4,5%` / `0,0%`.
 * `null` (sin datos) se muestra como `—`.
 */
export function formatReturnPct(value: number | null | undefined): string {
  return formatSignedPct(value, 1);
}

/**
 * Ordena por retorno descendente y corta el top N.
 * Los que no tienen dato (null) quedan fuera: no se inventan posiciones.
 */
export function topByReturn(entries: RankingEntry[], limit = 5): RankingEntry[] {
  return entries
    .filter((entry) => entry.returnPct !== null && Number.isFinite(entry.returnPct))
    .sort((a, b) => {
      const diff = (b.returnPct as number) - (a.returnPct as number);
      if (diff !== 0) return diff;
      if (b.followers !== a.followers) return b.followers - a.followers;
      return a.name.localeCompare(b.name, "es");
    })
    .slice(0, limit);
}

/** Ordena por seguidores descendente y corta el top N. */
export function topByFollowers(entries: RankingEntry[], limit = 5): RankingEntry[] {
  return [...entries]
    .sort((a, b) => {
      if (b.followers !== a.followers) return b.followers - a.followers;
      return a.name.localeCompare(b.name, "es");
    })
    .slice(0, limit);
}

/**
 * D67: familia/gestora de un portafolio, para no llenar el top con la misma
 * casa (p. ej. varios ETFs de ARK). Pura.
 */
export function familyOf(entry: { slug: string; name: string; manager: string | null }): string {
  const name = entry.name.trim().toLowerCase();
  const manager = (entry.manager ?? "").trim().toLowerCase();
  if (/^ark\b/.test(name) || /^ark\b/.test(manager) || manager.includes("cathie wood")) return "ark";
  if (/^afp\b/.test(name) || manager.startsWith("afp")) return "afp";
  if (name.startsWith("renta 4") || manager.startsWith("renta 4")) return "renta4";
  if (name.startsWith("consenso")) return "consenso";
  if (name.startsWith("trump") || manager.includes("trump")) return "trump";
  return manager || entry.slug;
}

/**
 * D67: top N por retorno con diversidad: max. `perFamily` por familia y
 * `perCategory` por categoria. Si no alcanza, se relaja solo la categoria
 * (la familia nunca supera su limite). El #1 siempre es el mejor real.
 */
export function topByReturnDiverse(
  entries: RankingEntry[],
  limit = 5,
  perFamily = MAX_PER_FAMILY,
  perCategory = MAX_PER_CATEGORY,
): RankingEntry[] {
  const ordered = topByReturn(entries, Number.MAX_SAFE_INTEGER);
  const pick = (catLimit: number, seed: RankingEntry[]): RankingEntry[] => {
    const out = [...seed];
    const fam = new Map<string, number>();
    const cat = new Map<string, number>();
    const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
    for (const e of out) {
      bump(fam, familyOf(e));
      bump(cat, e.category ?? "");
    }
    for (const e of ordered) {
      if (out.length >= limit) break;
      if (out.includes(e)) continue;
      const f = familyOf(e);
      const c = e.category ?? "";
      if ((fam.get(f) ?? 0) >= perFamily) continue;
      if ((cat.get(c) ?? 0) >= catLimit) continue;
      out.push(e);
      bump(fam, f);
      bump(cat, c);
    }
    return out;
  };
  const strict = pick(perCategory, []);
  const filled = strict.length < limit ? pick(Number.MAX_SAFE_INTEGER, strict) : strict;
  return filled.sort((a, b) => (b.returnPct as number) - (a.returnPct as number));
}

/**
 * Filtro premium: los portafolios premium solo se.rankean para quien tiene
 * plan de pago. Para el resto quedan fuera por completo (muro de pago 048).
 */
export function filterPremium<T extends { premium: boolean }>(
  list: T[],
  paid: boolean,
): T[] {
  return paid ? list : list.filter((item) => !item.premium);
}

/** Iniciales de un nombre (portafolio o gestor) para el avatar. */
export function initialsOf(name: string | null | undefined): string {
  if (!name) return "";
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "";
  const first = words[0].charAt(0);
  const second = words.length > 1 ? words[1].charAt(0) : "";
  return `${first}${second}`.toUpperCase();
}

// ---- Payload para el componente de cliente ----

export interface RankingsRow {
  slug: string;
  name: string;
  /** Iniciales para el avatar de portada. */
  initials: string;
  manager: string | null;
  managerInitials: string | null;
  coverImage: string | null;
  category?: import("@/lib/types").PortfolioCategory;
  portraitImage?: string | null;
  followers: number;
}

export interface RankingsBestRow extends RankingsRow {
  returnPct: number | null;
  /** Retorno ya formateado en estilo chileno (`+12,3%`). */
  returnLabel: string;
  /** true => el período usa puntos estimados (posiciones actuales). */
  estimated: boolean;
}

export interface RankingsPopularRow extends RankingsRow {
  /** D29: si el período elegido no tiene datos, el más largo disponible. */
  longest?: { periodLabel: string; pct: number; label: string; estimated: boolean } | null;
  /** Retorno por período, ya formateado. */
  returns: Record<string, { pct: number | null; label: string; estimated: boolean }>;
}

export interface RankingsPeriodOption {
  id: RankingPeriodId;
  label: string;
  days: number;
  /** false => no hay datos para el período; la píldora se deshabilita. */
  hasData: boolean;
}

export interface RankingsPayload {
  periods: RankingsPeriodOption[];
  /** Top 5 por período, indexado por id de período. */
  best: Record<string, RankingsBestRow[]>;
  popular: RankingsPopularRow[];
  /** D29: fecha (ISO) del último dato de rendimiento entre los portafolios rankeados. */
  updatedAt?: string | null;
  /** true => los datos vienen del catálogo de ejemplo (sin Supabase). */
  demo: boolean;
}

// ---- Loader de servidor ----

/** Misma regla que queries.ts: sin URL real, el sitio está en modo demo. */
function isSupabaseLive(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return url.startsWith("https://") && !url.includes("placeholder");
}

function toRow(entry: {
  slug: string;
  name: string;
  manager: string | null;
  coverImage: string | null;
  category?: import("@/lib/types").PortfolioCategory;
  portraitImage?: string | null;
  followers: number;
}): RankingsRow {
  return {
    slug: entry.slug,
    name: entry.name,
    initials: initialsOf(entry.name),
    manager: entry.manager,
    managerInitials: entry.manager ? initialsOf(entry.manager) : null,
    coverImage: entry.coverImage,
    category: entry.category,
    portraitImage: entry.portraitImage ?? null,
    followers: entry.followers,
  };
}

/**
 * Carga los datos del ranking para la home.
 *
 * - El perfil define el plan (muro): los premium solo se rankean si paga.
 * - Se piden series solo de los primeros `RANKING_CANDIDATES` por seguidores.
 * - `getPerformance()` aplica el recorte por plan (90 días para anon/free,
 *   serie completa para pro/elite y para declaraciones públicas).
 */
export async function getPortfolioRankings(): Promise<RankingsPayload> {
  const profile = await getProfile();
  return getPortfolioRankingsCached(isPaidPlan(profile?.plan));
}

/**
 * D67: el calculo se cachea (1 h, tags publicos) por plan pagado/no pagado.
 * Solo usa lecturas cache-safe (catalogo publico + serie admin agregada).
 */
async function getPortfolioRankingsCached(paid: boolean): Promise<RankingsPayload> {
  "use cache";
  cacheLife("hours");
  cacheTag(PUBLIC_DATA_TAG, PORTFOLIOS_TAG, PERFORMANCE_TAG);
  const live = isSupabaseLive();

  const portfolios = await getPortfolios();
  const visible = filterPremium(portfolios, paid);
  const byFollowers = [...visible].sort((a, b) => b.followers - a.followers);
  const candidates = byFollowers.slice(0, RANKING_CANDIDATES);

  // Ranking: el % por período se calcula en el servidor con la serie completa
  // (cliente admin). Al cliente solo llega el % agregado, nunca la serie, así
  // que el muro de 90 días de los gráficos no se rompe.
  const adminSeries = live
    ? await getPerformanceSeriesAdmin(candidates.map((p) => p.id))
    : new Map<string, { date: string; value: number; estimated: boolean }[]>();

  // Última fecha estimada por slug: un período es "estimado" si su ventana la toca.
  const estimatedUntil = new Map<string, string>();
  const lastDate = new Map<string, string>();
  for (const portfolio of candidates) {
    const pts = clipSeriesForSlug(portfolio.slug, adminSeries.get(portfolio.id) ?? []);
    const est = pts.filter((p) => p.estimated);
    if (est.length) estimatedUntil.set(portfolio.slug, est[est.length - 1].date);
    if (pts.length) lastDate.set(portfolio.slug, pts[pts.length - 1].date);
  }
  const isEstimated = (slug: string, days: number): boolean => {
    const until = estimatedUntil.get(slug);
    const last = lastDate.get(slug);
    if (!until || !last) return false;
    const cutoff = new Date(Date.parse(last) - days * DAY_MS).toISOString().slice(0, 10);
    return until >= cutoff;
  };

  // D67: serie recortada al inicio oficial (Trump dice desde su 1a mencion),
  // igual que el detalle y las tarjetas.
  const seriesList = candidates.map((portfolio) => {
    const full = clipSeriesForSlug(portfolio.slug, adminSeries.get(portfolio.id) ?? []);
    if (full.length > 0) return fromPctToLevel(full.map(({ date, value }) => ({ date, value })));
    // Modo demo: serie ilustrativa determinista (el sitio lo rotula).
    if (!live && portfolio.return_ytd !== null) {
      return fromPctToLevel(demoPerformance(portfolio.slug, portfolio.return_ytd, DEMO_SERIES_POINTS));
    }
    return [];
  });

  const entries: RankingEntry[] = candidates.map((portfolio) => ({
    slug: portfolio.slug,
    name: portfolio.name,
    manager: portfolio.manager,
    coverImage: portfolio.cover_image,
    category: portfolio.category,
    portraitImage: portfolio.portrait_image ?? null,
    followers: portfolio.followers,
    returnPct: null,
  }));

  const returnsByPeriod = new Map<string, Map<string, number | null>>();
  for (const period of RANKING_PERIODS) {
    const map = new Map<string, number | null>();
    candidates.forEach((portfolio, index) => {
      map.set(portfolio.slug, periodReturn(seriesList[index], period.days));
    });
    returnsByPeriod.set(period.id, map);
  }

  const best: Record<string, RankingsBestRow[]> = {};
  const periods: RankingsPeriodOption[] = [];

  for (const period of RANKING_PERIODS) {
    const map = returnsByPeriod.get(period.id) as Map<string, number | null>;
    const withReturn: RankingEntry[] = entries.map((entry) => ({
      ...entry,
      returnPct: map.get(entry.slug) ?? null,
    }));
    // D40: "Mejor rendimiento" solo compite con series reales; un período que
    // toca puntos estimados no entra al ranking (sigue visible en Populares).
    const top = topByReturnDiverse(withReturn.filter((entry) => !isEstimated(entry.slug, period.days)), 5);
    best[period.id] = top.map((entry) => ({
      ...toRow(entry),
      returnPct: entry.returnPct,
      returnLabel: formatReturnPct(entry.returnPct),
      estimated: isEstimated(entry.slug, period.days),
    }));
    periods.push({
      id: period.id,
      label: period.label,
      days: period.days,
      hasData: top.length > 0,
    });
  }

  const popular = topByFollowers(entries, 5).map((entry) => {
    const returns: RankingsPopularRow["returns"] = {};
    for (const period of RANKING_PERIODS) {
      const map = returnsByPeriod.get(period.id) as Map<string, number | null>;
      const pct = map.get(entry.slug) ?? null;
      returns[period.id] = {
        pct,
        label: formatReturnPct(pct),
        estimated: pct !== null && isEstimated(entry.slug, period.days),
      };
    }
    let longest: RankingsPopularRow["longest"] = null;
    for (const period of [...RANKING_PERIODS].reverse()) {
      const r = returns[period.id];
      if (r && r.pct !== null) {
        longest = { periodLabel: period.label, pct: r.pct, label: r.label, estimated: r.estimated };
        break;
      }
    }
    return { ...toRow(entry), returns, longest };
  });

  const updatedAt = [...lastDate.values()].sort().at(-1) ?? null;
  return { periods, best, popular, updatedAt, demo: !live };
}
