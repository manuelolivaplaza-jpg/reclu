/**
 * POST /api/impact/alerts — job de alertas automáticas de Mi portafolio (F73).
 *
 * Recorre las noticias recientes (`news_items` de la 051), las cruza con las
 * carteras de los usuarios que activaron el opt-in y envía, por el canal
 * elegido, solo lo que supera su umbral de relevancia.
 *
 * Reglas:
 *   - Solo usuarios con `user_portfolio_settings.auto_alerts = true` y
 *     `consent_at` vigente.
 *   - Plan Gratis (`autoAlerts === "none"`) no recibe nada; Pro recibe un
 *     resumen diario; Elite, tiempo real con tope `autoAlertsMaxPerDay` (20).
 *   - Sin duplicados (user, news, symbol) y sin montos en el contenido.
 *   - Email por Resend y Telegram por Bot API, con el mismo patrón que la
 *     edge function `send-alerts` (fetch inyectable para los tests).
 *
 * AUTENTICACIÓN: `Authorization: Bearer ${CRON_SECRET}` con comparación de
 * tiempo constante. Sin secreto configurado responde 503 y no ejecuta nada.
 * Con `NEWS_IMPACT_ENABLED` distinto de `"true"` responde 404.
 */
import { matchNewsToPortfolio, type NewsItem, type Position, type TickerProfile } from "@/lib/news-match";
import { portfolioLimitsFor } from "@/lib/plans";
import {
  isPortfolioAlertEligible,
  portfolioAlertMode,
  portfolioAlertSubject,
  portfolioDeliveryChannels,
  PORTFOLIO_NEWS_SUBJECT,
  renderPortfolioAlertEmail,
  renderPortfolioAlertTelegram,
  selectPortfolioDeliveries,
  type PortfolioAlertItem,
} from "@/lib/portfolio-alerts";
import { isNewsImpactEnabled } from "@/lib/portfolio-flags";
import { timingSafeEqual } from "@/lib/safe-compare";
import { hasCurrentPortfolioConsent } from "@/lib/portfolio-consent";
import { siteUrl } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";

const WINDOW_HOURS = 48;
const MAX_NEWS = 100;
const NEWS_RELATIONS = new Set(["direct", "sector", "supplier", "competitor", "macro"]);

/**
 * F80: tope global de entregas por corrida. Cuenta los correos y los mensajes
 * de Telegram enviados en una sola corrida del job, entre todos los usuarios.
 * Lo que no cabe queda diferido para la próxima corrida (no se pierde: los
 * avisos no registrados se reintentan).
 */
const MAX_DELIVERIES_PER_RUN = 200;

// ---- Autenticación ----

/** Valida el header Authorization contra CRON_SECRET. null = válido. */
function checkAuth(request: Request): Response | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return Response.json(
      {
        error:
          "CRON_SECRET no está configurado. Las alertas de cartera no pueden ejecutarse sin él.",
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

// ---- Filas de la base ----

interface SettingsRow {
  user_id?: unknown;
  auto_alerts?: unknown;
  min_relevance?: unknown;
  alert_channel?: unknown;
  consent_at?: unknown;
  consent_version?: unknown;
}

interface ProfileRow {
  id?: unknown;
  email?: unknown;
  plan?: unknown;
  trial_ends_at?: unknown;
  email_unsubscribed?: unknown;
  telegram_chat_id?: unknown;
  unsubscribe_token?: unknown;
}

interface HoldingRow {
  user_id?: unknown;
  symbol?: unknown;
  weight?: unknown;
}

interface TickerProfileRow {
  symbol?: unknown;
  sector?: unknown;
  industry?: unknown;
  peers?: unknown;
  suppliers?: unknown;
  macro_factors?: unknown;
}

interface NewsTickerRow {
  symbol?: unknown;
  relation?: unknown;
  confidence?: unknown;
}

interface NewsRow {
  id?: unknown;
  source?: unknown;
  url?: unknown;
  title?: unknown;
  published_at?: unknown;
  news_tickers?: unknown;
}

interface SentRow {
  user_id?: unknown;
  news_id?: unknown;
  symbol?: unknown;
  sent_at?: unknown;
}

interface RouteNews extends NewsItem {
  url: string;
}

// ---- Normalizadores ----

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeSymbol(value: unknown): string {
  return asString(value).trim().toUpperCase();
}

function dedupeKey(userId: string, newsId: string, symbol: string): string {
  return `${userId}\u0000${newsId}\u0000${symbol}`;
}

function collectNews(rows: unknown): RouteNews[] {
  if (!Array.isArray(rows)) return [];
  const news: RouteNews[] = [];

  for (const raw of rows as NewsRow[]) {
    if (!raw || typeof raw !== "object") continue;
    const id = asString(raw.id);
    const title = asString(raw.title);
    const url = asString(raw.url);
    const publishedAt = asString(raw.published_at);
    if (!id || !title || !url || !publishedAt) continue;

    const tickers = (Array.isArray(raw.news_tickers) ? raw.news_tickers : [])
      .map((ticker) => ticker as NewsTickerRow)
      .map((ticker) => ({
        symbol: normalizeSymbol(ticker?.symbol),
        relation: asString(ticker?.relation),
        confidence: asNumber(ticker?.confidence, 1),
      }))
      .filter(
        (ticker) =>
          ticker.symbol.length > 0 && NEWS_RELATIONS.has(ticker.relation),
      )
      .map((ticker) => ({
        symbol: ticker.symbol,
        relation: ticker.relation as NewsItem["tickers"][number]["relation"],
        confidence: ticker.confidence,
      }));

    news.push({
      id,
      source: asString(raw.source),
      title,
      publishedAt,
      tickers,
      url,
    });
  }

  return news;
}

function collectProfiles(rows: unknown): TickerProfile[] {
  if (!Array.isArray(rows)) return [];
  const profiles: TickerProfile[] = [];
  for (const raw of rows as TickerProfileRow[]) {
    if (!raw || typeof raw !== "object") continue;
    const symbol = normalizeSymbol(raw.symbol);
    if (!symbol) continue;
    profiles.push({
      symbol,
      sector: asString(raw.sector),
      industry: asString(raw.industry),
      peers: asStringArray(raw.peers),
      suppliers: asStringArray(raw.suppliers),
      macroFactors: asStringArray(raw.macro_factors),
    });
  }
  return profiles;
}

function startOfUtcDay(now: number): string {
  const date = new Date(now);
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  ).toISOString();
}

// ---- Envío ----

async function sendEmail(
  resendKey: string,
  from: string,
  to: string,
  subject: string,
  html: string,
  unsubscribeUrl?: string | null,
): Promise<boolean> {
  if (!resendKey || !to || !html) return false;
  const payload: Record<string, unknown> = { from, to, subject, html };
  if (unsubscribeUrl) {
    payload.headers = {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch (err) {
    console.warn("[reclu] portfolio alerts email:", err instanceof Error ? err.message : err);
    return false;
  }
}

async function sendTelegram(token: string, chatId: string, text: string): Promise<boolean> {
  if (!token || !chatId || !text) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn("[reclu] portfolio alerts telegram:", err instanceof Error ? err.message : err);
    return false;
  }
}

// ---- Job ----

export async function POST(request: Request) {
  // F80: la bandera va PRIMERO. Con la función apagada se responde 404
  // aunque falte CRON_SECRET: así no se revela que el job existe ni se
  // distingue "falta el secreto" de "no hay autorización".
  if (!isNewsImpactEnabled()) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const denied = checkAuth(request);
  if (denied) return denied;

  const supabase = createAdminClient();
  if (!supabase) {
    return Response.json(
      {
        error:
          "Las alertas de cartera requieren NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 503 },
    );
  }

  const resendKey = process.env.RESEND_API_KEY ?? "";
  const from = process.env.EMAIL_FROM ?? "reclu.cl <alertas@reclu.cl>";
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
  if (!resendKey && !telegramToken) {
    return Response.json(
      { error: "No hay canal configurado (RESEND_API_KEY o TELEGRAM_BOT_TOKEN)." },
      { status: 503 },
    );
  }

  const now = Date.now();
  const since = new Date(now - WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const dayStart = startOfUtcDay(now);
  const baseUrl = siteUrl();

  // 1. Noticias recientes con sus tickers.
  const { data: newsData, error: newsError } = await supabase
    .from("news_items")
    .select("id, source, url, title, published_at, news_tickers(symbol, relation, confidence)")
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(MAX_NEWS);

  if (newsError) {
    console.warn("[reclu] portfolio alerts news_items:", newsError.message);
    return Response.json(
      { error: "No pudimos leer las noticias recientes." },
      { status: 500 },
    );
  }

  const news = collectNews(newsData);
  if (news.length === 0) {
    return Response.json(
      { ok: true, news: 0, users: 0, candidates: 0, delivered: 0, emails: 0, telegrams: 0 },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // 2. Usuarios con opt-in. El filtro por consentimiento se repite en código
  //    para no depender de que la consulta lo aplique.
  const { data: settingsData, error: settingsError } = await supabase
    .from("user_portfolio_settings")
    .select("user_id, auto_alerts, min_relevance, alert_channel, consent_at, consent_version")
    .eq("auto_alerts", true);

  if (settingsError) {
    console.warn("[reclu] portfolio alerts settings:", settingsError.message);
    return Response.json(
      { error: "No pudimos leer los ajustes de alertas." },
      { status: 500 },
    );
  }

  const settingsRows = (Array.isArray(settingsData) ? settingsData : []) as SettingsRow[];
  const optIn = settingsRows
    .map((row) => ({
      userId: asString(row.user_id),
      autoAlerts: row.auto_alerts === true,
      minRelevance: asNumber(row.min_relevance, 0.5),
      alertChannel: asString(row.alert_channel) || "email",
      // Solo vale el consentimiento del texto vigente (F75B).
      consentAt: hasCurrentPortfolioConsent(
        asString(row.consent_at) || null,
        asString(row.consent_version) || null,
      )
        ? asString(row.consent_at) || null
        : null,
    }))
    .filter(
      (row) =>
        row.userId.length > 0 && row.autoAlerts === true && row.consentAt !== null,
    );

  if (optIn.length === 0) {
    return Response.json(
      {
        ok: true,
        news: news.length,
        users: 0,
        candidates: 0,
        delivered: 0,
        emails: 0,
        telegrams: 0,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const userIds = [...new Set(optIn.map((row) => row.userId))];
  const newsIds = [...new Set(news.map((item) => item.id))];

  // 3. Perfiles (plan, canales y baja), cartera y perfiles de tickers.
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select(
      "id, email, plan, trial_ends_at, email_unsubscribed, telegram_chat_id, unsubscribe_token",
    )
    .in("id", userIds);

  if (profileError) {
    console.warn("[reclu] portfolio alerts profiles:", profileError.message);
    return Response.json(
      { error: "No pudimos leer los perfiles de los usuarios." },
      { status: 500 },
    );
  }

  const profilesById = new Map<string, ProfileRow>();
  for (const row of (Array.isArray(profileData) ? profileData : []) as ProfileRow[]) {
    const id = asString(row.id);
    if (id) profilesById.set(id, row);
  }

  const { data: holdingsData, error: holdingsError } = await supabase
    .from("user_holdings")
    .select("user_id, symbol, weight")
    .in("user_id", userIds);

  if (holdingsError) {
    console.warn("[reclu] portfolio alerts holdings:", holdingsError.message);
    return Response.json(
      { error: "No pudimos leer las carteras de los usuarios." },
      { status: 500 },
    );
  }

  const holdingsByUser = new Map<string, Position[]>();
  const symbols = new Set<string>();
  for (const item of news) {
    for (const ticker of item.tickers) symbols.add(ticker.symbol);
  }
  for (const row of (Array.isArray(holdingsData) ? holdingsData : []) as HoldingRow[]) {
    const userId = asString(row.user_id);
    const symbol = normalizeSymbol(row.symbol);
    if (!userId || !symbol) continue;
    const list = holdingsByUser.get(userId) ?? [];
    list.push({ symbol, weight: asNumber(row.weight, 0) });
    holdingsByUser.set(userId, list);
    symbols.add(symbol);
  }

  const { data: tickerData, error: tickerError } = await supabase
    .from("ticker_profile")
    .select("symbol, sector, industry, peers, suppliers, macro_factors")
    .in("symbol", [...symbols]);

  // El perfil es contexto opcional: sin él, el match directo sigue funcionando.
  if (tickerError) {
    console.warn("[reclu] portfolio alerts ticker_profile:", tickerError.message);
  }
  const tickerProfiles = collectProfiles(tickerData);

  // 4. Historial: duplicados de estas noticias y envíos de hoy (tope diario).
  const { data: sentData, error: sentError } = await supabase
    .from("user_portfolio_alerts")
    .select("user_id, news_id, symbol, sent_at")
    .in("user_id", userIds)
    .in("news_id", newsIds);

  if (sentError) {
    console.warn("[reclu] portfolio alerts sent history:", sentError.message);
    return Response.json(
      { error: "No pudimos leer el historial de alertas de cartera." },
      { status: 500 },
    );
  }

  const sentKeys = new Set<string>();
  for (const row of (Array.isArray(sentData) ? sentData : []) as SentRow[]) {
    const userId = asString(row.user_id);
    const newsId = asString(row.news_id);
    const symbol = normalizeSymbol(row.symbol);
    if (userId && newsId && symbol) sentKeys.add(dedupeKey(userId, newsId, symbol));
  }

  const { data: todayData, error: todayError } = await supabase
    .from("user_portfolio_alerts")
    .select("user_id, sent_at")
    .in("user_id", userIds)
    .gte("sent_at", dayStart);

  if (todayError) {
    console.warn("[reclu] portfolio alerts daily cap:", todayError.message);
    return Response.json(
      { error: "No pudimos contar las alertas enviadas hoy." },
      { status: 500 },
    );
  }

  const sentToday = new Map<string, number>();
  for (const row of (Array.isArray(todayData) ? todayData : []) as SentRow[]) {
    const userId = asString(row.user_id);
    if (!userId) continue;
    sentToday.set(userId, (sentToday.get(userId) ?? 0) + 1);
  }

  // 5. Por usuario: elegibilidad, matches, tope y envío.
  let totalCandidates = 0;
  let totalDelivered = 0;
  let emails = 0;
  let telegrams = 0;
  let failedWrites = 0;
  /**
   * F80: mensajes entregados en esta corrida (correos + Telegram, entre todos
   * los usuarios) y avisos que quedaron fuera por el tope global.
   */
  let deliveries = 0;
  let deferred = 0;

  for (const settings of optIn) {
    const profile = profilesById.get(settings.userId);
    if (!profile) continue;

    const plan = asString(profile.plan) || "free";
    const trialEndsAt = asString(profile.trial_ends_at) || null;
    const email = asString(profile.email);
    const telegramChatId = asString(profile.telegram_chat_id);

    const eligible = isPortfolioAlertEligible(
      { autoAlerts: settings.autoAlerts, consentAt: settings.consentAt },
      { plan, trialEndsAt },
      now,
    );
    if (!eligible) continue;

    const mode = portfolioAlertMode(plan, trialEndsAt, now);
    const limits = portfolioLimitsFor(plan, trialEndsAt, now);
    const channels = portfolioDeliveryChannels(
      { alertChannel: settings.alertChannel },
      {
        plan,
        trialEndsAt,
        email,
        emailUnsubscribed: profile.email_unsubscribed === true,
        telegramChatId,
      },
    );
    const emailReady = channels.email && Boolean(resendKey);
    const telegramReady = channels.telegram && Boolean(telegramToken);
    if (!emailReady && !telegramReady) continue;

    const positions = holdingsByUser.get(settings.userId) ?? [];
    if (positions.length === 0) continue;

    const candidates: PortfolioAlertItem[] = [];
    for (const item of news) {
      const matches = matchNewsToPortfolio(item, positions, tickerProfiles, {
        plan,
        trialEndsAt,
        now,
        minRelevance: settings.minRelevance,
      });
      for (const match of matches) {
        if (match.relevance < settings.minRelevance) continue;
        if (sentKeys.has(dedupeKey(settings.userId, item.id, match.symbol))) continue;
        candidates.push({
          newsId: item.id,
          symbol: match.symbol,
          title: item.title,
          url: item.url,
          exposurePct: match.exposurePct,
          relevance: match.relevance,
          relation: match.relation,
          publishedAt: item.publishedAt,
          source: item.source,
        });
      }
    }
    totalCandidates += candidates.length;
    if (candidates.length === 0) continue;

    const selected = selectPortfolioDeliveries(candidates, {
      mode,
      maxPerDay: limits.autoAlertsMaxPerDay,
      sentToday: sentToday.get(settings.userId) ?? 0,
    });
    if (selected.length === 0) continue;

    // Marca qué canales lograron entregar cada aviso. Solo se registra lo
    // entregado por al menos un canal, para reintentar lo que falle.
    const delivered = new Map<string, Set<"email" | "telegram">>();
    const mark = (item: PortfolioAlertItem, channel: "email" | "telegram") => {
      const key = dedupeKey(settings.userId, item.newsId, item.symbol);
      const set = delivered.get(key) ?? new Set<"email" | "telegram">();
      set.add(channel);
      delivered.set(key, set);
    };

    const unsubscribe = asString(profile.unsubscribe_token)
      ? `${baseUrl}/api/unsubscribe?token=${encodeURIComponent(asString(profile.unsubscribe_token))}`
      : null;
    const name = asString(profile.email).split("@")[0] || null;

    // F80: tope global de entregas por corrida. Si ya se alcanzó, este
    // usuario y los siguientes quedan diferidos para la próxima corrida: no
    // se marca nada como entregado, así que no se pierde ningún aviso.
    if (deliveries >= MAX_DELIVERIES_PER_RUN) {
      deferred += selected.length;
      continue;
    }

    if (mode === "daily_digest") {
      // Un correo y/o un mensaje con todos los avisos del día.
      let deliveredSomething = false;
      if (emailReady && deliveries < MAX_DELIVERIES_PER_RUN) {
        const ok = await sendEmail(
          resendKey,
          from,
          email,
          PORTFOLIO_NEWS_SUBJECT,
          renderPortfolioAlertEmail({ items: selected, siteUrl: baseUrl, name, unsubscribeUrl: unsubscribe }),
          unsubscribe,
        );
        if (ok) {
          emails += 1;
          deliveries += 1;
          deliveredSomething = true;
          for (const item of selected) mark(item, "email");
        }
      }
      if (telegramReady && deliveries < MAX_DELIVERIES_PER_RUN) {
        const ok = await sendTelegram(
          telegramToken,
          telegramChatId,
          renderPortfolioAlertTelegram(selected),
        );
        if (ok) {
          telegrams += 1;
          deliveries += 1;
          deliveredSomething = true;
          for (const item of selected) mark(item, "telegram");
        }
      }
      // F80: no salió nada y el tope ya estaba alcanzado -> avisos diferidos.
      if (!deliveredSomething && deliveries >= MAX_DELIVERIES_PER_RUN) {
        deferred += selected.length;
      }
    } else {
      // Tiempo real: un aviso por noticia.
      for (const item of selected) {
        let deliveredSomething = false;
        if (emailReady && deliveries < MAX_DELIVERIES_PER_RUN) {
          const ok = await sendEmail(
            resendKey,
            from,
            email,
            portfolioAlertSubject([item]),
            renderPortfolioAlertEmail({ items: [item], siteUrl: baseUrl, name, unsubscribeUrl: unsubscribe }),
            unsubscribe,
          );
          if (ok) {
            emails += 1;
            deliveries += 1;
            deliveredSomething = true;
            mark(item, "email");
          }
        }
        if (telegramReady && deliveries < MAX_DELIVERIES_PER_RUN) {
          const ok = await sendTelegram(
            telegramToken,
            telegramChatId,
            renderPortfolioAlertTelegram([item]),
          );
          if (ok) {
            telegrams += 1;
            deliveries += 1;
            deliveredSomething = true;
            mark(item, "telegram");
          }
        }
        // F80: quedó fuera por el tope global de la corrida.
        if (!deliveredSomething && deliveries >= MAX_DELIVERIES_PER_RUN) {
          deferred += 1;
        }
      }
    }

    const rows = selected
      .map((item) => {
        const channelsUsed = delivered.get(dedupeKey(settings.userId, item.newsId, item.symbol));
        if (!channelsUsed || channelsUsed.size === 0) return null;
        return {
          user_id: settings.userId,
          news_id: item.newsId,
          symbol: item.symbol,
          relevance: Math.round(item.relevance * 100000) / 100000,
          channel:
            channelsUsed.size === 2 ? "both" : [...channelsUsed][0],
          sent_at: new Date().toISOString(),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (rows.length === 0) continue;

    const { error: writeError } = await supabase.from("user_portfolio_alerts").upsert(
      rows,
      { onConflict: "user_id,news_id,symbol", ignoreDuplicates: true },
    );
    if (writeError) {
      failedWrites += rows.length;
      console.warn("[reclu] portfolio alerts upsert:", writeError.message);
    }

    totalDelivered += rows.length;
    sentToday.set(settings.userId, (sentToday.get(settings.userId) ?? 0) + rows.length);
  }

  // F80: solo el CONTEO de diferidos. Nunca la lista de símbolos, noticias ni
  // usuarios: esos datos son de cartera y no van a los logs.
  if (deferred > 0) {
    console.warn("[reclu] portfolio alerts diferidos por tope de corrida:", deferred);
  }

  return Response.json(
    {
      ok: true,
      news: news.length,
      users: optIn.length,
      candidates: totalCandidates,
      delivered: totalDelivered,
      emails,
      telegrams,
      failed_writes: failedWrites,
      /** Avisos que quedaron fuera por el tope global de la corrida. */
      deferred,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
