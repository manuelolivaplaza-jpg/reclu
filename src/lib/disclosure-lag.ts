/**
 * STOCK Act y filings: días entre la operación y su publicación.
 * Acepta tres convenciones de payload:
 *  - Políticos PTR:  tx_date + disclosed
 *  - Fondos 13F:     traded_at + filed_at
 *  - OGE 278-T (F13): trans_date + report_published
 * Una fecha sola (YYYY-MM-DD) se lee como ese día de calendario.
 * Un instante con hora se lleva a America/Santiago antes de contar días
 * o de mostrarlo. Si falta un par válido, null: no se inventa un atraso.
 */

const CHILE_TZ = "America/Santiago";
const TX_KEYS = ["tx_date", "traded_at", "trans_date"] as const;
const PUBLISHED_KEYS = ["disclosed", "report_published", "filed_at"] as const;

function firstString(
  payload: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

function asPayload(payload: Record<string, unknown> | null | undefined): Record<string, unknown> {
  return payload && typeof payload === "object" ? payload : {};
}

/** La cadena trae reloj (no es solo un día de calendario). */
export function hasClockTime(iso: string): boolean {
  return /(?:T|\s)\d{2}:\d{2}/.test(iso);
}

/** YYYY-MM-DD real, o null si el día no existe (p. ej. 2024-02-31). */
function validYmd(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const utc = Date.UTC(year, month - 1, day);
  const check = new Date(utc);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function ymdFromPrefix(iso: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!match) return null;
  return validYmd(Number(match[1]), Number(match[2]), Number(match[3]));
}

/**
 * Día de calendario YYYY-MM-DD.
 * Sin hora: el día escrito. Con hora: ese instante en America/Santiago.
 */
export function chileCalendarDay(iso: string): string | null {
  if (typeof iso !== "string") return null;
  const trimmed = iso.trim();
  if (!hasClockTime(trimmed)) return ymdFromPrefix(trimmed);
  const time = Date.parse(trimmed);
  if (!Number.isFinite(time)) return ymdFromPrefix(trimmed);
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: CHILE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(time));
  return ymdFromPrefix(formatted);
}

/** Día de calendario como número de días UTC, para restar atrasos. */
function calendarDayNumber(iso: string): number | null {
  const ymd = chileCalendarDay(iso);
  if (!ymd) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return null;
  return Math.round(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000);
}

export interface ChileStamp {
  /** DD-MM-YYYY en hora de Chile (o el día escrito, si no había reloj). */
  date: string;
  /** HH:mm en hora de Chile. null si la fuente no trae hora. */
  time: string | null;
}

function twoDigits(value: string | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 0) return null;
  return digits.padStart(2, "0").slice(-2);
}

/** Fecha (y hora, si existe) lista para la UI. La hora ya está en Chile. */
export function formatChileStamp(iso: string): ChileStamp | null {
  const day = chileCalendarDay(iso);
  if (!day) return null;
  const [year, month, date] = day.split("-");
  const label = `${date}-${month}-${year}`;
  if (!hasClockTime(iso)) return { date: label, time: null };
  const time = Date.parse(iso.trim());
  if (!Number.isFinite(time)) return { date: label, time: null };
  const parts = new Intl.DateTimeFormat("es-CL", {
    timeZone: CHILE_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(time));
  const hour = twoDigits(parts.find((part) => part.type === "hour")?.value);
  const minute = twoDigits(parts.find((part) => part.type === "minute")?.value);
  if (!hour || !minute) return { date: label, time: null };
  return { date: label, time: `${hour}:${minute}` };
}

/** Fecha de publicación del payload: disclosed, report_published o filed_at. */
export function publishedAtFromPayload(
  payload: Record<string, unknown> | null | undefined,
): string | null {
  return firstString(asPayload(payload), PUBLISHED_KEYS);
}

/**
 * Días de calendario entre la operación y la publicación.
 * Positivo = la publicación es posterior. null si falta una fecha o no parsea.
 */
export function lagDays(payload: Record<string, unknown> | null | undefined): number | null {
  const source = asPayload(payload);
  const tx = firstString(source, TX_KEYS);
  const disclosed = firstString(source, PUBLISHED_KEYS);
  if (!tx || !disclosed) return null;
  const txDay = calendarDayNumber(tx);
  const disclosedDay = calendarDayNumber(disclosed);
  if (txDay === null || disclosedDay === null) return null;
  return disclosedDay - txDay;
}

export function disclosureLagLabel(payload: Record<string, unknown>): string | null {
  const days = lagDays(payload);
  if (days === null) return null;
  return `Declarado ${days} días después de la operación`;
}

function lagPhrase(days: number): string {
  if (days === 0) return "el mismo día de la operación";
  const count = Math.abs(days);
  const unit = count === 1 ? "día" : "días";
  return days > 0
    ? `${count} ${unit} después de la operación`
    : `${count} ${unit} antes de la operación`;
}

export interface LagBadgeInput {
  publishedAt?: string | null;
  /** Instante en que Reclu registró la alerta, si la publicación oficial no trae hora. */
  recordedAt?: string | null;
  lagDays?: number | null;
}

/**
 * "Publicado 08-10-2026 · 48 días después de la operación".
 * Si hay reloj, queda "… HH:mm hora de Chile". null si no hay nada que mostrar.
 */
export function formatLagBadge(input: LagBadgeInput): string | null {
  const published = input.publishedAt ? formatChileStamp(input.publishedAt) : null;
  const recorded = input.recordedAt ? formatChileStamp(input.recordedAt) : null;
  const lag =
    typeof input.lagDays === "number" && Number.isFinite(input.lagDays)
      ? lagPhrase(input.lagDays)
      : null;

  if (!published && !recorded && !lag) return null;

  const parts: string[] = [];
  if (published) {
    const sameDayClock =
      !published.time && recorded?.time && recorded.date === published.date ? recorded.time : null;
    const clock = published.time ?? sameDayClock;
    parts.push(
      clock ? `Publicado ${published.date} ${clock} hora de Chile` : `Publicado ${published.date}`,
    );
  } else if (recorded) {
    parts.push(
      recorded.time
        ? `Publicado ${recorded.date} ${recorded.time} hora de Chile`
        : `Publicado ${recorded.date}`,
    );
  }

  if (lag) parts.push(lag);

  if (published && !published.time && recorded?.time && recorded.date !== published.date) {
    parts.push(`registrada ${recorded.date} ${recorded.time} hora de Chile`);
  }

  return parts.join(" · ");
}

export interface DisclosureStamp {
  publishedAt: string;
  recordedAt: string | null;
  lagDays: number | null;
}

/**
 * Publicación más reciente entre alertas de un portafolio.
 * Solo cuenta una fecha oficial (disclosed, report_published o filed_at).
 */
export function latestDisclosureStamp(
  items: readonly { payload?: Record<string, unknown> | null; created_at?: string | null }[],
): DisclosureStamp | null {
  let best: DisclosureStamp | null = null;
  for (const item of items) {
    const publishedAt = publishedAtFromPayload(item.payload);
    if (!publishedAt || !chileCalendarDay(publishedAt)) continue;
    const recordedAt = typeof item.created_at === "string" && item.created_at.trim() ? item.created_at : null;
    const stamp: DisclosureStamp = {
      publishedAt,
      recordedAt,
      lagDays: lagDays(item.payload),
    };
    if (!best || publishedAt > best.publishedAt) best = stamp;
  }
  return best;
}
