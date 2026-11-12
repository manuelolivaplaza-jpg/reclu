"use client";

import { compoundReturnPct } from "@/lib/returns";
import { cn } from "@/lib/utils";

/**
 * D8: períodos del gráfico de una tarjeta de portafolio.
 *
 * Todo se calcula sobre la serie real (`value_pct` = retorno acumulado en %).
 * Un período solo se habilita si la serie lo cubre de verdad: nunca se dibuja
 * ni se rotula una ventana inventada.
 */
export type PeriodKey = "1M" | "3M" | "6M" | "1A" | "MAX";

/** Días calendario de cada período (MAX = toda la serie). */
export const PERIOD_DAYS: Readonly<Record<Exclude<PeriodKey, "MAX">, number>> = {
  "1M": 30,
  "3M": 91,
  "6M": 182,
  "1A": 365,
};

/** Orden único de períodos: visual en el selector y de cálculo en la serie. */
const PERIOD_ORDER: readonly PeriodKey[] = ["1M", "3M", "6M", "1A", "MAX"];

/** Etiqueta visible (`Máx` para MAX, como en el resto del sitio). */
const PERIOD_LABEL: Record<PeriodKey, string> = {
  "1M": "1M",
  "3M": "3M",
  "6M": "6M",
  "1A": "1A",
  MAX: "Máx",
};

const DAY = 86_400_000;

/** Fecha `YYYY-MM-DD` o ISO -> epoch UTC (NaN si no es parseable). */
function dayTime(date: unknown): number {
  if (typeof date !== "string" || date.length < 10) return Number.NaN;
  const iso = date.includes("T") ? date : `${date.slice(0, 10)}T00:00:00Z`;
  return Date.parse(iso);
}

interface PctRow {
  date: string;
  value_pct: number;
}

/** Puntos válidos (fecha parseable + value_pct finito) en orden cronológico. */
function cleanRows(series: readonly { date: string; value_pct: number }[] | null | undefined): PctRow[] {
  if (!Array.isArray(series)) return [];
  const out: PctRow[] = [];
  for (const point of series) {
    if (!point || typeof point.date !== "string") continue;
    if (!Number.isFinite(dayTime(point.date))) continue;
    const value = Number(point.value_pct);
    if (!Number.isFinite(value)) continue;
    out.push({ date: point.date, value_pct: value });
  }
  return out.sort((a, b) => dayTime(a.date) - dayTime(b.date));
}

/**
 * Índice del punto base de una ventana de `days` días: el último punto con
 * fecha <= (última fecha − days), igual que `windowReturnPct` de
 * `src/lib/returns.ts`. Si la serie empieza dentro de la tolerancia, la base
 * es el primer punto real (la ventana cubierta completa).
 */
function baseIndexFor(rows: readonly PctRow[], days: number): number {
  if (rows.length === 0) return 0;
  const target = dayTime(rows[rows.length - 1].date) - days * DAY;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (dayTime(rows[i].date) <= target) return i;
  }
  return 0;
}

/**
 * Períodos que la serie cubre de verdad.
 *
 * - `< 2` puntos válidos => `[]`.
 * - `"1M" | "3M" | "6M" | "1A"`: el span real debe alcanzar
 *   `PERIOD_DAYS[k] − toleranceDays` y debe existir un punto de referencia
 *   con retorno compuesto calculable (misma regla que `returns.ts`).
 * - `"MAX"`: siempre que haya `>= 2` puntos válidos.
 *
 * Función pura: mismo `series` => mismo resultado.
 */
export function availablePeriods(
  series: readonly { date: string; value_pct: number }[],
  toleranceDays = 5,
): PeriodKey[] {
  const rows = cleanRows(series);
  if (rows.length < 2) return [];

  const spanDays = (dayTime(rows[rows.length - 1].date) - dayTime(rows[0].date)) / DAY;
  if (!Number.isFinite(spanDays) || spanDays < 0) return [];

  const out: PeriodKey[] = [];
  for (const key of PERIOD_ORDER) {
    if (key === "MAX") {
      out.push("MAX");
      continue;
    }
    const days = PERIOD_DAYS[key];
    if (spanDays < days - toleranceDays) continue;
    const base = rows[baseIndexFor(rows, days)];
    const last = rows[rows.length - 1];
    // Retorno compuesto real (base 1) con la fuente única del repo: null si
    // la base no es calculable (sin punto de referencia válido).
    if (compoundReturnPct(base.value_pct, last.value_pct) === null) continue;
    out.push(key);
  }
  return out;
}

/**
 * Período por defecto: 1 año si la serie lo cubre; si no, el más largo que sí
 * (MAX antes que 6M/3M/1M) para que el rótulo diga la verdad ("Desde inicio").
 */
export function defaultPeriod(available: readonly PeriodKey[]): PeriodKey | null {
  if (!Array.isArray(available) || available.length === 0) return null;
  const priority: readonly PeriodKey[] = ["1A", "MAX", "6M", "3M", "1M"];
  for (const key of priority) {
    if (available.includes(key)) return key;
  }
  return null;
}

/**
 * Selector segmentado de período: filete de 1px, radio 0, activo negro/blanco
 * invertido en modo oscuro. Los períodos sin datos quedan deshabilitados
 * (nunca se ofrece una ventana que no existe).
 */
export function PortfolioPeriodSelector({
  value,
  available,
  onChange,
}: {
  value: PeriodKey;
  available: readonly PeriodKey[];
  onChange: (p: PeriodKey) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Período del rendimiento"
      className="flex w-full min-w-0 overflow-hidden border border-ink-200 dark:border-white/20"
    >
      {PERIOD_ORDER.map((key) => {
        const enabled = available.includes(key);
        const active = enabled && key === value;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            aria-disabled={!enabled}
            disabled={!enabled}
            title={enabled ? undefined : "Sin datos suficientes para este período"}
            onClick={(event) => {
              // Dentro de una tarjeta clickeable: el clic no navega.
              event.stopPropagation();
              event.preventDefault();
              if (enabled) onChange(key);
            }}
            className={cn(
              "min-h-9 min-w-0 flex-1 border-l border-ink-200 px-1.5 text-[12px] leading-none tabular-nums transition-colors first:border-l-0 dark:border-white/20 sm:text-[13px]",
              "focus-visible:outline-1 focus-visible:-outline-offset-2 focus-visible:outline-current",
              active
                ? "bg-ink-900 font-medium text-white dark:bg-white dark:text-ink-900"
                : enabled
                  ? "text-ink-500 hover:text-ink-900 dark:text-white/60 dark:hover:text-white"
                  : "cursor-not-allowed text-ink-400 opacity-45 dark:text-white/25",
            )}
          >
            {PERIOD_LABEL[key]}
          </button>
        );
      })}
    </div>
  );
}
