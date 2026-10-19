/**
 * Estudios estáticos del ranking honesto (F38).
 *
 * Cifras tomadas de los JSON de F10–F14 en `scrapers/data/v2/F38/`.
 * Cada estudio guarda su fecha de corte y su fuente para que el número se
 * pueda auditar; si una cifra no está en el JSON, no se publica.
 *
 * Estos estudios son simulaciones históricas: no son carteras ejecutables ni
 * recomendaciones. Los portafolios vivos se leen de Supabase en /ranking.
 */

import {
  BENCHMARK_LABEL_CL,
  computeExcessPct,
  type RankingSourceInput,
} from "@/lib/ranking";

export interface ResearchResultDetail {
  name: string;
  returnPct: number;
  benchmarkReturnPct?: number;
}

export interface ResearchResult extends RankingSourceInput {
  source: string;
  sourceUrl: string | null;
  /** Cómo se construyó la cifra, en una frase. */
  method: string;
  /** Tamaño de muestra declarado (eventos, menciones, acciones...). */
  sampleSize: number | null;
  sampleUnit: string | null;
  detail?: ResearchResultDetail[];
}

/** Promedio simple de los elogios de Musk a acciones de terceros (F11). */
const MUSK_RETURNS = [-58.35, -69.14, -23.87];
const MUSK_SPY = [114.71, 120.09, 118.21];
const muskAverage = (values: number[]) =>
  Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;

const CORTE_US = "2026-10-16";
const CORTE_AFP = "2026-09-16";

export const RESEARCH_RESULTS: ResearchResult[] = [
  {
    id: "estudio-insiders",
    name: "Compras de insiders (Form 4)",
    kind: "estudio",
    country: "US",
    returnPct: -1.8,
    benchmarkReturnPct: 8.11,
    dataPoints: 270,
    asOf: CORTE_US,
    source: "SEC Form 4 — 270 eventos, 112 excluidos (F10)",
    sourceUrl: "https://www.sec.gov/edgar/search/",
    method:
      "Retorno promedio simple de las compras declaradas por insiders, contra SPY en las mismas fechas. Se excluyen operaciones sin precio o sin ventana suficiente.",
    sampleSize: 270,
    sampleUnit: "eventos",
    note: "88 de 270 eventos le ganaron a SPY en promedio; la mediana fue −5,45%.",
  },
  {
    id: "estudio-musk",
    name: "Elogios de Musk a acciones de terceros",
    kind: "estudio",
    country: "US",
    returnPct: muskAverage(MUSK_RETURNS),
    benchmarkReturnPct: muskAverage(MUSK_SPY),
    dataPoints: 3,
    asOf: CORTE_US,
    source: "Posts públicos de @elonmusk — 3 menciones: Etsy, GameStop y CD Projekt (F11)",
    sourceUrl: "https://x.com/elonmusk",
    method:
      "Promedio simple de los tres elogios a acciones de terceros, contra SPY desde la entrada de cada mención. Tesla queda fuera: Musk es insider.",
    sampleSize: 3,
    sampleUnit: "menciones",
    note: "Los tres casos perdieron; las menciones de Musk sobre sus propias empresas no son señal.",
    detail: [
      { name: "Etsy (26-01-2021)", returnPct: -58.35, benchmarkReturnPct: 114.71 },
      { name: "GameStop (27-01-2021)", returnPct: -69.14, benchmarkReturnPct: 120.09 },
      { name: "CD Projekt (28-01-2021)", returnPct: -23.87, benchmarkReturnPct: 118.21 },
    ],
  },
  {
    id: "estudio-inverse-cramer",
    name: "Inverse Cramer",
    kind: "estudio",
    country: "US",
    returnPct: 0.07,
    benchmarkReturnPct: -0.44,
    dataPoints: 25,
    asOf: CORTE_US,
    source: "CNBC, Lightning Round — 25 señales con días suficientes de 27 (F13)",
    sourceUrl:
      "https://www.cnbc.com/2026/10/15/cramers-lightning-round-buy-reddit.html",
    method:
      "Estrategia inversa: si Cramer dice comprar, se vende; si dice vender, se compra. Promedio simple del retorno de cada señal contra SPY en las mismas fechas.",
    sampleSize: 25,
    sampleUnit: "señales",
    note: "Dos señales de octubre quedaron fuera por no tener días suficientes.",
  },
  {
    id: "estudio-trump-compra",
    name: "Trump compra (desde la publicación)",
    kind: "estudio",
    country: "US",
    returnPct: 2.06,
    benchmarkReturnPct: -1.38,
    dataPoints: 11,
    asOf: CORTE_US,
    source: "OGE Form 278-T — 11 compras (F14)",
    sourceUrl: "https://extapps2.oge.gov/",
    method:
      "Cartera de igual peso con las 11 compras, medida desde la publicación de la declaración (no desde la fecha de la operación), contra SPY en las mismas fechas.",
    sampleSize: 11,
    sampleUnit: "compras",
    note: "Desde la fecha de la operación el resultado fue −0,29% vs SPY −0,45%.",
  },
  {
    id: "estudio-afp-modelo",
    name: "AFP Modelo — cartera de acciones",
    kind: "estudio",
    country: "CL",
    benchmarkLabel: BENCHMARK_LABEL_CL,
    returnPct: 33.79,
    benchmarkReturnPct: 33.09,
    dataPoints: 33,
    asOf: CORTE_AFP,
    source:
      "Superintendencia de Pensiones, cartera al 30-05-2025 (entrada 02-06-2025, salida 16-09-2026) — F12",
    sourceUrl: "https://www.spensiones.cl/apps/carteras/genera_desagregada_xsl.php",
    method:
      "Cartera real publicada, ponderada por los pesos declarados y normalizada a 100, contra ECH convertido a CLP en las mismas fechas. Cobertura de pesos: 100%.",
    sampleSize: 33,
    sampleUnit: "acciones",
    note: "El ECH es un proxy imperfecto del IPSA: sigue el índice MSCI Chile y tiene costo y riesgo de tipo de cambio.",
  },
];

/** Exceso de retorno de un estudio, en pp. */
export function researchExcess(result: ResearchResult): number | null {
  return computeExcessPct(result.returnPct, result.benchmarkReturnPct);
}
