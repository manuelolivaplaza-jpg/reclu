/**
 * portfolio-alerts.ts — piezas puras de las alertas automáticas de Mi
 * portafolio (F73). Sin red ni Supabase: el job `/api/impact/alerts` las usa
 * y los tests las pueden ejercitar sin mocks.
 *
 * Reglas de negocio (docs/mi-portafolio-ia.md §5, §8):
 *   - Gratis no recibe alertas automáticas (`autoAlerts === "none"`).
 *   - Pro recibe un resumen diario.
 *   - Elite recibe tiempo real con tope `autoAlertsMaxPerDay` (20).
 *   - Sin consentimiento explícito (`consent_at`) o con auto_alerts apagado
 *     no se envía nada.
 *   - El contenido nunca incluye montos: solo ticker, título, % de la cartera
 *     expuesto, enlace a la fuente y el descargo corto.
 */
import { normalizeChannel } from "@/lib/alert-routing";
import type { NewsRelation } from "@/lib/news-match";
import {
  portfolioLimitsFor,
  type AlertChannelValue,
  type AutoAlertsMode,
} from "@/lib/plans";

/** Descargo corto obligatorio en cada alerta (informe legal §2.2). */
export const PORTFOLIO_NEWS_DISCLAIMER =
  "IA · Información, no recomendación · Puede tener errores.";

/** Etiqueta del resumen diario / asunto base del correo. */
export const PORTFOLIO_NEWS_SUBJECT = "reclu.cl — Noticias que tocan tu cartera";

/** Un aviso listo para renderizar y enviar. */
export interface PortfolioAlertItem {
  newsId: string;
  symbol: string;
  title: string;
  /** Enlace a la fuente original (obligatorio por derechos de autor). */
  url: string;
  /** Peso de la posición tocada, en porcentaje 0–100. */
  exposurePct: number;
  /** Relevancia 0–1 calculada por news-match.ts. */
  relevance: number;
  relation: NewsRelation;
  publishedAt?: string;
  source?: string;
}

/** Datos mínimos de la preferencia del usuario (`user_portfolio_settings`). */
export interface PortfolioAlertSettings {
  autoAlerts: boolean;
  consentAt?: string | null;
  minRelevance: number;
  alertChannel?: string | null;
}

/** Perfil mínimo necesario para decidir canales. */
export interface PortfolioAlertProfile {
  plan?: string | null;
  trialEndsAt?: string | null;
  email?: string | null;
  emailUnsubscribed?: boolean | null;
  telegramChatId?: string | null;
}

export interface PortfolioDeliveryChannels {
  email: boolean;
  telegram: boolean;
  /** Canal efectivo para registrar en `user_portfolio_alerts.channel`. */
  channel: AlertChannelValue;
}

// ---- Elegibilidad ----

/** Modo de alertas que permite el plan (o la prueba vigente). */
export function portfolioAlertMode(
  plan?: string | null,
  trialEndsAt?: string | null,
  now: number = Date.now(),
): AutoAlertsMode {
  return portfolioLimitsFor(plan, trialEndsAt, now).autoAlerts;
}

/**
 * ¿El usuario puede recibir alertas automáticas? Opt-in real: switch activo,
 * consentimiento vigente y un plan con `autoAlerts` distinto de "none".
 */
export function isPortfolioAlertEligible(
  settings: Pick<PortfolioAlertSettings, "autoAlerts" | "consentAt">,
  profile: Pick<PortfolioAlertProfile, "plan" | "trialEndsAt">,
  now: number = Date.now(),
): boolean {
  if (settings.autoAlerts !== true) return false;
  if (typeof settings.consentAt !== "string" || settings.consentAt.trim() === "") {
    return false;
  }
  return portfolioAlertMode(profile.plan, profile.trialEndsAt, now) !== "none";
}

/**
 * Canales efectivos: se reutiliza `normalizeChannel` de alert-routing
 * (Telegram solo en Pro/Elite/prueba) y se respeta la baja de correo.
 */
export function portfolioDeliveryChannels(
  settings: Pick<PortfolioAlertSettings, "alertChannel">,
  profile: PortfolioAlertProfile,
): PortfolioDeliveryChannels {
  const channel = normalizeChannel(
    profile.plan ?? "free",
    settings.alertChannel,
    profile.trialEndsAt,
  );
  const wantsEmail = channel === "email" || channel === "both";
  const wantsTelegram = channel === "telegram" || channel === "both";
  const hasEmail =
    typeof profile.email === "string" && profile.email.trim() !== "";
  const hasTelegram =
    typeof profile.telegramChatId === "string" &&
    profile.telegramChatId.trim() !== "";

  return {
    email: wantsEmail && hasEmail && profile.emailUnsubscribed !== true,
    telegram: wantsTelegram && hasTelegram,
    channel,
  };
}

// ---- Tope diario y selección ----

export interface DeliverySelectionInput {
  /** "none" | "daily_digest" | "realtime". */
  mode: AutoAlertsMode;
  /** Tope de avisos del plan (`autoAlertsMaxPerDay`). */
  maxPerDay: number;
  /** Filas ya enviadas hoy (UTC) a este usuario. */
  sentToday: number;
}

/**
 * Elige qué avisos se envían ahora.
 *
 * - `daily_digest` (Pro): un solo resumen por día. Si ya se envió algo hoy,
 *   el resto espera al día siguiente (el tope de Pro es 1/día, y cuenta como
 *   resumen, no como aviso individual).
 * - `realtime` (Elite): hasta `maxPerDay - sentToday`, priorizando la mayor
 *   relevancia. Un tope inválido o 0 no envía nada.
 */
export function selectPortfolioDeliveries<T extends PortfolioAlertItem>(
  items: readonly T[],
  input: DeliverySelectionInput,
): T[] {
  if (input.mode === "none") return [];
  if (items.length === 0) return [];

  const sorted = sortByRelevance(items);
  const max = Number.isFinite(input.maxPerDay) ? Math.max(0, Math.floor(input.maxPerDay)) : 0;
  const sent = Number.isFinite(input.sentToday) ? Math.max(0, Math.floor(input.sentToday)) : 0;

  if (input.mode === "daily_digest") {
    return sent > 0 ? [] : sorted;
  }

  const remaining = max - sent;
  if (remaining <= 0) return [];
  return sorted.slice(0, remaining);
}

/** Relevancia descendente y desempate estable (fecha y símbolo). */
export function sortByRelevance<T extends PortfolioAlertItem>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) =>
      b.relevance - a.relevance ||
      (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") ||
      a.symbol.localeCompare(b.symbol),
  );
}

// ---- Textos ----

/** "23,4%" / "30%": porcentaje de cartera con coma decimal, sin montos. */
export function formatExposure(pct: number): string {
  if (!Number.isFinite(pct) || pct <= 0) return "0%";
  const rounded = Math.round(pct * 10) / 10;
  const text = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(1).replace(".", ",");
  return `${text}%`;
}

/** Etiqueta en español de la relación noticia → cartera. */
export function relationLabel(relation: NewsRelation): string {
  switch (relation) {
    case "direct":
      return "Directa";
    case "sector":
      return "Sector";
    case "supplier":
      return "Proveedor";
    case "competitor":
      return "Competidor";
    case "macro":
      return "Macro";
  }
}

/** Asunto del correo: uno por aviso en tiempo real, uno por resumen. */
export function portfolioAlertSubject(items: readonly PortfolioAlertItem[]): string {
  if (items.length !== 1) return PORTFOLIO_NEWS_SUBJECT;
  const item = items[0];
  const title = item.title.trim().slice(0, 90);
  return `reclu.cl — ${item.symbol}: ${title}`;
}

/** Texto de Telegram (parse_mode HTML). Nunca incluye montos. */
export function renderPortfolioAlertTelegram(items: readonly PortfolioAlertItem[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) {
    const item = items[0];
    return [
      `<b>${escapeHtml(item.symbol)}</b> · ${formatExposure(item.exposurePct)} de tu cartera`,
      escapeHtml(item.title),
      `<a href="${escapeAttr(item.url)}">Ver la fuente</a>`,
      `<i>${escapeHtml(PORTFOLIO_NEWS_DISCLAIMER)}</i>`,
    ].join("\n");
  }

  const lines = items.map(
    (item) =>
      `• <b>${escapeHtml(item.symbol)}</b> (${formatExposure(item.exposurePct)}) ` +
      `<a href="${escapeAttr(item.url)}">${escapeHtml(item.title)}</a>`,
  );
  return [
    "<b>Noticias que tocan tu cartera</b>",
    ...lines,
    `<i>${escapeHtml(PORTFOLIO_NEWS_DISCLAIMER)}</i>`,
  ].join("\n");
}

interface EmailRenderInput {
  items: readonly PortfolioAlertItem[];
  siteUrl: string;
  name?: string | null;
  unsubscribeUrl?: string | null;
}

/**
 * Correo de alerta: blanco, filetes de 1px, cero sombras y píldora negra
 * (docs/hermes-diseno.md). Un solo aviso o el resumen diario de varios.
 */
export function renderPortfolioAlertEmail(input: EmailRenderInput): string {
  const { items, siteUrl } = input;
  if (items.length === 0) return "";

  const base = siteUrl.replace(/\/+$/, "");
  const name = input.name?.trim();
  const heading =
    items.length === 1 ? "Una noticia toca tu cartera" : "Noticias que tocan tu cartera";
  const lede = name
    ? `${escapeHtml(name)}, esto es lo que cruza con tus posiciones.`
    : "Esto es lo que cruza con tus posiciones.";

  const rows = items
    .map((item) => {
      const meta = `${escapeHtml(item.symbol)} · ${formatExposure(item.exposurePct)} de tu cartera · ${escapeHtml(relationLabel(item.relation))}`;
      return `<div style="padding:16px 0;border-top:1px solid #e6e6e6;">
        <p style="margin:0 0 6px;font-size:12px;line-height:1.4;color:#6b6b6b;">${meta}</p>
        <p style="margin:0 0 10px;font-size:16px;font-weight:500;letter-spacing:-0.03em;line-height:1.3;color:#0a0a0a;">${escapeHtml(item.title)}</p>
        <a href="${escapeAttr(item.url)}" style="font-size:14px;line-height:1.4;color:#0a0a0a;text-decoration:underline;">Ver la fuente</a>
      </div>`;
    })
    .join("");

  const manage = input.unsubscribeUrl
    ? ` · <a href="${escapeAttr(input.unsubscribeUrl)}" style="color:#0a0a0a;text-decoration:none;">Dejar de recibir estos correos</a>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&display=swap">
</head>
<body style="margin:0;padding:0;background:#ffffff;color:#0a0a0a;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <p style="margin:0 0 24px;font-size:18px;font-weight:600;letter-spacing:-0.04em;line-height:1;color:#0a0a0a;">reclu</p>
    <div style="background:#ffffff;border:1px solid #e6e6e6;border-radius:0;box-shadow:none;padding:24px;">
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;letter-spacing:-0.03em;line-height:1.2;color:#0a0a0a;">${heading}</h1>
      <p style="margin:0;font-size:15px;line-height:1.5;color:#6b6b6b;">${lede}</p>
      ${rows}
      <a href="${escapeAttr(`${base}/mi-portafolio`)}" style="display:inline-block;margin-top:24px;background:#0a0a0a;color:#ffffff;text-decoration:none;font-size:15px;font-weight:500;line-height:1;padding:14px 22px;border-radius:999px;">Ver mi cartera</a>
    </div>
    <p style="margin:24px 0 0;font-size:11px;line-height:1.6;color:#6b6b6b;">
      ${escapeHtml(PORTFOLIO_NEWS_DISCLAIMER)}
      <a href="${escapeAttr(`${base}/settings`)}" style="color:#0a0a0a;text-decoration:none;">Administrar alertas</a>${manage}
    </p>
  </div>
</body>
</html>`;
}

// ---- Helpers ----

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Igual que escapeHtml, pero válido dentro de un atributo href. */
function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
