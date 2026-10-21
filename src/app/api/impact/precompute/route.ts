/**
 * POST /api/impact/precompute — job del análisis genérico cacheado (F70).
 *
 * Paso A de `docs/mi-portafolio-ia.md` §6: recorre las noticias de las
 * últimas 48 h, toma sus tickers DIRECTOS y, por cada par (noticia, ticker)
 * que aún no esté en `ai_impact_cache` para `IMPACT_PROMPT_VERSION`, pide una
 * sola respuesta JSON al modelo. El resultado es genérico (sin datos de
 * usuarios) y se reutiliza para todos.
 *
 * AUTENTICACIÓN: `Authorization: Bearer ${CRON_SECRET}` con comparación de
 * tiempo constante (mismo patrón que `/api/run-pipeline`). Sin secreto
 * configurado responde 503 y no ejecuta nada. Con `NEWS_IMPACT_ENABLED`
 * distinto de `"true"` responde 404 (la función está apagada por defecto).
 *
 * Coste: sin modelo configurado no hay llamadas (503). El tope por corrida
 * es `IMPACT_MAX_CALLS` (30 por defecto) para no disparar el gasto.
 */
import { containsAdvice } from "@/lib/advice-filter";
import {
  buildImpactUserPrompt,
  IMPACT_PROMPT_VERSION,
  IMPACT_SYSTEM_PROMPT,
  parseImpactAnalysis,
  type ImpactTickerProfile,
} from "@/lib/impact-prompt";
import { completeChat, llmConfig, llmUnavailableResponse } from "@/lib/llm";
import { isNewsImpactEnabled } from "@/lib/portfolio-flags";
import { timingSafeEqual } from "@/lib/safe-compare";
import { createAdminClient } from "@/lib/supabase/admin";

const WINDOW_HOURS = 48;
const MAX_NEWS = 50;
const DEFAULT_MAX_CALLS = 30;

/** Tope de llamadas por corrida. Se lee en cada request (tests y hot env). */
function impactMaxCalls(): number {
  const raw = Number.parseInt(process.env.IMPACT_MAX_CALLS ?? "", 10);
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_MAX_CALLS;
  return raw;
}

/** Valida el header Authorization contra CRON_SECRET. null = válido. */
function checkAuth(request: Request): Response | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return Response.json(
      {
        error:
          "CRON_SECRET no está configurado. El precompute de impacto no puede ejecutarse sin él.",
      },
      { status: 503 },
    );
  }
  const auth = request.headers.get("authorization") ?? "";
  if (!timingSafeEqual(auth, `Bearer ${cronSecret}`)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

interface NewsTickerRow {
  symbol?: unknown;
  relation?: unknown;
}

interface NewsRow {
  id?: unknown;
  title?: unknown;
  summary?: unknown;
  news_tickers?: unknown;
}

interface ImpactPair {
  newsId: string;
  title: string;
  summary: string;
  symbol: string;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Normaliza filas de `news_items` y deja solo tickers con relación directa. */
function collectPairs(rows: unknown): ImpactPair[] {
  if (!Array.isArray(rows)) return [];
  const pairs: ImpactPair[] = [];
  const seen = new Set<string>();

  for (const raw of rows as NewsRow[]) {
    if (!raw || typeof raw !== "object") continue;
    const newsId = asString(raw.id);
    if (!newsId) continue;
    const title = asString(raw.title);
    const summary = asString(raw.summary);
    const tickers = Array.isArray(raw.news_tickers)
      ? (raw.news_tickers as NewsTickerRow[])
      : [];

    for (const ticker of tickers) {
      if (!ticker || typeof ticker !== "object") continue;
      if (ticker.relation !== "direct") continue;
      const symbol = asString(ticker.symbol).trim().toUpperCase().slice(0, 24);
      if (!symbol) continue;
      const key = `${newsId}\u0000${symbol}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ newsId, title, summary, symbol });
    }
  }

  return pairs;
}

/** Índice symbol → perfil curado, sin datos de usuarios. */
function collectProfiles(rows: unknown): Map<string, ImpactTickerProfile> {
  const profiles = new Map<string, ImpactTickerProfile>();
  if (!Array.isArray(rows)) return profiles;

  for (const raw of rows as ImpactTickerProfile[]) {
    if (!raw || typeof raw !== "object") continue;
    const symbol = asString(raw.symbol).trim().toUpperCase();
    if (!symbol) continue;
    profiles.set(symbol, {
      sector: raw.sector,
      industry: raw.industry,
      country: raw.country,
      peers: raw.peers,
      suppliers: raw.suppliers,
      macro_factors: raw.macro_factors,
    });
  }

  return profiles;
}

export async function POST(request: Request) {
  const denied = checkAuth(request);
  if (denied) return denied;

  // Bandera legal/funcional: apagada por defecto. No revelamos nada más.
  if (!isNewsImpactEnabled()) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Sin API key y modelo no se hace NADA: ni consultas ni llamadas pagadas.
  const config = llmConfig();
  if (!config.enabled) {
    return llmUnavailableResponse(config.missing);
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return Response.json(
      {
        error:
          "El precompute de impacto requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 503 },
    );
  }

  // F77 (M6): retencion de 90 dias de user_impact_requests (051). Es
  // best-effort: si falla, el precompute sigue.
  try {
    const { error: purgeError } = await supabase.rpc("purge_old_impact_requests");
    if (purgeError) console.warn("[reclu] impact purge:", purgeError.message);
  } catch (err) {
    console.warn("[reclu] impact purge:", err instanceof Error ? err.message : err);
  }

  const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  const { data: newsData, error: newsError } = await supabase
    .from("news_items")
    .select("id, title, summary, news_tickers(symbol, relation)")
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(MAX_NEWS);

  if (newsError) {
    console.warn("[reclu] impact precompute news_items:", newsError.message);
    return Response.json(
      { error: "No pudimos leer las noticias recientes." },
      { status: 500 },
    );
  }

  const pairs = collectPairs(newsData);
  if (pairs.length === 0) {
    return Response.json({
      ok: true,
      prompt_version: IMPACT_PROMPT_VERSION,
      news: Array.isArray(newsData) ? newsData.length : 0,
      pairs: 0,
      cached: 0,
      analyzed: 0,
      rejected: 0,
      failed: 0,
      calls: 0,
    });
  }

  const newsIds = [...new Set(pairs.map((pair) => pair.newsId))];
  const symbols = [...new Set(pairs.map((pair) => pair.symbol))];

  const { data: profileData, error: profileError } = await supabase
    .from("ticker_profile")
    .select("symbol, sector, industry, country, peers, suppliers, macro_factors")
    .in("symbol", symbols);

  // El perfil es contexto opcional: si falla, el análisis sigue sin él.
  if (profileError) {
    console.warn("[reclu] impact precompute ticker_profile:", profileError.message);
  }
  const profiles = collectProfiles(profileData);

  // La caché se consulta ANTES de llamar al modelo: si falla, mejor abortar
  // que repetir llamadas pagadas que ya podrían estar guardadas.
  const { data: cacheData, error: cacheError } = await supabase
    .from("ai_impact_cache")
    .select("news_id, symbol")
    .eq("prompt_version", IMPACT_PROMPT_VERSION)
    .in("news_id", newsIds);

  if (cacheError) {
    console.warn("[reclu] impact precompute ai_impact_cache:", cacheError.message);
    return Response.json(
      { error: "No pudimos leer la caché de análisis." },
      { status: 500 },
    );
  }

  const cachedKeys = new Set<string>();
  if (Array.isArray(cacheData)) {
    for (const row of cacheData as { news_id?: unknown; symbol?: unknown }[]) {
      const newsId = asString(row?.news_id);
      const symbol = asString(row?.symbol).trim().toUpperCase();
      if (newsId && symbol) cachedKeys.add(`${newsId}\u0000${symbol}`);
    }
  }

  const maxCalls = impactMaxCalls();
  let calls = 0;
  let cached = 0;
  let analyzed = 0;
  let rejected = 0;
  let failed = 0;

  for (const pair of pairs) {
    const key = `${pair.newsId}\u0000${pair.symbol}`;
    if (cachedKeys.has(key)) {
      cached += 1;
      continue;
    }
    if (calls >= maxCalls) break;
    calls += 1;

    const result = await completeChat({
      messages: [
        { role: "system", content: IMPACT_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildImpactUserPrompt({
            title: pair.title,
            summary: pair.summary,
            symbol: pair.symbol,
            profile: profiles.get(pair.symbol) ?? null,
          }),
        },
      ],
      maxTokens: 600,
      temperature: 0.2,
    });

    if (!result.ok) {
      failed += 1;
      continue;
    }

    // Dos capas: JSON válido según Zod y sin lenguaje de recomendación.
    const analysis = parseImpactAnalysis(result.content);
    if (!analysis || containsAdvice(result.content)) {
      rejected += 1;
      continue;
    }

    const { error: upsertError } = await supabase.from("ai_impact_cache").upsert(
      {
        news_id: pair.newsId,
        symbol: pair.symbol,
        model: config.model,
        prompt_version: IMPACT_PROMPT_VERSION,
        analysis,
      },
      { onConflict: "news_id,symbol,prompt_version" },
    );

    if (upsertError) {
      console.warn("[reclu] impact precompute upsert:", upsertError.message);
      failed += 1;
      continue;
    }

    analyzed += 1;
  }

  return Response.json(
    {
      ok: true,
      prompt_version: IMPACT_PROMPT_VERSION,
      news: Array.isArray(newsData) ? newsData.length : 0,
      pairs: pairs.length,
      cached,
      analyzed,
      rejected,
      failed,
      calls,
      pending: pairs.length - cached - analyzed - rejected - failed,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
