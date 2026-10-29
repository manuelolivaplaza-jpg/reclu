import { brandUrl } from "@/lib/brand";
/**
 * Redactor de borradores a partir de una alerta publicada.
 *
 * Función pura: no lee entorno, no consulta Supabase y no envía nada.
 * El texto siempre lleva fecha, atraso de divulgación, enlace con UTM y el
 * aviso de que no es una recomendación de inversión.
 *
 * InfoProbidad se trata como agregado: nunca se copian el título ni el
 * resumen de la alerta (pueden nombrar personas) y solo se usa el nombre de
 * la empresa y el conteo de autoridades del payload.
 */

import type { Alert, Portfolio } from "@/lib/types";
import {
  formatChileStamp,
  lagDays,
  publishedAtFromPayload,
} from "@/lib/disclosure-lag";
import type { Channel } from "./types";
import { X_MAX_LENGTH, weightedLength } from "./x";

/** Aviso legal que debe aparecer en todos los canales. */
export const PUBLISH_DISCLAIMER = "No es recomendación de inversión.";

/** Dominio público usado en los enlaces de los borradores. */
export const PUBLISH_SITE = brandUrl();

const INFOPROBIDAD_SLUG = "infoProbidad-cl";
const INFOPROBIDAD_SOURCE = "infoprobidad";

/** Datos mínimos del portafolio que necesita el redactor. */
export type ComposePortfolio = Pick<Portfolio, "slug" | "name" | "source">;

function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function payloadString(
  payload: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return clean(value);
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

function payloadNumber(
  payload: Record<string, unknown>,
  keys: readonly string[],
): number | null {
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

/** Enlace público con UTM. El canal cambia solo el `utm_medium`. */
export function draftLink(slug: string, channel: Channel): string {
  const path = encodeURIComponent(slug);
  const params = new URLSearchParams({
    utm_source: "fraccion",
    utm_medium: channel,
    utm_campaign: "alertas",
  });
  return `${PUBLISH_SITE}/portfolio/${path}?${params.toString()}`;
}

function lagLabel(days: number | null): string {
  if (days === null) return "Atraso de divulgación no informado por la fuente";
  if (days === 0) return "Publicado el mismo día de la operación";
  const count = Math.abs(days);
  const unit = count === 1 ? "día" : "días";
  return days > 0
    ? `${count} ${unit} después de la operación`
    : `${count} ${unit} antes de la operación`;
}

function dateLabel(alert: Alert): string {
  const published = publishedAtFromPayload(alert.payload);
  const stamp =
    (published ? formatChileStamp(published) : null) ??
    formatChileStamp(alert.created_at);
  if (!stamp) return "Fecha no informada";
  return stamp.time ? `${stamp.date} ${stamp.time} hora de Chile` : stamp.date;
}

function isInfoprobidad(portfolio: ComposePortfolio): boolean {
  return (
    portfolio.source.trim().toLowerCase() === INFOPROBIDAD_SOURCE ||
    portfolio.slug === INFOPROBIDAD_SLUG
  );
}

/**
 * Cuerpo de InfoProbidad: solo empresa y conteo agregado.
 * Nunca usa `alert.title` ni `alert.summary`: pueden reidentificar personas.
 */
function infoprobidadBody(alert: Alert): string {
  const company = payloadString(alert.payload, ["nombre", "empresa", "company"]);
  const authorities = payloadNumber(alert.payload, [
    "autoridades",
    "authorities",
    "declarantes",
  ]);

  const subject = company
    ? `${company} aparece en el agregado de InfoProbidad`
    : "Nuevo movimiento en el agregado de InfoProbidad";
  const detail =
    authorities !== null
      ? `${authorities} ${authorities === 1 ? "autoridad declara" : "autoridades declaran"} acciones en la empresa.`
      : "El agregado no entrega el número de autoridades en esta corrida.";

  return `${subject}. ${detail} Datos agregados sin nombres.`;
}

/** Cuerpo general: título o resumen AI, sin inventar datos. */
function generalBody(alert: Alert): string {
  const text = clean(alert.summary) || clean(alert.title);
  return text || "Nueva alerta publicada en fraccion.si.";
}

function truncateToFit(text: string, budget: number): string {
  if (budget <= 0) return "";
  if (Array.from(text).length <= budget) return text;
  const cut = Array.from(text).slice(0, Math.max(0, budget - 1)).join("");
  const atSpace = cut.replace(/\s+\S*$/, "").trimEnd();
  const base = atSpace.length >= Math.floor(budget * 0.6) ? atSpace : cut.trimEnd();
  return `${base}…`;
}

/**
 * Redacta el borrador de una alerta para un canal.
 *
 * Pura: mismo input, mismo output. Para X recorta el cuerpo para no pasar
 * de 280 caracteres ponderados (cada URL pesa 23).
 */
export function composeFromAlert(
  alert: Alert,
  portfolio: ComposePortfolio,
  channel: Channel,
): string {
  const link = draftLink(portfolio.slug, channel);
  const date = dateLabel(alert);
  const lag = lagLabel(lagDays(alert.payload));

  const body = isInfoprobidad(portfolio)
    ? infoprobidadBody(alert)
    : generalBody(alert);

  const tail = `${date} · ${lag}\n${link}\n${PUBLISH_DISCLAIMER}`;

  if (channel !== "x") {
    return `${body}\n\n${tail}`;
  }

  const separator = "\n";
  const fixed = weightedLength(`${separator}${tail}`);
  const budget = Math.max(0, X_MAX_LENGTH - fixed);
  const head = truncateToFit(body, budget);
  return head ? `${head}${separator}${tail}` : tail;
}
