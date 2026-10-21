/**
 * POST /api/impact — "Pregunta a la IA" sobre una noticia (F71, paso B).
 *
 * Body: { newsId: uuid, question?: string }
 *
 * Flujo:
 *   1. Solo con `NEWS_IMPACT_ENABLED=true` (si no, 404).
 *   2. Exige sesión (401) y consentimiento vigente de la cartera (403).
 *   3. Cupo del asistente: cada consulta cuesta 1 (`check_chat_quota`).
 *   4. Respuesta base SIN LLM: análisis cacheado (paso A) de los tickers de la
 *      noticia que están en la cartera + exposición con `exposurePct`.
 *   5. Solo si viene `question` se llama al LLM, siempre con pesos en %, tickers,
 *      título, resumen corto y análisis cacheado. Nunca cantidades, costos,
 *      montos, nombre, correo ni user_id.
 *   6. La salida pasa por `sanitizeAdvice` y siempre lleva `AI_DISCLAIMER` y la
 *      fuente (url de la noticia).
 *
 * Todas las lecturas de noticia/caché usan el service role (la 051 los cierra
 * a anon/authenticated); la cartera y el registro de la consulta usan el
 * cliente de sesión para que la RLS siga siendo la última defensa.
 */

import { adviceRule, AI_DISCLAIMER, sanitizeAdvice } from "@/lib/advice-filter";
import { logAdviceBlock } from "@/lib/chat-advice";
import { enforceSignedInQuota } from "@/lib/chat-guard";
import {
  buildImpactPrompt,
  impactPositions,
  impactRequestSchema,
  type ImpactPosition,
} from "@/lib/impact-question";
import { FINTEC_NOTICE } from "@/lib/legal";
import { completeChat, llmConfig, llmUnavailableResponse } from "@/lib/llm";
import {
  exposurePct,
  type NewsItem,
  type NewsRelation,
  type NewsTicker,
} from "@/lib/news-match";
import { hasCurrentPortfolioConsent } from "@/lib/portfolio-consent";
import { isNewsImpactEnabled } from "@/lib/portfolio-flags";
import { getServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { firstZodMessage } from "@/lib/validation";

/** Body pequeño: una pregunta libre corta. */
const MAX_BODY_BYTES = 8_000;

interface ImpactRow {
  [key: string]: unknown;
}

function asRow(value: unknown): ImpactRow | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as ImpactRow)
    : null;
}

function asRows(value: unknown): ImpactRow[] {
  return Array.isArray(value) ? (value as ImpactRow[]) : [];
}

function text(value: unknown, max = 500): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function num(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function relation(value: unknown): NewsRelation {
  const allowed: NewsRelation[] = ["direct", "sector", "supplier", "competitor", "macro"];
  return allowed.includes(value as NewsRelation) ? (value as NewsRelation) : "direct";
}

/** Último análisis cacheado por símbolo (puede haber varios modelos/versiones). */
function latestAnalysisBySymbol(rows: ImpactRow[]): Map<string, unknown> {
  const bySymbol = new Map<string, { at: number; analysis: unknown }>();
  for (const row of rows) {
    const symbol = text(row.symbol, 20).toUpperCase();
    if (!symbol) continue;
    const at = Date.parse(String(row.created_at ?? "")) || 0;
    const current = bySymbol.get(symbol);
    if (!current || at >= current.at) {
      bySymbol.set(symbol, { at, analysis: row.analysis });
    }
  }
  return new Map([...bySymbol.entries()].map(([symbol, value]) => [symbol, value.analysis]));
}

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  // 1. Función detrás de flag: apagada responde 404 (no revela que existe).
  if (!isNewsImpactEnabled()) {
    return jsonError("Noticia no encontrada.", 404);
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return jsonError("No pudimos leer la solicitud.", 400);
  }
  if (raw.length > MAX_BODY_BYTES) {
    return jsonError("La solicitud es demasiado grande.", 413);
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return jsonError("Body inválido.", 400);
  }

  const parsed = impactRequestSchema.safeParse(json);
  if (!parsed.success) {
    return jsonError(firstZodMessage(parsed.error), 400);
  }
  const { newsId } = parsed.data;
  const question = parsed.data.question?.trim() ?? "";

  // 2. Sesión obligatoria: es una consulta sobre la cartera propia.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return jsonError("Inicia sesión para preguntar por tu cartera.", 401);
  }

  // 2b. Consentimiento vigente (Ley 21.719): la versión debe ser la actual.
  const settingsResult = await supabase
    .from("user_portfolio_settings")
    .select("consent_at, consent_version")
    .eq("user_id", user.id)
    .maybeSingle();
  if (settingsResult.error) {
    console.warn("[reclu] impact consent:", settingsResult.error.message);
    return jsonError("No pudimos verificar tu consentimiento.", 503);
  }
  const settings = asRow(settingsResult.data);
  const hasConsent = hasCurrentPortfolioConsent(
    typeof settings?.consent_at === "string" ? settings.consent_at : null,
    typeof settings?.consent_version === "string" ? settings.consent_version : null,
  );
  if (!hasConsent) {
    return jsonError(
      "Necesitamos tu consentimiento explícito para analizar tu cartera. Actívalo en Ajustes.",
      403,
    );
  }

  const service = getServiceClient();
  if (!service) {
    return jsonError("La IA de impacto no está disponible en este entorno.", 503);
  }

  // 3. Noticia y sus tickers (service role: la 051 cierra `summary` a anon).
  const newsResult = await service
    .from("news_items")
    .select("id, source, url, title, summary, published_at")
    .eq("id", newsId)
    .maybeSingle();
  if (newsResult.error) {
    console.warn("[reclu] impact news:", newsResult.error.message);
    return jsonError("No pudimos leer la noticia.", 503);
  }
  const news = asRow(newsResult.data);
  if (!news) {
    return jsonError("Noticia no encontrada.", 404);
  }

  const tickersResult = await service
    .from("news_tickers")
    .select("symbol, relation, confidence")
    .eq("news_id", newsId);
  if (tickersResult.error) {
    console.warn("[reclu] impact tickers:", tickersResult.error.message);
    return jsonError("No pudimos leer la noticia.", 503);
  }
  const tickerRows = asRows(tickersResult.data);
  const newsTickers: NewsTicker[] = tickerRows
    .map((row) => ({
      symbol: text(row.symbol, 20).toUpperCase(),
      relation: relation(row.relation),
      confidence: num(row.confidence),
    }))
    .filter((ticker) => ticker.symbol.length > 0);

  // Cartera del usuario (cliente de sesión: RLS auth.uid() = user_id).
  const holdingsResult = await supabase
    .from("user_holdings")
    .select("symbol, weight")
    .eq("user_id", user.id);
  if (holdingsResult.error) {
    console.warn("[reclu] impact holdings:", holdingsResult.error.message);
    return jsonError("No pudimos leer tu cartera.", 503);
  }
  const positions: ImpactPosition[] = impactPositions(asRows(holdingsResult.data));

  // 4. Sin modelo configurado no hay LLM: sin pregunta igual funciona.
  const config = llmConfig();
  if (question && !config.enabled) {
    return llmUnavailableResponse(config.missing);
  }

  // 5. Cupo del asistente: solo la pregunta libre (que llama al LLM)
  //    descuenta 1. Abrir el panel y ver el análisis cacheado es gratis.
  let quotaHeaders: Record<string, string> = {};
  if (question) {
    const quota = await enforceSignedInQuota(user.id);
    if (!quota.ok) {
      return Response.json(quota.body, {
        status: quota.status,
        headers: { "Cache-Control": "no-store" },
      });
    }
    quotaHeaders = { ...quota.headers };
  }

  // 6. Cruce noticia × cartera SIN LLM.
  const newsItem: NewsItem = {
    id: String(news.id ?? newsId),
    source: text(news.source, 40) || "desconocida",
    title: text(news.title, 300),
    publishedAt: text(news.published_at, 40) || new Date().toISOString(),
    tickers: newsTickers,
  };
  const totalExposure = exposurePct(newsItem, positions);
  const weightBySymbol = new Map(positions.map((position) => [position.symbol, position.weight]));

  const matchedSymbols = [...new Set(newsTickers.map((ticker) => ticker.symbol))].filter(
    (symbol) => weightBySymbol.has(symbol),
  );

  let analysesBySymbol = new Map<string, unknown>();
  if (matchedSymbols.length > 0) {
    const cacheResult = await service
      .from("ai_impact_cache")
      .select("symbol, analysis, created_at")
      .eq("news_id", newsId);
    if (cacheResult.error) {
      console.warn("[reclu] impact cache:", cacheResult.error.message);
    } else {
      analysesBySymbol = latestAnalysisBySymbol(asRows(cacheResult.data));
    }
  }

  const relationBySymbol = new Map<string, NewsRelation>();
  for (const ticker of newsTickers) {
    if (!relationBySymbol.has(ticker.symbol)) relationBySymbol.set(ticker.symbol, ticker.relation);
  }

  const matches = matchedSymbols
    .map((symbol) => ({
      symbol,
      relation: relationBySymbol.get(symbol) ?? "direct",
      exposurePct: weightBySymbol.get(symbol) ?? 0,
      analysis: analysesBySymbol.get(symbol) ?? null,
    }))
    .sort((a, b) => b.exposurePct - a.exposurePct || (a.symbol < b.symbol ? -1 : 1));

  const source = {
    title: text(news.title, 300),
    url: text(news.url, 500),
    publisher: text(news.source, 40),
  };

  // 7. Solo con pregunta se llama al LLM (minimización estricta).
  let answer: string | null = null;
  if (question) {
    const prompt = buildImpactPrompt({
      title: text(news.title, 300),
      summary: text(news.summary, 500),
      positions: matches.map((match) => ({ symbol: match.symbol, weight: match.exposurePct })),
      analyses: matches.map((match) => ({ symbol: match.symbol, analysis: match.analysis })),
      question,
    });

    const result = await completeChat({
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      maxTokens: 600,
      temperature: 0.2,
    });
    if (!result.ok) {
      return jsonError(result.error, result.status);
    }
    if (!result.content.trim()) {
      return jsonError("La IA no entregó una respuesta. Intenta de nuevo.", 502);
    }

    const rule = adviceRule(result.content);
    if (rule) logAdviceBlock("/api/impact", rule);
    answer = sanitizeAdvice(result.content);
  }

  // 8. Auditoría de la consulta con el cliente de sesión (RLS propia).
  const { error: insertError } = await supabase.from("user_impact_requests").insert({
    user_id: user.id,
    news_id: newsId,
    delivered_via: "web",
  });
  if (insertError) {
    console.warn("[reclu] user_impact_requests:", insertError.message);
  }

  return Response.json(
    {
      news: {
        id: String(news.id ?? newsId),
        title: source.title,
        url: source.url,
        publisher: source.publisher,
        publishedAt: newsItem.publishedAt,
      },
      exposurePct: totalExposure,
      exposureText:
        totalExposure > 0
          ? `Esta noticia toca el ${totalExposure.toFixed(1)}% de tu cartera.`
          : "Esta noticia no toca posiciones de tu cartera.",
      matches,
      answer,
      source,
      notice: FINTEC_NOTICE,
      disclaimer: AI_DISCLAIMER,
    },
    {
      headers: {
        ...quotaHeaders,
        "Cache-Control": "no-store",
      },
    },
  );
}
