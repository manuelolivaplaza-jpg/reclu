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
 * `topByReturnDiverse`, `pickDefaultRankingsPeriod`, `topByFollowers`,
 * `filterPremium` y `formatReturnPct` son funciones puras y están cubiertas
 * en `tests/portfolio-rankings.test.ts` y `tests/d67-rankings-diverse.test.ts`.
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

/**
 * D7: tope del primer pase de "Mejor rendimiento". Con 1 por categoria se
 * garantiza la mezcla real (13F, ETF, corredoras, AFP/declaraciones,
 * tematicas/Trump dice) antes de relajar a `MAX_PER_CATEGORY` y, si aun
 * faltan filas, al pase sin tope de categoria. La familia nunca se relaja.
 */
export const MAX_PER_CATEGORY_STRICT = 1;

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

/**
 * D7: período con el que abre la sección. Manu eligió `1A`: es el horizonte
 * que se puede leer como "rendimiento real" sin caer en el ruido de 1S/1M.
 */
export const DEFAULT_RANKINGS_PERIOD: RankingPeriodId = "1A";

/** D7: etiqueta legible de cada período (para el ganador y los rótulos). */
export const RANKING_PERIOD_LONG_LABELS: Readonly<Record<RankingPeriodId, string>> = {
  "1S": "1 semana",
  "1M": "1 mes",
  "3M": "3 meses",
  "6M": "6 meses",
  "1A": "1 año",
  "2A": "2 años",
};

/** D7: etiqueta larga de un período; si la clave es desconocida, la devuelve tal cual. */
export function periodLongLabel(id: string): string {
  return RANKING_PERIOD_LONG_LABELS[id as RankingPeriodId] ?? id;
}

/**
 * D7: orden de preferencia del período inicial. Primero `1A`; si el ranking
 * no lo cubre, el más largo disponible del selector (`2A` → `6M` → `3M` →
 * `1M` → `1S`) y, al final, las claves que usan otras vistas del producto
 * (`MAX`, `YTD`) para no inventar un período que no exista.
 */
const RANKINGS_PERIOD_PREFERENCE: readonly string[] = [
  DEFAULT_RANKINGS_PERIOD,
  "2A",
  "MAX",
  "YTD",
  "6M",
  "3M",
  "1M",
  "1S",
  "1D",
  "1W",
];

/**
 * D7: período inicial a partir de las claves realmente disponibles.
 *
 * Devuelve la clave original (no la normalizada) para que sirva de índice en
 * `best`/`winnerByPeriod`, o `null` si no hay ninguna conocida: nunca se
 * inventa un período sin datos. Pura.
 */
export function pickDefaultRankingsPeriod(availableKeys: readonly string[]): string | null {
  const original = new Map<string, string>();
  for (const key of availableKeys ?? []) {
    const normalized = String(key ?? "").trim().toUpperCase();
    if (!normalized || original.has(normalized)) continue;
    original.set(normalized, key);
  }
  for (const candidate of RANKINGS_PERIOD_PREFERENCE) {
    const hit = original.get(candidate);
    if (hit !== undefined) return hit;
  }
  return null;
}

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
 * Un pase de selección: recorre la lista ya ordenada por retorno y agrega
 * filas mientras la familia y la categoría no superen sus topes. `seed` son
 * las filas elegidas en un pase anterior: sus conteos se arrastran para que
 * relajar la categoría no vuelva a llenar el top con la misma familia.
 */
function fillRankingPass(
  ordered: RankingEntry[],
  seed: RankingEntry[],
  size: number,
  famLimit: number,
  catLimit: number,
): RankingEntry[] {
  const out = [...seed];
  const families = new Map<string, number>();
  const categories = new Map<string, number>();
  const seen = new Set<string>();
  const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);

  for (const entry of out) {
    bump(families, familyOf(entry));
    bump(categories, entry.category ?? "");
    seen.add(entry.slug);
  }

  for (const entry of ordered) {
    if (out.length >= size) break;
    if (seen.has(entry.slug)) continue;
    const family = familyOf(entry);
    const category = entry.category ?? "";
    if ((families.get(family) ?? 0) >= famLimit) continue;
    if ((categories.get(category) ?? 0) >= catLimit) continue;
    out.push(entry);
    seen.add(entry.slug);
    bump(families, family);
    bump(categories, category);
  }

  return out;
}

/**
 * D67/D7: top N por retorno con diversidad real de categorías.
 *
 * Tres pases sobre la lista ordenada por retorno descendente (el #1 absoluto
 * siempre entra primero, así que queda en la posición 0):
 *  1. estricto: máx. `MAX_PER_CATEGORY_STRICT` (1) por categoría y
 *     `perFamily` (1) por familia => hasta 5 filas de 5 categorías
 *     distintas cuando el catálogo las tiene con retorno real finito;
 *  2. si faltan filas, la categoría se relaja a `perCategory` (2);
 *  3. si aún faltan, la categoría deja de limitar. La familia NUNCA se
 *     relaja: el top no se llena con cinco ETFs de la misma gestora.
 *
 * Pura. `perFamily`/`perCategory` siguen como overrides compatibles.
 */
export function topByReturnDiverse(
  entries: RankingEntry[],
  limit = 5,
  perFamily = MAX_PER_FAMILY,
  perCategory = MAX_PER_CATEGORY,
): RankingEntry[] {
  const size = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 5;
  if (size === 0) return [];

  const famLimit =
    Number.isFinite(perFamily) && perFamily >= 1 ? Math.floor(perFamily) : MAX_PER_FAMILY;
  const relaxedCatLimit =
    Number.isFinite(perCategory) && perCategory >= 1 ? Math.floor(perCategory) : MAX_PER_CATEGORY;

  // Pases de categoría, sin repetir topes: estricto -> relajado -> sin tope.
  const catLimits: number[] = [];
  for (const value of [
    MAX_PER_CATEGORY_STRICT,
    Math.max(MAX_PER_CATEGORY_STRICT, relaxedCatLimit),
    Number.MAX_SAFE_INTEGER,
  ]) {
    if (!catLimits.includes(value)) catLimits.push(value);
  }

  const ordered = topByReturn(entries, Number.MAX_SAFE_INTEGER);
  let picked: RankingEntry[] = [];
  for (const catLimit of catLimits) {
    picked = fillRankingPass(ordered, picked, size, famLimit, catLimit);
    if (picked.length >= size) break;
  }

  return picked.sort((a, b) => (b.returnPct as number) - (a.returnPct as number));
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
  /**
   * D7: ganador real de cada período — el portafolio con mayor retorno
   * finito y sin tramos estimados — junto con la etiqueta legible del
   * período (`"1 año"`, `"6 meses"`). `null` cuando ese período no tiene
   * filas válidas. Aditivo: una UI que lo ignore sigue funcionando igual.
   */
  winnerByPeriod?: Record<string, (RankingsBestRow & { periodLabel: string }) | null>;
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
  const winnerByPeriod: NonNullable<RankingsPayload["winnerByPeriod"]> = {};
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
    // D7: el #1 del período es el ganador real — `topByReturnDiverse` ordena
    // por retorno descendente y ya dejó fuera los tramos estimados. Se
    // publica con su período escrito ("1 año"); sin filas válidas, null.
    const champion = top[0];
    winnerByPeriod[period.id] = champion
      ? {
          ...toRow(champion),
          returnPct: champion.returnPct,
          returnLabel: formatReturnPct(champion.returnPct),
          estimated: false,
          periodLabel: periodLongLabel(period.id),
        }
      : null;
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
  return { periods, best, popular, winnerByPeriod, updatedAt, demo: !live };
}
