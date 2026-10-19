/**
 * Reglas de alerta a medida (F39).
 * El tope free/pro está duplicado en supabase/migrations/037_reglas_alerta.sql
 * porque Postgres no puede importar este módulo. Si cambias un número, cambia ambos.
 */
import { z } from "zod";
import { isTrialPro } from "@/lib/plans";

export const ALERT_RULE_KINDS = ["ticker", "portfolio", "source", "min_amount"] as const;
export type AlertRuleKind = (typeof ALERT_RULE_KINDS)[number];

export const ALERT_RULE_CHANNELS = ["email", "telegram", "both"] as const;
export type AlertRuleChannel = (typeof ALERT_RULE_CHANNELS)[number];

/** Tope de filas por usuario. Elite usa el mismo tope que Pro. */
export const ALERT_RULE_LIMIT_FREE = 3;
export const ALERT_RULE_LIMIT_PAID = 50;

const KIND_MESSAGES = "Tipo de regla inválido.";
const CHANNEL_MESSAGE = "Canal inválido.";

const channelSchema = z.enum(ALERT_RULE_CHANNELS, { error: CHANNEL_MESSAGE });

const tickerValue = z
  .string()
  .trim()
  .min(1, "Símbolo inválido.")
  .max(20, "Símbolo inválido.")
  .regex(/^[A-Za-z0-9.\-]+$/, "Símbolo inválido.")
  .transform((value) => value.toUpperCase());

const portfolioValue = z
  .string()
  .trim()
  .min(2, "Nombre de portafolio inválido.")
  .max(80, "Nombre de portafolio inválido.")
  .regex(/^[\p{L}\p{N} .'\-]+$/u, "Nombre de portafolio inválido.")
  .transform((value) => value.replace(/\s+/g, " "));

const sourceValue = z
  .string()
  .trim()
  .min(2, "Fuente inválida.")
  .max(40, "Fuente inválida.")
  .regex(/^[A-Za-z0-9_\-]+$/, "Fuente inválida.")
  .transform((value) => value.toLowerCase());

const amountValue = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, "Monto inválido.")
  .refine((value) => Number(value) > 0, { message: "El monto debe ser mayor que cero." })
  .transform((value) => String(Number(value)));

/** Entrada del formulario de crear regla. Normaliza símbolo, fuente y monto. */
export const alertRuleInputSchema = z.discriminatedUnion(
  "kind",
  [
    z.object({ kind: z.literal("ticker"), value: tickerValue, channel: channelSchema.default("email") }),
    z.object({ kind: z.literal("portfolio"), value: portfolioValue, channel: channelSchema.default("email") }),
    z.object({ kind: z.literal("source"), value: sourceValue, channel: channelSchema.default("email") }),
    z.object({ kind: z.literal("min_amount"), value: amountValue, channel: channelSchema.default("email") }),
  ],
  { error: KIND_MESSAGES },
);

export interface AlertRule {
  kind: AlertRuleKind;
  value: string;
  channel?: AlertRuleChannel;
  /** false = la regla no dispara. undefined se trata como activa. */
  active?: boolean;
}

export interface AlertRuleView {
  id: string;
  kind: AlertRuleKind;
  value: string;
  channel: AlertRuleChannel;
  active: boolean;
}

/**
 * Alerta mínima para comparar. `portfolio.source` lo agrega quien llama
 * (el tipo Alert del feed no trae la fuente). Los montos salen del payload
 * (`value_usd`, `amount_usd`, `amount`, `amount_min`/`amount_max`) o,
 * si no hay cifra, del rango en el título (`$1M–$5M`).
 */
export interface AlertMatchInput {
  portfolio_id?: string | null;
  title?: string | null;
  payload?: Record<string, unknown> | null;
  portfolio?: {
    id?: string;
    slug?: string | null;
    name?: string | null;
    source?: string | null;
    manager?: string | null;
  } | null;
}

export function isAlertRuleKind(value: unknown): value is AlertRuleKind {
  return typeof value === "string" && (ALERT_RULE_KINDS as readonly string[]).includes(value);
}

export function isAlertRuleChannel(value: unknown): value is AlertRuleChannel {
  return typeof value === "string" && (ALERT_RULE_CHANNELS as readonly string[]).includes(value);
}

/** Tope según plan. La prueba vigente de Pro usa el tope de pago. */
export function alertRuleLimitFor(
  plan?: string | null,
  trialEndsAt?: string | null,
  now: number = Date.now(),
): number {
  if (plan === "pro" || plan === "elite") return ALERT_RULE_LIMIT_PAID;
  if (isTrialPro(plan, trialEndsAt, now)) return ALERT_RULE_LIMIT_PAID;
  return ALERT_RULE_LIMIT_FREE;
}

/** Filas crudas de `alert_rules` → vista segura para la UI. */
export function parseAlertRuleRows(rows: unknown): AlertRuleView[] {
  if (!Array.isArray(rows)) return [];
  const views: AlertRuleView[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    if (typeof record.id !== "string" || record.id.length === 0) continue;
    if (!isAlertRuleKind(record.kind)) continue;
    if (!isAlertRuleChannel(record.channel)) continue;
    if (typeof record.value !== "string" || record.value.trim().length === 0) continue;
    views.push({
      id: record.id,
      kind: record.kind,
      value: record.value,
      channel: record.channel,
      active: record.active !== false,
    });
  }
  return views;
}

export function alertRuleKindLabel(kind: AlertRuleKind): string {
  switch (kind) {
    case "ticker":
      return "Símbolo";
    case "portfolio":
      return "Portafolio";
    case "source":
      return "Fuente";
    case "min_amount":
      return "Monto mínimo";
  }
}

export function alertRuleChannelLabel(channel: AlertRuleChannel): string {
  switch (channel) {
    case "email":
      return "Correo";
    case "telegram":
      return "Telegram";
    case "both":
      return "Correo y Telegram";
  }
}

/** Monto de regla en dólares, con separador de miles. US$1.000.000 */
export function formatRuleAmount(value: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  const rounded = Math.round(amount);
  const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return "US$" + digits;
}

export function formatRuleValue(kind: AlertRuleKind, value: string): string {
  if (kind === "min_amount") return formatRuleAmount(value);
  return value;
}

/** Mensaje en español para el raise de la 037 o un unique violation. */
export function friendlyAlertRuleDbError(message: string, code?: string): string | null {
  if (code === "23505") return "Ya tienes una regla igual.";
  const text = message.toLowerCase();
  if (text.includes("duplicate") || text.includes("unique") || text.includes("idx_alert_rules")) {
    return "Ya tienes una regla igual.";
  }
  if (text.includes("límite") || text.includes("limite")) {
    return "Alcanzaste el límite de reglas de alerta de tu plan.";
  }
  if (text.includes("telegram")) {
    return "Telegram está disponible en Pro, Elite y durante la prueba.";
  }
  if (text.includes("propia cuenta")) {
    return "Solo puedes crear reglas con tu propia cuenta.";
  }
  if (text.includes("no encontramos tu perfil")) {
    return "No encontramos tu perfil.";
  }
  if (text.includes("valor de regla")) {
    return "El valor de la regla no es válido.";
  }
  return null;
}

/**
 * ¿Esta regla aplica a esta alerta?
 * Comparación pura: no consulta la base ni el canal (el canal es solo entrega).
 * `min_amount` es inclusivo: US$1.000.000 dispara a partir de ese monto.
 * Una regla con `active: false` no dispara.
 */
export function ruleMatches(rule: AlertRule, alert: AlertMatchInput): boolean {
  if (rule.active === false) return false;
  const value = rule.value.trim();
  if (!value) return false;

  switch (rule.kind) {
    case "ticker":
      return tickerCandidates(alert).includes(value.toUpperCase());
    case "portfolio":
      return portfolioCandidates(alert).some((field) => portfolioFieldMatches(value, field));
    case "source":
      return sourceCandidates(alert).includes(value.toLowerCase());
    case "min_amount": {
      const threshold = Number(value);
      if (!Number.isFinite(threshold) || threshold <= 0) return false;
      const amount = disclosedAmountUsd(alert);
      return amount != null && amount >= threshold;
    }
    default:
      return false;
  }
}

function fold(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function tokens(value: string): string[] {
  return fold(value).split(/[^a-z0-9]+/).filter((token) => token.length > 0);
}

function portfolioFieldMatches(needleRaw: string, field: string): boolean {
  const needle = fold(needleRaw);
  const haystack = fold(field);
  if (!needle || !haystack) return false;
  if (haystack === needle) return true;

  const needleTokens = tokens(needle);
  if (needleTokens.length === 0) return false;
  const haystackTokens = new Set(tokens(haystack));
  if (needleTokens.length === 1) {
    const token = needleTokens[0] ?? "";
    return token.length >= 3 && haystackTokens.has(token);
  }
  return needleTokens.every((token) => token.length >= 2 && haystackTokens.has(token));
}

function pushString(out: string[], value: unknown, normalize: (value: string) => string) {
  if (typeof value === "string" && value.trim().length > 0) out.push(normalize(value));
}

function tickerCandidates(alert: AlertMatchInput): string[] {
  const out: string[] = [];
  const upper = (value: string) => value.trim().toUpperCase();
  const payload = alert.payload ?? {};
  pushString(out, payload.symbol, upper);
  pushString(out, payload.ticker, upper);
  if (Array.isArray(payload.symbols)) {
    for (const symbol of payload.symbols) pushString(out, symbol, upper);
  }
  return out;
}

function portfolioCandidates(alert: AlertMatchInput): string[] {
  const out: string[] = [];
  const asIs = (value: string) => value;
  pushString(out, alert.portfolio_id, asIs);
  pushString(out, alert.portfolio?.id, asIs);
  pushString(out, alert.portfolio?.slug, asIs);
  pushString(out, alert.portfolio?.name, asIs);
  pushString(out, alert.portfolio?.manager, asIs);
  const payload = alert.payload ?? {};
  pushString(out, payload.owner_name, asIs);
  pushString(out, payload.manager, asIs);
  pushString(out, payload.portfolio, asIs);
  pushString(out, payload.portfolio_slug, asIs);
  pushString(out, payload.portfolio_name, asIs);
  if (Array.isArray(payload.portfolios)) {
    for (const item of payload.portfolios) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      pushString(out, row.portfolio_id, asIs);
      pushString(out, row.slug, asIs);
      pushString(out, row.name, asIs);
      pushString(out, row.manager, asIs);
    }
  }
  return out;
}

function sourceCandidates(alert: AlertMatchInput): string[] {
  const out: string[] = [];
  const lower = (value: string) => value.trim().toLowerCase();
  pushString(out, alert.portfolio?.source, lower);
  const payload = alert.payload ?? {};
  pushString(out, payload.source, lower);
  pushString(out, payload.source_id, lower);
  return out;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** Mayor cifra en dólares encontrada en un texto tipo "$1M–$5M" o "US$1.000.000". */
function maxUsdInText(text: string): number | null {
  const moneyPattern =
    /(?:us\$|\$)\s*(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)(?:\s*([kmb]))?/gi;
  let best: number | null = null;
  for (const match of text.matchAll(moneyPattern)) {
    const parsed = parseMoneyToken(match[1] ?? "", match[2]);
    if (parsed != null && (best == null || parsed > best)) best = parsed;
  }
  return best;
}

function parseMoneyToken(raw: string, suffix: string | undefined): number | null {
  const mark = suffix?.toLowerCase();
  let amount: number;
  if (mark === "k" || mark === "m" || mark === "b") {
    amount = Number(raw.replace(",", "."));
    const factor = mark === "k" ? 1_000 : mark === "m" ? 1_000_000 : 1_000_000_000;
    amount *= factor;
  } else if (/^\d{1,3}(?:[.,]\d{3})+$/.test(raw)) {
    amount = Number(raw.replace(/[.,]/g, ""));
  } else {
    amount = Number(raw.replace(",", "."));
  }
  return Number.isFinite(amount) ? amount : null;
}

function disclosedAmountUsd(alert: AlertMatchInput): number | null {
  const payload = alert.payload ?? {};
  for (const key of ["value_usd", "amount_usd", "notional_usd", "amount"] as const) {
    const amount = readNumber(payload[key]);
    if (amount != null) return amount;
  }
  const max = readNumber(payload.amount_max);
  if (max != null) return max;
  const min = readNumber(payload.amount_min);
  if (min != null) return min;

  const texts: string[] = [];
  if (typeof alert.title === "string") texts.push(alert.title);
  for (const key of ["amount_text", "range", "amount_range"] as const) {
    const value = payload[key];
    if (typeof value === "string") texts.push(value);
  }
  let best: number | null = null;
  for (const text of texts) {
    const amount = maxUsdInText(text);
    if (amount != null && (best == null || amount > best)) best = amount;
  }
  return best;
}
