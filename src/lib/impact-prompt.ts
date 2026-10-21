/**
 * impact-prompt.ts — entrada y prompt del paso B "Pregunta a la IA" (F71).
 *
 * Minimización de datos (Ley 21.719, docs/mi-portafolio-ia.md §6): al modelo
 * SOLO pueden viajar estos campos:
 *   - símbolo y peso en % de la posición;
 *   - título y resumen corto de la noticia;
 *   - análisis genérico cacheado (paso A);
 *   - la pregunta libre del usuario.
 *
 * Nunca cantidades, costos, montos, corretaje, nombre, correo ni user_id.
 * Esto se garantiza construyendo el prompt con campos explícitos
 * (`impactPositions`), no con la fila cruda de `user_holdings`.
 */
import { z } from "zod";

/** Body de POST /api/impact. `question` es opcional: sin ella no hay LLM. */
export const impactRequestSchema = z.object({
  newsId: z.string().uuid("Noticia inválida."),
  question: z.string().trim().max(500, "La pregunta es demasiado larga.").optional(),
});

export type ImpactRequest = z.infer<typeof impactRequestSchema>;

/** Fila mínima de `user_holdings` que sí puede viajar al LLM. */
export interface ImpactPosition {
  symbol: string;
  /** Peso sobre la cartera, 0–100. */
  weight: number;
}

/** La noticia con lo único que se expone al modelo. */
export interface ImpactPromptInput {
  title: string;
  summary: string;
  positions: ImpactPosition[];
  analyses: { symbol: string; analysis: unknown }[];
  question: string;
}

/** Texto límite del análisis cacheado que se envía (entrada acotada). */
export const MAX_ANALYSIS_CHARS = 1200;

function clampWeight(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(100, Math.max(0, num));
}

function normalizeSymbol(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

/**
 * Proyecta filas de `user_holdings` a la forma mínima permitida. Descarta a
 * propósito cualquier otro campo (quantity, avg_cost, broker, name, ...).
 */
export function impactPositions(
  rows: readonly Record<string, unknown>[],
): ImpactPosition[] {
  const bySymbol = new Map<string, ImpactPosition>();
  for (const row of rows) {
    const symbol = normalizeSymbol(row?.symbol);
    if (!symbol) continue;
    const weight = clampWeight(row?.weight);
    const current = bySymbol.get(symbol);
    if (!current) {
      bySymbol.set(symbol, { symbol, weight });
    } else {
      current.weight = clampWeight(current.weight + weight);
    }
  }
  return [...bySymbol.values()].sort(
    (a, b) => b.weight - a.weight || (a.symbol < b.symbol ? -1 : 1),
  );
}

/** Serializa el análisis cacheado a texto acotado para el prompt. */
export function safeAnalysisText(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text: string;
  if (typeof value === "string") {
    text = value;
  } else {
    try {
      text = JSON.stringify(value);
    } catch {
      text = "";
    }
  }
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.slice(0, MAX_ANALYSIS_CHARS);
}

export const IMPACT_SYSTEM_PROMPT = `Eres el asistente de reclu.cl. Explicas el impacto probable de una noticia pública sobre una cartera, usando solo la información que se te entrega.

No eres experto en inversiones ni entregas asesoría. Describes información pública para que cada persona decida por su cuenta: no recomiendas comprar, vender ni mantener instrumentos, no propones pesos objetivo y no sugieres cuánto invertir.

No inventes cifras: si falta información, dilo. Responde en español de Chile, profesional y conciso, en un máximo de 3 párrafos.`;

/** Arma system + user sin incluir jamás datos sensibles del usuario. */
export function buildImpactPrompt(input: ImpactPromptInput): {
  system: string;
  user: string;
} {
  const lines: string[] = [
    `Noticia: ${input.title.trim().slice(0, 300)}`,
  ];
  const summary = input.summary.replace(/\s+/g, " ").trim().slice(0, 500);
  if (summary) lines.push(`Resumen: ${summary}`);

  if (input.positions.length > 0) {
    const positions = input.positions
      .map((position) => `${position.symbol} ${position.weight.toFixed(1)}%`)
      .join("; ");
    lines.push(`Posiciones afectadas (peso sobre la cartera): ${positions}.`);
  }

  const analyses = input.analyses
    .map((entry) => {
      const text = safeAnalysisText(entry.analysis);
      return text ? `${entry.symbol}: ${text}` : "";
    })
    .filter(Boolean);
  if (analyses.length > 0) {
    lines.push("Análisis de referencia:", ...analyses);
  }

  const question = input.question.trim();
  lines.push(`Pregunta: ${question}`);

  return { system: IMPACT_SYSTEM_PROMPT, user: lines.join("\n") };
}
