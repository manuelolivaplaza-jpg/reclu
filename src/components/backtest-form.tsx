"use client";

import { useMemo, useState, type PointerEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  runBacktest,
  type BacktestResult,
  type RebalanceFrequency,
} from "@/lib/backtest";
import type { SeriesPoint } from "@/lib/performance";
import { cn, formatPercent } from "@/lib/utils";

/** Una combinación nunca mezcla más de cinco portafolios. */
export const MAX_BACKTEST_SLEEVES = 5;
export const DEFAULT_FREE_WINDOW_DAYS = 90;

export interface BacktestPortfolio {
  id: string;
  slug: string;
  name: string;
  country: string;
  /** Retorno YTD publicado, solo para rotular la fila. No entra al cálculo. */
  returnYtd: number | null;
  /** Serie de retornos acumulados (%), contrato de portfolio_performance. */
  series: SeriesPoint[];
}

export interface BacktestBenchmark {
  symbol: string;
  label: string;
  /** Niveles de cierre. runBacktest los lleva a base 100. */
  series: SeriesPoint[];
}

export interface BacktestFormProps {
  portfolios: BacktestPortfolio[];
  benchmarks: BacktestBenchmark[];
  /** Plan de pago: ve el historial completo. */
  paid: boolean;
  /** Días de ventana cuando no hay plan de pago. null = sin recorte. */
  windowDays?: number | null;
  /** True cuando las series son ilustrativas (sin Supabase). */
  demo?: boolean;
}

/** Quita duplicados y deja como máximo cinco ids, en el orden recibido. */
export function clampSelection(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length === MAX_BACKTEST_SLEEVES) break;
  }
  return out;
}

/** Agrega o quita un portafolio. Si ya hay cinco, no agrega más. */
export function toggleSelection(
  selected: string[],
  id: string,
  max = MAX_BACKTEST_SLEEVES,
): string[] {
  const current = clampSelection(selected);
  if (current.includes(id)) return current.filter((item) => item !== id);
  if (current.length >= max) return current;
  return clampSelection([...current, id]);
}

/** Pesos enteros que suman 100. Con tres: 34 / 33 / 33. */
export function equalWeights(ids: string[]): Record<string, number> {
  const unique = clampSelection(ids);
  if (unique.length === 0) return {};
  const base = Math.floor(100 / unique.length);
  const remainder = 100 - base * unique.length;
  const weights: Record<string, number> = {};
  unique.forEach((id, index) => {
    weights[id] = base + (index < remainder ? 1 : 0);
  });
  return weights;
}

/** Pesos positivos en decimal. Un 0 o vacío deja el portafolio fuera. */
export function decimalWeights(
  ids: string[],
  percent: Record<string, number>,
): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const id of clampSelection(ids)) {
    const value = percent[id];
    if (!Number.isFinite(value) || value <= 0) continue;
    weights[id] = value / 100;
  }
  return weights;
}

/** Benchmark sugerido: IPSA si toda la selección es chilena; si no, S&P 500. */
export function defaultBenchmarkSymbol(
  selected: string[],
  portfolios: BacktestPortfolio[],
  benchmarks: BacktestBenchmark[],
): string | null {
  if (benchmarks.length === 0) return null;
  const chosen = new Set(clampSelection(selected));
  const countries = portfolios
    .filter((portfolio) => chosen.has(portfolio.id))
    .map((portfolio) => portfolio.country);
  const allChile = countries.length > 0 && countries.every((country) => country === "CL");
  const preferred = allChile
    ? benchmarks.find((benchmark) => benchmark.symbol.includes("IPSA"))
    : benchmarks.find((benchmark) => !benchmark.symbol.includes("IPSA"));
  return (preferred ?? benchmarks[0]).symbol;
}

const DAY_MS = 86_400_000;

function toTime(date: string): number {
  const iso = date.includes("T") ? date : `${date.slice(0, 10)}T00:00:00Z`;
  return Date.parse(iso);
}

/**
 * Recorta la serie a los últimos `days` días. Si el recorte deja menos de dos
 * puntos (serie con huecos), conserva los dos últimos: sin curva no hay nada
 * que mostrar. `days` nulo o inválido deja la serie intacta.
 */
export function truncateSeriesToDays(
  points: SeriesPoint[],
  days: number | null | undefined,
  endDate?: string | null,
): SeriesPoint[] {
  if (!Number.isFinite(days) || (days ?? 0) <= 0 || points.length <= 2) return points;
  const clean = points.filter(
    (point) => Number.isFinite(point.value) && Number.isFinite(toTime(point.date)),
  );
  if (clean.length <= 2) return clean.length > 0 ? clean : points;

  let latest = endDate ? toTime(endDate) : Number.NaN;
  if (!Number.isFinite(latest)) {
    latest = clean.reduce((max, point) => Math.max(max, toTime(point.date)), -Infinity);
  }
  if (!Number.isFinite(latest)) return points;

  const cutoff = latest - ((days as number) - 1) * DAY_MS;
  const recent = clean.filter((point) => toTime(point.date) >= cutoff);
  return recent.length >= 2 ? recent : clean.slice(-2);
}

interface RunFromFormOptions {
  portfolios: BacktestPortfolio[];
  benchmarks: BacktestBenchmark[];
  selected: string[];
  weightsPct: Record<string, number>;
  rebalance: RebalanceFrequency;
  benchmarkSymbol?: string | null;
}

/**
 * Une selección + pesos de formulario con `runBacktest`. Función pura para
 * poder probar el contrato de la pantalla sin montar React.
 */
export function runBacktestFromForm(options: RunFromFormOptions): BacktestResult {
  const selected = clampSelection(options.selected);
  const selectedSet = new Set(selected);
  const series: Record<string, SeriesPoint[]> = {};
  for (const portfolio of options.portfolios) {
    if (!selectedSet.has(portfolio.id)) continue;
    if (portfolio.series.length >= 2) series[portfolio.id] = portfolio.series;
  }

  const benchmark =
    options.benchmarks.find((item) => item.symbol === options.benchmarkSymbol) ??
    options.benchmarks.find((item) => item.series.length >= 2) ??
    null;

  return runBacktest({
    series,
    weights: decimalWeights(selected, options.weightsPct),
    rebalance: options.rebalance,
    ...(benchmark && benchmark.series.length >= 2
      ? { benchmark: benchmark.series, benchmarkSymbol: benchmark.symbol }
      : {}),
  });
}

function formatMetric(value: number | null | undefined, digits = 1, suffix = "%"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}${suffix}`;
}

function tone(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) {
    return "text-ink-900";
  }
  return value > 0 ? "text-positive" : "text-negative";
}

function formatDate(date: string): string {
  const time = toTime(date);
  if (!Number.isFinite(time)) return date;
  return new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(time));
}

const CHART_W = 640;
const CHART_H = 240;
const PAD_X = 2;
const PAD_Y = 12;

interface ChartPoint {
  date: string;
  time: number;
  ret: number;
  x: number;
  y: number;
}

function toReturnPoints(points: SeriesPoint[]): { date: string; time: number; ret: number }[] {
  const clean = points
    .filter((point) => Number.isFinite(point.value) && Number.isFinite(toTime(point.date)))
    .map((point) => ({ date: point.date, time: toTime(point.date), value: point.value }))
    .sort((a, b) => a.time - b.time);
  const base = clean[0]?.value;
  if (base === undefined || base === 0) return [];
  return clean.map((point) => ({
    date: point.date,
    time: point.time,
    ret: (point.value / base - 1) * 100,
  }));
}

function BacktestChart({
  portfolio,
  benchmark,
  benchmarkLabel,
}: {
  portfolio: SeriesPoint[];
  benchmark: SeriesPoint[];
  benchmarkLabel: string;
}) {
  const [pointer, setPointer] = useState<number | null>(null);
  const port = toReturnPoints(portfolio);
  const bench = toReturnPoints(benchmark);
  const all = [...port, ...bench];

  if (all.length === 0) {
    return (
      <p className="border border-ink-200 px-3 py-10 text-[13px] text-ink-500">
        Sin serie para dibujar.
      </p>
    );
  }

  const tMin = all.reduce((min, point) => Math.min(min, point.time), Infinity);
  const tMax = all.reduce((max, point) => Math.max(max, point.time), -Infinity);
  const yMin = Math.min(0, ...all.map((point) => point.ret));
  const yMax = Math.max(0, ...all.map((point) => point.ret));

  const xOf = (time: number) =>
    tMax === tMin
      ? CHART_W / 2
      : PAD_X + ((time - tMin) / (tMax - tMin)) * (CHART_W - PAD_X * 2);
  const yOf = (ret: number) =>
    yMax === yMin ? CHART_H / 2 : PAD_Y + (1 - (ret - yMin) / (yMax - yMin)) * (CHART_H - PAD_Y * 2);

  const portPoints: ChartPoint[] = port.map((point) => ({
    ...point,
    x: xOf(point.time),
    y: yOf(point.ret),
  }));
  const benchPoints: ChartPoint[] = bench.map((point) => ({
    ...point,
    x: xOf(point.time),
    y: yOf(point.ret),
  }));

  const line = (points: ChartPoint[]) =>
    points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(" ");

  const portEnd = portPoints[portPoints.length - 1]?.ret ?? null;
  const benchEnd = benchPoints[benchPoints.length - 1]?.ret ?? null;
  const yMarks = [yMax, (yMin + yMax) / 2, yMin];

  const pointerX = pointer === null ? null : (pointer / CHART_W) * CHART_W;
  let hoverPort: ChartPoint | undefined;
  if (pointerX !== null) {
    let best = Infinity;
    for (const point of portPoints) {
      const distance = Math.abs(point.x - pointerX);
      if (distance < best) {
        best = distance;
        hoverPort = point;
      }
    }
  }
  const hoverDate = hoverPort?.date ?? (benchPoints[0]?.date ?? "");
  const hoverBench = hoverDate
    ? benchPoints.find((point) => point.date === hoverDate)
    : undefined;
  const hoverPct = pointer === null ? 0 : (pointer / CHART_W) * 100;

  function movePointer(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    setPointer(ratio * CHART_W);
  }

  return (
    <figure className="w-full">
      <ul className="mb-4 flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
        <li className="flex items-center gap-2 text-ink-900">
          <span className="inline-block h-0.5 w-6 bg-ink-900" aria-hidden="true" />
          <span>Combinación</span>
          {portEnd !== null ? (
            <span className={cn("num", tone(portEnd))}>{formatPercent(portEnd)}</span>
          ) : null}
        </li>
        {benchmarkLabel ? (
          <li className="flex items-center gap-2 text-ink-500">
            <svg width="24" height="8" aria-hidden="true" className="shrink-0">
              <line
                x1="0"
                y1="4"
                x2="24"
                y2="4"
                stroke="#6b6b6b"
                strokeWidth="1.5"
                strokeDasharray="3 2"
              />
            </svg>
            <span>{benchmarkLabel}</span>
            {benchEnd !== null ? (
              <span className={cn("num", tone(benchEnd))}>{formatPercent(benchEnd)}</span>
            ) : null}
          </li>
        ) : null}
      </ul>

      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3">
        <div className="relative h-44 sm:h-64" aria-hidden="true">
          {yMarks.map((mark, index) => (
            <span
              key={index}
              className="absolute right-0 -translate-y-1/2 text-[11px] tabular-nums text-ink-500"
              style={{ top: `${(yOf(mark) / CHART_H) * 100}%` }}
            >
              {formatPercent(mark)}
            </span>
          ))}
        </div>
        <div
          className="relative h-44 sm:h-64"
          onPointerMove={movePointer}
          onPointerDown={movePointer}
          onPointerLeave={() => setPointer(null)}
        >
          <svg
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            className="h-full w-full overflow-visible"
            preserveAspectRatio="none"
            role="img"
            aria-label={`Retorno acumulado de la combinación contra ${benchmarkLabel || "el benchmark"}`}
          >
            <line
              x1={0}
              x2={CHART_W}
              y1={yOf(0)}
              y2={yOf(0)}
              stroke="#e6e6e6"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            {benchPoints.length >= 2 ? (
              <path
                d={line(benchPoints)}
                fill="none"
                stroke="#6b6b6b"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {portPoints.length >= 2 ? (
              <path
                d={line(portPoints)}
                fill="none"
                stroke="#0a0a0a"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {portPoints.length === 1 ? (
              <circle cx={portPoints[0].x} cy={portPoints[0].y} r={2.5} fill="#0a0a0a" />
            ) : null}
          </svg>
          {pointerX !== null && hoverPort ? (
            <>
              <div
                className="pointer-events-none absolute top-0 bottom-0 w-px bg-ink-200"
                style={{ left: `${hoverPct}%` }}
              />
              <div
                className="pointer-events-none absolute z-10 border border-ink-200 bg-white px-2.5 py-1.5"
                style={{
                  left: `${hoverPct}%`,
                  top: 8,
                  transform:
                    hoverPct < 20
                      ? "translateX(0)"
                      : hoverPct > 80
                        ? "translateX(-100%)"
                        : "translateX(-50%)",
                }}
              >
                <p className="text-[12px] text-ink-900">
                  Combinación <span className="text-ink-500">{formatDate(hoverPort.date)}</span>{" "}
                  <span className={cn("num", tone(hoverPort.ret))}>
                    {formatPercent(hoverPort.ret)}
                  </span>
                </p>
                {hoverBench ? (
                  <p className="text-[12px] text-ink-500">
                    {benchmarkLabel} {formatDate(hoverBench.date)}{" "}
                    <span className={cn("num", tone(hoverBench.ret))}>
                      {formatPercent(hoverBench.ret)}
                    </span>
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
        <div />
        <div className="mt-2 flex justify-between gap-3 text-[11px] tabular-nums text-ink-500">
          <span>{formatDate(port[0]?.date ?? all[0].date)}</span>
          {port.length > 1 ? <span>{formatDate(port[port.length - 1].date)}</span> : null}
        </div>
      </div>
    </figure>
  );
}

function Metric({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div>
      <dt className="text-[11px] text-ink-500">{label}</dt>
      <dd className={cn("num mt-1 text-[19px] leading-none", className ?? "text-ink-900")}>
        {value}
      </dd>
    </div>
  );
}

export function BacktestForm({
  portfolios,
  benchmarks,
  paid,
  windowDays = DEFAULT_FREE_WINDOW_DAYS,
  demo = false,
}: BacktestFormProps) {
  const initial = clampSelection(portfolios.slice(0, 2).map((portfolio) => portfolio.id));
  const [selected, setSelected] = useState<string[]>(initial);
  const [weightsPct, setWeightsPct] = useState<Record<string, number>>(() =>
    equalWeights(initial),
  );
  const [rebalance, setRebalance] = useState<RebalanceFrequency>("monthly");
  const [benchmarkSymbol, setBenchmarkSymbol] = useState<string | null>(() =>
    defaultBenchmarkSymbol(initial, portfolios, benchmarks),
  );
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return portfolios;
    return portfolios.filter(
      (portfolio) =>
        portfolio.name.toLowerCase().includes(needle) ||
        portfolio.slug.toLowerCase().includes(needle) ||
        portfolio.country.toLowerCase().includes(needle),
    );
  }, [portfolios, query]);

  const result = useMemo(
    () =>
      runBacktestFromForm({
        portfolios,
        benchmarks,
        selected,
        weightsPct,
        rebalance,
        benchmarkSymbol,
      }),
    [portfolios, benchmarks, selected, weightsPct, rebalance, benchmarkSymbol],
  );

  const totalWeight = selected.reduce((total, id) => total + (weightsPct[id] ?? 0), 0);
  const activeBenchmark =
    benchmarks.find((benchmark) => benchmark.symbol === benchmarkSymbol) ?? null;
  const windowLabel =
    paid || !windowDays ? "Historial completo" : `Últimos ${windowDays} días`;

  function toggle(id: string) {
    const next = toggleSelection(selected, id);
    if (next.length === selected.length && !selected.includes(id)) return;
    setSelected(next);
    setWeightsPct(equalWeights(next));
  }

  function setWeight(id: string, raw: string) {
    const parsed = raw === "" ? 0 : Number(raw);
    const value = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    setWeightsPct((current) => ({ ...current, [id]: value }));
  }

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14">
      <div>
        <section aria-labelledby="portafolios-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink-200 pb-2">
            <h2 id="portafolios-heading" className="text-[15px] font-medium text-ink-900">
              1. Portafolios
            </h2>
            <span className="num text-[12px] text-ink-500">
              {selected.length} / {MAX_BACKTEST_SLEEVES}
            </span>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-500">
            Elige entre uno y cinco. Los pesos se reparten en partes iguales al
            agregar o quitar; puedes ajustarlos después.
          </p>

          <label className="mt-4 flex flex-col gap-1.5">
            <span className="text-[12px] text-ink-500">Buscar</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nombre, país o slug"
              className="h-10 w-full rounded-none border border-ink-200 bg-white px-3 text-[14px] text-ink-900 placeholder:text-ink-500 focus:border-ink-900 focus:outline-none"
            />
          </label>

          {filtered.length === 0 ? (
            <p className="mt-6 text-[13px] text-ink-500">
              No hay portafolios con serie que coincidan con la búsqueda.
            </p>
          ) : (
            <ul className="mt-4 max-h-[28rem] overflow-y-auto border-t border-ink-200 pr-1">
              {filtered.map((portfolio) => {
                const active = selected.includes(portfolio.id);
                const disabled = !active && selected.length >= MAX_BACKTEST_SLEEVES;
                const inputId = `backtest-${portfolio.id}`;
                return (
                  <li key={portfolio.id} className="border-b border-ink-200 py-3">
                    <div className={cn("flex items-start gap-3", disabled && "opacity-40")}>
                      <input
                        id={inputId}
                        type="checkbox"
                        checked={active}
                        disabled={disabled}
                        onChange={() => toggle(portfolio.id)}
                        className="mt-1 size-4 shrink-0 accent-ink-900"
                      />
                      <label htmlFor={inputId} className="min-w-0 flex-1 cursor-pointer">
                        <span className="block text-[14px] leading-snug text-ink-900">
                          {portfolio.name}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-ink-500">
                          {portfolio.country} · {portfolio.series.length} datos
                        </span>
                      </label>
                      {portfolio.returnYtd !== null ? (
                        <span className={cn("num shrink-0 text-[13px]", tone(portfolio.returnYtd))}>
                          {formatPercent(portfolio.returnYtd)}
                        </span>
                      ) : null}
                    </div>
                    {active ? (
                      <div className="mt-2 flex items-center gap-2 pl-7">
                        <label
                          htmlFor={`${inputId}-weight`}
                          className="text-[12px] text-ink-500"
                        >
                          Peso
                        </label>
                        <input
                          id={`${inputId}-weight`}
                          type="number"
                          min={0}
                          step={1}
                          inputMode="decimal"
                          value={weightsPct[portfolio.id] ?? 0}
                          onChange={(event) => setWeight(portfolio.id, event.target.value)}
                          className="h-8 w-20 rounded-none border border-ink-200 bg-white px-2 text-right text-[13px] tabular-nums text-ink-900 focus:border-ink-900 focus:outline-none"
                        />
                        <span className="text-[12px] text-ink-500">%</span>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12px] text-ink-500">
              {Math.abs(totalWeight - 100) < 0.001
                ? "Los pesos suman 100%."
                : "Los pesos se normalizan para sumar 100%."}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setWeightsPct(equalWeights(selected))}
            >
              Repartir en partes iguales
            </Button>
          </div>
        </section>

        <fieldset className="mt-10 border-t border-ink-200 pt-6">
          <legend className="text-[15px] font-medium text-ink-900">2. Rebalanceo</legend>
          <div className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
            {(
              [
                { value: "monthly", label: "Mensual" },
                { value: "quarterly", label: "Trimestral" },
              ] as const
            ).map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2 text-[14px] text-ink-900"
              >
                <input
                  type="radio"
                  name="backtest-rebalance"
                  value={option.value}
                  checked={rebalance === option.value}
                  onChange={() => setRebalance(option.value)}
                  className="size-4 accent-ink-900"
                />
                {option.label}
              </label>
            ))}
          </div>
          <p className="mt-3 max-w-lg text-[12px] leading-relaxed text-ink-500">
            El rebalanceo vuelve a los pesos objetivo al cierre del primer día
            del mes o del trimestre. Entre medio, los pesos flotan con el
            precio. Sin comisiones ni dividendos.
          </p>
        </fieldset>

        <fieldset className="mt-8 border-t border-ink-200 pt-6">
          <legend className="text-[15px] font-medium text-ink-900">3. Benchmark</legend>
          {benchmarks.length > 1 ? (
            <div className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
              {benchmarks.map((benchmark) => (
                <label
                  key={benchmark.symbol}
                  className="flex cursor-pointer items-center gap-2 text-[14px] text-ink-900"
                >
                  <input
                    type="radio"
                    name="backtest-benchmark"
                    value={benchmark.symbol}
                    checked={benchmarkSymbol === benchmark.symbol}
                    onChange={() => setBenchmarkSymbol(benchmark.symbol)}
                    className="size-4 accent-ink-900"
                  />
                  {benchmark.label}
                </label>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-[14px] text-ink-900">
              {activeBenchmark?.label ?? "Sin benchmark disponible"}
            </p>
          )}
          <p className="mt-3 max-w-lg text-[12px] leading-relaxed text-ink-500">
            {activeBenchmark
              ? `Comparación contra ${activeBenchmark.label}. El benchmark no cambia la curva combinada.`
              : "No hay serie de benchmark para este período."}
          </p>
        </fieldset>
      </div>

      <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <section aria-labelledby="resultado-heading" aria-live="polite">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink-200 pb-2">
            <h2 id="resultado-heading" className="text-[15px] font-medium text-ink-900">
              Resultado
            </h2>
            <span className="text-[12px] text-ink-500">
              {windowLabel}
              {demo ? " · datos de ejemplo" : ""}
            </span>
          </div>

          {result.curve.length >= 2 ? (
            <>
              <div className="mt-5">
                <BacktestChart
                  portfolio={result.curve}
                  benchmark={result.benchmarkCurve}
                  benchmarkLabel={activeBenchmark?.label ?? ""}
                />
              </div>

              <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-ink-200 pt-5 sm:grid-cols-3">
                <Metric
                  label="Retorno total"
                  value={formatMetric(result.metrics.totalReturnPct)}
                  className={tone(result.metrics.totalReturnPct)}
                />
                <Metric
                  label="CAGR"
                  value={formatMetric(result.metrics.cagrPct)}
                  className={tone(result.metrics.cagrPct)}
                />
                <Metric
                  label="Máx. caída"
                  value={formatMetric(result.metrics.maxDrawdownPct)}
                  className={tone(result.metrics.maxDrawdownPct)}
                />
                <Metric
                  label="Volatilidad anual"
                  value={formatMetric(result.metrics.volatilityPct)}
                />
                <Metric
                  label="Sharpe"
                  value={formatMetric(result.metrics.sharpe, 2, "")}
                />
                <Metric
                  label="Exceso vs. benchmark"
                  value={formatMetric(result.metrics.excessReturnPct)}
                  className={tone(result.metrics.excessReturnPct)}
                />
              </dl>

              <p className="mt-5 text-[12px] leading-relaxed text-ink-500">
                {result.methodLabel}
              </p>
              <p className="mt-1 text-[12px] text-ink-500">
                Ventana: {result.start ? formatDate(result.start) : "—"} a{" "}
                {result.end ? formatDate(result.end) : "—"} · Supuesto:{" "}
                {result.entryLabel}.
              </p>

              {result.notes.length > 0 ? (
                <ul className="mt-3 space-y-1 text-[12px] text-ink-500">
                  {result.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              ) : null}

              <p className="mt-4 border-l-2 border-ink-900 pl-3 text-[12px] leading-relaxed text-ink-500">
                {result.disclaimer}
              </p>
            </>
          ) : (
            <div className="mt-5 border border-ink-200 px-4 py-10">
              <p className="text-[14px] text-ink-900">Todavía no hay curva.</p>
              {result.reasons.length > 0 ? (
                <ul className="mt-2 space-y-1 text-[13px] text-ink-500">
                  {result.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[13px] text-ink-500">
                  Elige al menos un portafolio con dos datos en la ventana.
                </p>
              )}
            </div>
          )}

          {!paid ? (
            <div className="mt-6 border border-ink-900 px-4 py-4">
              <p className="text-[13px] leading-relaxed text-ink-900">
                La ventana gratuita muestra los últimos {windowDays} días. El
                historial completo del backtest está en los planes de pago.
              </p>
              <Link
                href="/signup?plan=pro"
                className="mt-2 inline-block text-[13px] text-ink-900 underline underline-offset-4"
              >
                Ver planes
              </Link>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
