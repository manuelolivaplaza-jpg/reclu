/**
 * Redactor del newsletter semanal.
 *
 * `composeWeekly(alertsDeLaSemana)` elige los cinco movimientos de mayor
 * variación, arma el texto con la fuente de cada uno y devuelve un borrador
 * de canal `newsletter` listo para insertar en `publish_drafts`. No envía ni
 * publica nada: Manu lo revisa y aprueba en /admin/publicaciones.
 *
 * Función pura: no lee entorno, no consulta Supabase y no llama a Resend.
 * No recomienda comprar ni vender. InfoProbidad se trata como agregado y
 * nunca se usan títulos que puedan nombrar personas.
 */

import type { Alert } from "@/lib/types";
import {
  formatChileStamp,
  lagDays,
  publishedAtFromPayload,
} from "@/lib/disclosure-lag";
import { PUBLISH_DISCLAIMER, draftLink } from "./compose";
import type { Channel } from "./types";

const NEWSLETTER_CHANNEL: Channel = "newsletter";
const DEFAULT_MAX_ITEMS = 5;
const MAX_ITEMS = 10;
const INFOPROBIDAD_SLUG = "infoProbidad-cl";
const INFOPROBIDAD_SOURCE = "infoprobidad";

/** Alerta con los datos de portafolio que necesita el redactor. */
export type WeeklyAlert = Omit<Alert, "portfolio"> & {
  portfolio?: {
    id: string;
    slug: string;
    name: string;
    source?: string | null;
  } | null;
};

/** Borrador listo para `publish_drafts`. Todavía no tiene id ni aprobación. */
export interface WeeklyDraft {
  channel: "newsletter";
  status: "draft";
  body: string;
  payload: {
    subject: string;
    week_start: string;
    week_end: string;
    alert_ids: string[];
    positions: number;
  };
  source_alert_id: string | null;
}

export interface ComposeWeeklyOptions {
  /** Fecha de referencia para el rango de la semana. Por defecto, hoy. */
  now?: Date;
  /** Cuántos movimientos incluir (1–10). Por defecto, 5. */
  maxItems?: number;
}

function clampItems(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_MAX_ITEMS;
  return Math.min(MAX_ITEMS, Math.max(1, Math.floor(value)));
}

function payloadString(payload: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function payloadNumber(payload: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function deltaOf(alert: WeeklyAlert): number {
  const direct = payloadNumber(alert.payload, ["delta"]);
  if (direct !== null) return direct;
  const weight = payloadNumber(alert.payload, ["weight", "current_weight"]);
  const previous = payloadNumber(alert.payload, ["previous_weight"]);
  if (weight !== null && previous !== null) return weight - previous;
  return 0;
}

function severityRank(alert: WeeklyAlert): number {
  if (alert.severity === "high") return 3;
  if (alert.severity === "medium") return 2;
  return 1;
}

function isInfoprobidad(alert: WeeklyAlert): boolean {
  const source = (alert.portfolio?.source ?? "").trim().toLowerCase();
  return source === INFOPROBIDAD_SOURCE || alert.portfolio?.slug === INFOPROBIDAD_SLUG;
}

function timeOf(alert: WeeklyAlert): number {
  const parsed = Date.parse(alert.created_at);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Orden: mayor variación absoluta, luego severidad y luego más reciente.
 * Así el top 5 muestra los cambios de peso que importan, no el ruido.
 */
function rank(alerts: readonly WeeklyAlert[]): WeeklyAlert[] {
  return [...alerts].sort((a, b) => {
    const delta = Math.abs(deltaOf(b)) - Math.abs(deltaOf(a));
    if (delta !== 0) return delta;
    const severity = severityRank(b) - severityRank(a);
    if (severity !== 0) return severity;
    return timeOf(b) - timeOf(a);
  });
}

function pct(value: number): string {
  return new Intl.NumberFormat("es-CL", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

function movementLine(alert: WeeklyAlert): string {
  if (isInfoprobidad(alert)) {
    const authorities = payloadNumber(alert.payload, ["autoridades", "authorities", "declarantes"]);
    const company = payloadString(alert.payload, ["nombre", "empresa", "company"]);
    const head = company
      ? `${company}: movimiento en el agregado InfoProbidad`
      : "Movimiento en el agregado InfoProbidad";
    const detail =
      authorities !== null
        ? `${authorities} ${authorities === 1 ? "autoridad declara" : "autoridades declaran"} acciones.`
        : "Datos agregados, sin nombres.";
    return `${head}. ${detail}`;
  }

  const symbol = payloadString(alert.payload, ["symbol", "ticker"]);
  const weight = payloadNumber(alert.payload, ["weight", "current_weight"]);
  const previous = payloadNumber(alert.payload, ["previous_weight"]);
  const delta = deltaOf(alert);

  const head = symbol ? symbol.toUpperCase() : alert.title.trim() || "Movimiento";
  const portfolio = alert.portfolio?.name ? ` · ${alert.portfolio.name}` : "";

  if (previous === null && weight !== null) {
    return `${head}${portfolio} — nueva posición de ${pct(weight)} %.`;
  }
  if (weight !== null) {
    const sign = delta > 0 ? "+" : "";
    return `${head}${portfolio} — ${sign}${pct(delta)} pp (ahora ${pct(weight)} %).`;
  }
  return `${head}${portfolio}.`;
}

function sourceLine(alert: WeeklyAlert): string {
  const payloadUrl = payloadString(alert.payload, ["source_url"]);
  const link = alert.portfolio?.slug
    ? draftLink(alert.portfolio.slug, NEWSLETTER_CHANNEL)
    : null;
  const url = payloadUrl ?? link;
  const source = (alert.portfolio?.source ?? "").trim();

  if (url && source) return `   Fuente: ${source} · ${url}`;
  if (url) return `   Fuente: ${url}`;
  if (source) return `   Fuente: ${source}`;
  return "   Fuente: fraccion.si (información pública)";
}

function disclosureLine(alert: WeeklyAlert): string | null {
  const published = publishedAtFromPayload(alert.payload);
  const stamp = published ? formatChileStamp(published) : null;
  if (!stamp) return null;
  const lag = lagDays(alert.payload);
  const lagText =
    lag === null
      ? ""
      : lag === 0
        ? " · el mismo día de la operación"
        : ` · ${Math.abs(lag)} ${Math.abs(lag) === 1 ? "día" : "días"} después de la operación`;
  const time = stamp.time ? ` ${stamp.time}` : "";
  return `   Divulgado: ${stamp.date}${time} hora de Chile${lagText}`;
}

/**
 * Rango de siete días que termina en `now`, en fechas de Chile.
 * No depende de la zona horaria del servidor.
 */
function weekRange(now: Date): { start: string; end: string } {
  const end = Number.isFinite(now.getTime()) ? now : new Date();
  const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);

  const format = (date: Date) =>
    new Intl.DateTimeFormat("es-CL", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "America/Santiago",
    })
      .format(date)
      .replace(/\s+/g, " ");

  return { start: format(start), end: format(end) };
}

function subjectFor(range: { start: string; end: string }, count: number): string {
  if (count === 0) return `Newsletter semanal · ${range.start} – ${range.end}`;
  return `Los ${count} movimientos de la semana · ${range.start} – ${range.end}`;
}

/**
 * Arma el borrador semanal. Con la lista vacía devuelve un texto breve que
 * también hay que aprobar (nunca se envía solo).
 */
export function composeWeekly(
  alertsDeLaSemana: readonly WeeklyAlert[],
  options: ComposeWeeklyOptions = {},
): WeeklyDraft {
  const maxItems = clampItems(options.maxItems);
  const range = weekRange(options.now ?? new Date());
  const selected = rank(alertsDeLaSemana).slice(0, maxItems);
  const subject = subjectFor(range, selected.length);

  const intro =
    selected.length === 0
      ? `Esta semana no hubo movimientos que superaran el umbral de fraccion.si (${range.start} – ${range.end}).`
      : `Los ${selected.length} movimientos de mayor variación de peso entre el ${range.start} y el ${range.end}.`;

  const blocks = selected.map((alert, index) => {
    const lines = [`${index + 1}. ${movementLine(alert)}`, sourceLine(alert)];
    const disclosure = disclosureLine(alert);
    if (disclosure) lines.push(disclosure);
    return lines.join("\n");
  });

  const footer = [
    "Los datos vienen de divulgaciones públicas y pueden llegar con atraso.",
    "Este correo es informativo y no constituye asesoría de inversión.",
    PUBLISH_DISCLAIMER,
  ].join("\n");

  const body = [intro, ...blocks, footer].join("\n\n").trim();

  return {
    channel: "newsletter",
    status: "draft",
    body,
    payload: {
      subject,
      week_start: range.start,
      week_end: range.end,
      alert_ids: selected.map((alert) => alert.id),
      positions: selected.length,
    },
    source_alert_id: selected[0]?.id ?? null,
  };
}
