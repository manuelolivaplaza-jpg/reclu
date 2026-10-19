/**
 * Ranking honesto (F38) — lógica pura, sin acceso a datos.
 *
 * Cada fuente o portafolio se mide contra el benchmark de su país:
 *  - EE.UU.: S&P 500, replicable con SPY.
 *  - Chile: IPSA, con ECH en CLP como proxy (rotulado como tal).
 *
 * Reglas:
 *  - Se ordena por exceso de retorno (fuente − benchmark), de mayor a menor.
 *  - Las fuentes que pierden NO se esconden: quedan en la lista con su
 *    exceso negativo.
 *  - Sin retorno o sin benchmark no se inventa un número: exceso null y
 *    rank null.
 *  - Menos de 30 puntos de datos => etiqueta "muestra chica". El número se
 *    sigue mostrando, pero con la advertencia visible.
 */

import { ECH_PROXY_LABEL } from "@/lib/afp-fuente";

export const SMALL_SAMPLE_MIN_POINTS = 30;
export const SMALL_SAMPLE_LABEL = "muestra chica";

/** Etiquetas públicas de los benchmarks por país. */
export const BENCHMARK_LABEL_US = "S&P 500 (SPY)";
export const BENCHMARK_LABEL_CL = ECH_PROXY_LABEL;

export type RankingCountry = "US" | "CL";
export type RankingKind = "portfolio" | "estudio";

export interface RankingSourceInput {
  id: string;
  name: string;
  kind: RankingKind;
  country: RankingCountry;
  /** Retorno acumulado de la fuente (%). */
  returnPct: number | null;
  /** Retorno acumulado del benchmark en las mismas fechas (%). */
  benchmarkReturnPct: number | null;
  /** Etiqueta explícita; si falta se deduce del país. */
  benchmarkLabel?: string;
  /** Puntos de la serie (días de bolsa) o eventos del estudio. */
  dataPoints?: number | null;
  /** Fecha de corte (YYYY-MM-DD). */
  asOf: string;
  /** Enlace interno al portafolio, si aplica. */
  href?: string;
  /** Fuente pública del dato. */
  source?: string;
  /** Nota corta y verificable (nº de eventos, exclusiones, método). */
  note?: string;
}

export interface RankedSource extends RankingSourceInput {
  benchmarkLabel: string;
  /** Exceso de retorno en puntos porcentuales; null si falta un dato. */
  excessReturnPct: number | null;
  /** Posición 1..n entre las fuentes con datos; null si no hay exceso. */
  rank: number | null;
  smallSample: boolean;
  /** Texto visible ("muestra chica") o null si la muestra alcanza. */
  smallSampleLabel: string | null;
}

/** Exceso de retorno en pp, redondeado a 2 decimales. */
export function computeExcessPct(
  returnPct: number | null | undefined,
  benchmarkReturnPct: number | null | undefined,
): number | null {
  if (
    typeof returnPct !== "number" ||
    typeof benchmarkReturnPct !== "number" ||
    !Number.isFinite(returnPct) ||
    !Number.isFinite(benchmarkReturnPct)
  ) {
    return null;
  }
  return Math.round((returnPct - benchmarkReturnPct) * 100) / 100;
}

/** Etiqueta del benchmark según país. Chile siempre rotula el proxy ECH. */
export function benchmarkLabelForCountry(country: string | null | undefined): string {
  return country === "CL" ? BENCHMARK_LABEL_CL : BENCHMARK_LABEL_US;
}

/** Etiqueta a partir del símbolo guardado en portfolio_metrics. */
export function benchmarkLabelForSymbol(symbol: string | null | undefined): string {
  const normalized = (symbol ?? "").trim().toUpperCase();
  if (normalized === "^IPSA" || normalized === "IPSA" || normalized === "ECH") {
    return BENCHMARK_LABEL_CL;
  }
  if (
    normalized === "^GSPC" ||
    normalized === "GSPC" ||
    normalized === "SPY" ||
    normalized === "S&P 500"
  ) {
    return BENCHMARK_LABEL_US;
  }
  return normalized.length > 0 ? symbol!.trim() : BENCHMARK_LABEL_US;
}

/**
 * Ordena las fuentes por exceso de retorno. Incluye perdedores y empates.
 * Las filas sin datos quedan al final, sin número de ranking.
 */
export function rankSources(sources: RankingSourceInput[]): RankedSource[] {
  const rows: RankedSource[] = sources.map((source) => {
    const excessReturnPct = computeExcessPct(source.returnPct, source.benchmarkReturnPct);
    const hasPoints = typeof source.dataPoints === "number" && Number.isFinite(source.dataPoints);
    const smallSample = hasPoints && source.dataPoints! < SMALL_SAMPLE_MIN_POINTS;
    return {
      ...source,
      benchmarkLabel: source.benchmarkLabel ?? benchmarkLabelForCountry(source.country),
      excessReturnPct,
      rank: null,
      smallSample,
      smallSampleLabel: smallSample ? SMALL_SAMPLE_LABEL : null,
    };
  });

  rows.sort((a, b) => {
    if (a.excessReturnPct === null && b.excessReturnPct === null) {
      return a.name.localeCompare(b.name, "es");
    }
    if (a.excessReturnPct === null) return 1;
    if (b.excessReturnPct === null) return -1;
    if (b.excessReturnPct !== a.excessReturnPct) {
      return b.excessReturnPct - a.excessReturnPct;
    }
    return a.name.localeCompare(b.name, "es");
  });

  let rank = 0;
  for (const row of rows) {
    if (row.excessReturnPct === null) continue;
    rank += 1;
    row.rank = rank;
  }
  return rows;
}

export type ExcessOutcome = "gana" | "pierde" | "empata" | "sin-datos";

export function excessOutcome(row: Pick<RankedSource, "excessReturnPct">): ExcessOutcome {
  if (row.excessReturnPct === null) return "sin-datos";
  if (row.excessReturnPct > 0) return "gana";
  if (row.excessReturnPct < 0) return "pierde";
  return "empata";
}

/** Separa el ranking en ganadores, perdedores, empates y sin datos. */
export function splitByOutcome(rows: RankedSource[]): {
  winners: RankedSource[];
  losers: RankedSource[];
  ties: RankedSource[];
  noData: RankedSource[];
} {
  return {
    winners: rows.filter((row) => excessOutcome(row) === "gana"),
    losers: rows.filter((row) => excessOutcome(row) === "pierde"),
    ties: rows.filter((row) => excessOutcome(row) === "empata"),
    noData: rows.filter((row) => excessOutcome(row) === "sin-datos"),
  };
}
