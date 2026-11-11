"use client";

import { useId, useMemo, useState } from "react";
import {
  PERIOD_DAYS,
  PortfolioPeriodSelector,
  availablePeriods,
  defaultPeriod,
  type PeriodKey,
} from "@/components/portfolio-period-selector";
import { rebaseToStart, returnSinceStart, type PctPoint } from "@/lib/returns";
import { cn, formatShortDate, formatSignedPct } from "@/lib/utils";

/**
 * D8: rendimiento de una tarjeta de portafolio.
 *
 * Cifra grande + trazo propio + selector de período, todo desde la serie real
 * (`value_pct` = retorno acumulado en %, base 1 = `1 + value_pct / 100`).
 * El retorno de la ventana se COMPONE con `src/lib/returns.ts` (nunca se
 * restan puntos porcentuales) y el trazo se rebasa a 0% al inicio de la
 * ventana. Sin serie suficiente no se renderiza nada: cero cifras inventadas.
 */

const DAY = 86_400_000;
const VB_W = 600;
const PAD_Y = 8;

const SHORT_MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2025-06-12" -> "jun 2025" (sin depender de la zona horaria). */
function monthYearLabel(date: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(date);
  if (!m) return date;
  const month = SHORT_MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${m[1]}` : date;
}

/** Fecha `YYYY-MM-DD` o ISO -> epoch UTC (NaN si no es parseable). */
function toTime(date: string): number {
  const iso = date.includes("T") ? date : `${date.slice(0, 10)}T00:00:00Z`;
  return Date.parse(iso);
}

/** Rótulo explícito del período activo (MAX se compone con la fecha real). */
const PERIOD_TEXT: Record<Exclude<PeriodKey, "MAX">, string> = {
  "1M": "1 mes",
  "3M": "3 meses",
  "6M": "6 meses",
  "1A": "1 año",
};

/**
 * Índice del punto base de la ventana: el último con fecha <= (última fecha −
 * days), la misma regla que `windowReturnPct` de `src/lib/returns.ts`. Si la
 * serie empieza dentro de la tolerancia, la base es el primer punto real.
 */
function windowStartIndex(points: readonly PctPoint[], days: number): number {
  if (points.length === 0) return 0;
  const target = toTime(points[points.length - 1].date) - days * DAY;
  for (let i = points.length - 1; i >= 0; i--) {
    if (toTime(points[i].date) <= target) return i;
  }
  return 0;
}

export function PortfolioCardChart({
  series,
  initialPeriod,
  height = 148,
}: {
  series: readonly { date: string; value_pct: number }[];
  initialPeriod?: PeriodKey;
  height?: number;
}) {
  const gradientId = `cardchart-${useId().replace(/:/g, "")}`;
  const [picked, setPicked] = useState<PeriodKey | null>(initialPeriod ?? null);

  const points = useMemo<PctPoint[]>(() => {
    const out: PctPoint[] = [];
    for (const point of series ?? []) {
      if (!point || typeof point.date !== "string") continue;
      const time = toTime(point.date);
      const value = Number(point.value_pct);
      if (!Number.isFinite(time) || !Number.isFinite(value)) continue;
      out.push({ date: point.date, value });
    }
    return out.sort((a, b) => toTime(a.date) - toTime(b.date));
  }, [series]);

  const available = useMemo(
    () => availablePeriods(points.map((point) => ({ date: point.date, value_pct: point.value }))),
    [points],
  );

  // El período activo se deriva: si deja de estar disponible (la serie cambió),
  // cae al período por defecto sin estado intermedio inconsistente.
  const active = picked && available.includes(picked) ? picked : defaultPeriod(available);

  const view = useMemo(() => {
    if (!active) return null;

    const slice =
      active === "MAX" ? points : points.slice(windowStartIndex(points, PERIOD_DAYS[active]));
    if (slice.length < 2) return null;

    const pct = returnSinceStart(slice);
    if (pct === null || !Number.isFinite(pct)) return null;

    const rebased = rebaseToStart(slice);
    if (rebased.length < 2) return null;

    let min = 0;
    let max = 0;
    for (const point of rebased) {
      if (!Number.isFinite(point.value)) return null;
      if (point.value < min) min = point.value;
      if (point.value > max) max = point.value;
    }

    const canvasHeight = Number.isFinite(height) ? Math.max(64, Math.round(height)) : 148;
    const spread = max - min;
    const pad = spread > 0 ? spread * 0.08 : 1;
    const top = max + pad;
    const bottom = min - pad;
    const scaleY = (value: number) =>
      PAD_Y + (1 - (value - bottom) / (top - bottom)) * (canvasHeight - PAD_Y * 2);
    const scaleX = (index: number) => (index / (rebased.length - 1)) * VB_W;

    const coords = rebased.map((point, index) => ({ x: scaleX(index), y: scaleY(point.value) }));
    const line = coords
      .map((coord, index) => `${index === 0 ? "M" : "L"} ${coord.x.toFixed(2)} ${coord.y.toFixed(2)}`)
      .join(" ");
    const zeroY = scaleY(0);
    const first = coords[0];
    const last = coords[coords.length - 1];
    const area = `${line} L ${last.x.toFixed(2)} ${zeroY.toFixed(2)} L ${first.x.toFixed(2)} ${zeroY.toFixed(2)} Z`;

    return {
      pct,
      line,
      area,
      zeroY,
      canvasHeight,
      positive: pct >= 0,
      firstDate: slice[0].date,
      lastDate: slice[slice.length - 1].date,
    };
  }, [active, height, points]);

  if (!active || !view) return null;

  // Dos decimales solo cuando un decimal real se perdería en "0,0%".
  const digits = view.pct !== 0 && Math.abs(view.pct) < 0.1 ? 2 : 1;
  const valueText = formatSignedPct(view.pct, digits);
  const periodText =
    active === "MAX" ? `Desde inicio (${monthYearLabel(points[0].date)})` : PERIOD_TEXT[active];
  const ariaLabel = `Retorno ${
    active === "MAX" ? "desde el inicio de la serie" : `en ${PERIOD_TEXT[active]}`
  }: ${valueText}, del ${formatShortDate(view.firstDate)} al ${formatShortDate(view.lastDate)}.`;

  return (
    <div className="min-w-0">
      <p
        className={cn(
          "num text-[clamp(1.75rem,5.5vw,2.25rem)] leading-none",
          view.positive ? "text-positive" : "text-negative",
        )}
      >
        {valueText}
      </p>
      <div className="mt-1.5 flex items-baseline justify-between gap-3">
        <p className="min-w-0 text-[12px] leading-snug text-ink-500 dark:text-white/55">{periodText}</p>
        <p className="shrink-0 text-[11px] tabular-nums text-ink-400 dark:text-white/35">
          {formatShortDate(view.lastDate)}
        </p>
      </div>

      <div className="mt-4" style={{ height: view.canvasHeight }}>
        <svg
          viewBox={`0 0 ${VB_W} ${view.canvasHeight}`}
          preserveAspectRatio="none"
          className="h-full w-full"
          role="img"
          aria-label={ariaLabel}
          style={{ color: view.positive ? "var(--color-positive)" : "var(--color-negative)" }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity={0.08} />
              <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* Base 0%: filete punteado de 1px, sin grilla ni ejes. */}
          <line
            x1={0}
            x2={VB_W}
            y1={view.zeroY}
            y2={view.zeroY}
            strokeWidth={1}
            strokeDasharray="2 4"
            vectorEffect="non-scaling-stroke"
            className="stroke-ink-200 dark:stroke-white/20"
          />

          <path d={view.area} fill={`url(#${gradientId})`} stroke="none" />

          <path
            d={view.line}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      <p className="sr-only" aria-live="polite">
        {`${periodText}: ${valueText}`}
      </p>

      <div className="mt-4">
        <PortfolioPeriodSelector value={active} available={available} onChange={setPicked} />
      </div>
    </div>
  );
}
