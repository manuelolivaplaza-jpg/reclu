/**
 * impact-client.ts — llamada del panel "Pregunta a la IA" (F72).
 *
 * Aísla el `POST /api/impact` (F71) del componente para que el feed funcione
 * aunque el endpoint todavía no exista: si la ruta responde 404, 405 o 501 el
 * panel muestra un aviso neutro y deja la noticia con su fuente. Los tests
 * mockean este módulo, así que nunca se toca la red ni el LLM.
 *
 * Solo se envía `news_id`, `symbol` y la pregunta libre opcional. Nunca
 * tenencias, montos, nombre ni correo (minimización de datos).
 */

import { AI_DISCLAIMER } from "@/lib/ai-disclaimer";
import type { ImpactAnalysis } from "@/lib/impact-prompt";

export interface ImpactRequestInput {
  newsId: string;
  symbol: string;
  /** Pregunta libre opcional del usuario. Se recorta antes de enviarse. */
  question?: string;
}

export type ImpactClientResult =
  | {
      status: "ok";
      /** Análisis genérico precalculado (F70) para el ticker, si existe. */
      analysis: ImpactAnalysis | null;
      /** Respuesta libre de la IA a la pregunta (F71), ya filtrada. */
      answer: string | null;
      cached: boolean;
      /** Descargo fijo §2.2 del informe legal. */
      disclaimer: string;
    }
  | {
      /** La ruta aún no está desplegada (F71 pendiente) o está apagada. */
      status: "unavailable";
      message: string;
    }
  | {
      /** Error real: sesión, cupo, red o formato inesperado. */
      status: "error";
      message: string;
    };

export const IMPACT_UNAVAILABLE_MESSAGE =
  "El análisis con IA todavía no está disponible para esta noticia. Puedes leerla en su fuente original.";

export const IMPACT_EMPTY_ANALYSIS_MESSAGE =
  "La respuesta de la IA no tiene el formato esperado. Revisa la fuente original.";

export const IMPACT_QUOTA_MESSAGE =
  "Alcanzaste tu cupo de consultas de IA de este período. Vuelve más tarde o revisa tu plan.";

const DIRECTIONS = new Set(["positiva", "negativa", "mixta", "incierta"]);
const HORIZONS = new Set(["corto", "medio", "largo", "incierto"]);
const UNCERTAINTIES = new Set(["baja", "media", "alta"]);

/** True si el JSON tiene exactamente los campos del esquema de F70. */
export function isImpactAnalysis(value: unknown): value is ImpactAnalysis {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.resumen === "string" &&
    record.resumen.trim().length > 0 &&
    typeof record.canal_de_impacto === "string" &&
    record.canal_de_impacto.trim().length > 0 &&
    typeof record.direccion_posible === "string" &&
    DIRECTIONS.has(record.direccion_posible) &&
    typeof record.horizonte === "string" &&
    HORIZONS.has(record.horizonte) &&
    typeof record.incertidumbre === "string" &&
    UNCERTAINTIES.has(record.incertidumbre) &&
    typeof record.que_mirar === "string" &&
    record.que_mirar.trim().length > 0
  );
}

interface ImpactResponseBody {
  analysis?: unknown;
  /** Alias tolerado por si F71 responde en español. */
  analisis?: unknown;
  data?: { analysis?: unknown } | null;
  cached?: unknown;
  /** F71: análisis cacheado por ticker afectado. */
  matches?: unknown;
  /** F71: respuesta a la pregunta libre (pasa por sanitizeAdvice). */
  answer?: unknown;
  disclaimer?: unknown;
  error?: unknown;
}

/** Extrae el análisis aceptando `analysis`, `analisis` o `{ data: { analysis } }`. */
function analysisFrom(body: ImpactResponseBody, symbol: string): unknown {
  const direct = body.analysis ?? body.analisis ?? body.data?.analysis;
  if (direct !== undefined && direct !== null) return direct;
  // F71 responde `matches: [{ symbol, analysis }]`.
  if (Array.isArray(body.matches)) {
    const wanted = symbol.trim().toUpperCase();
    const match = body.matches.find(
      (m: unknown) =>
        typeof m === "object" &&
        m !== null &&
        String((m as { symbol?: unknown }).symbol ?? "").toUpperCase() === wanted,
    ) as { analysis?: unknown } | undefined;
    return match?.analysis;
  }
  return undefined;
}

/**
 * Pide el análisis de una noticia × ticker. Nunca lanza: todo error se
 * devuelve como resultado tipado para que el drawer lo pinte.
 */
export async function requestImpact(
  input: ImpactRequestInput,
): Promise<ImpactClientResult> {
  const question = (input.question ?? "").trim();

  let response: Response;
  try {
    response = await fetch("/api/impact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      // Contrato de F71: solo el id de la noticia y la pregunta. Las
      // posiciones las lee el servidor; nunca viajan desde el navegador.
      body: JSON.stringify({
        newsId: input.newsId,
        ...(question.length > 0 ? { question } : {}),
      }),
    });
  } catch {
    return {
      status: "error",
      message: "No pudimos conectar con el análisis. Revisa tu conexión e inténtalo otra vez.",
    };
  }

  if (response.status === 404 || response.status === 405 || response.status === 501) {
    return { status: "unavailable", message: IMPACT_UNAVAILABLE_MESSAGE };
  }
  if (response.status === 401 || response.status === 403) {
    return {
      status: "error",
      message: "Inicia sesión para pedir el análisis de esta noticia.",
    };
  }
  if (response.status === 429) {
    return { status: "error", message: IMPACT_QUOTA_MESSAGE };
  }

  let body: ImpactResponseBody = {};
  try {
    body = (await response.json()) as ImpactResponseBody;
  } catch {
    body = {};
  }

  if (!response.ok) {
    const message =
      typeof body.error === "string" && body.error.trim().length > 0
        ? body.error.trim()
        : "No pudimos generar el análisis. Inténtalo otra vez.";
    return { status: "error", message };
  }

  const rawAnalysis = analysisFrom(body, input.symbol);
  const analysis = isImpactAnalysis(rawAnalysis) ? rawAnalysis : null;
  const answer =
    typeof body.answer === "string" && body.answer.trim().length > 0
      ? body.answer.trim()
      : null;

  if (!analysis && !answer) {
    return { status: "error", message: IMPACT_EMPTY_ANALYSIS_MESSAGE };
  }

  return {
    status: "ok",
    analysis,
    answer,
    cached: analysis !== null && (body.cached === true || body.analysis === undefined),
    disclaimer:
      typeof body.disclaimer === "string" && body.disclaimer.trim().length > 0
        ? body.disclaimer.trim()
        : AI_DISCLAIMER,
  };
}
