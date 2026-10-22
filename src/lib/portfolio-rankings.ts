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

import { getPerformance, getPortfolios, getProfile } from "@/lib/queries";
import { demoPerformance } from "@/lib/demo-data";
import { roleFor } from "@/lib/access";
import { fromPctToLevel, parseDate } from "@/lib/performance";
import { isPaidPlan } from "@/lib/types";

const DAY_MS = 86_400_000;

/** Cuántos portafolios se cargan series para armar el ranking de rendimiento. */
export const RANKING_CANDIDATES = 30;

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
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  const text = Math.abs(rounded).toLocaleString("es-CL", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${rounded > 0 ? "+" : rounded < 0 ? "-" : ""}${text}%`;
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
}

export interface RankingsPopularRow extends RankingsRow {
  /** Retorno por período, ya formateado. */
  returns: Record<string, { pct: number | null; label: string }>;
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
  const paid = isPaidPlan(profile?.plan);
  const role = roleFor(profile);
  const live = isSupabaseLive();

  const portfolios = await getPortfolios();
  const visible = filterPremium(portfolios, paid);
  const byFollowers = [...visible].sort((a, b) => b.followers - a.followers);
  const candidates = byFollowers.slice(0, RANKING_CANDIDATES);

  const seriesList = await Promise.all(
    candidates.map(async (portfolio) => {
      const real = live
        ? await getPerformance(portfolio.id, MAX_SERIES_POINTS, {
            role,
            source: portfolio.source,
          })
        : [];
      if (real.length > 0) return fromPctToLevel(real);
      // Modo demo: serie ilustrativa determinista (el sitio lo rotula).
      if (!live && portfolio.return_ytd !== null) {
        return fromPctToLevel(
          demoPerformance(portfolio.slug, portfolio.return_ytd, DEMO_SERIES_POINTS),
        );
      }
      return [];
    }),
  );

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
    const top = topByReturn(withReturn, 5);
    best[period.id] = top.map((entry) => ({
      ...toRow(entry),
      returnPct: entry.returnPct,
      returnLabel: formatReturnPct(entry.returnPct),
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
      returns[period.id] = { pct, label: formatReturnPct(pct) };
    }
    return { ...toRow(entry), returns };
  });

  return { periods, best, popular, demo: !live };
}
