"use client";

/**
 * holdings-entry-panel.tsx — carga de cartera por cantidad de acciones, monto
 * en dinero o porcentaje (F78).
 *
 * Panel autocontenido: selector de modo, tabla de posiciones con el valor del
 * modo vigente, peso calculado en vivo y botón de guardar. La conversión usa
 * el MISMO helper puro que el servidor (`lib/holdings-entry`), así que lo que
 * se ve antes de guardar es exactamente lo que se guarda.
 *
 * Un solo modo por cartera: el selector cambia el significado de la columna
 * de valor, no se mezclan modos en la misma cartera.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, X } from "lucide-react";
import { formatPercent } from "@/components/my-portfolio/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EntryModeSelector } from "@/components/my-portfolio/entry-mode-selector";
import { TickerBadge } from "@/components/my-portfolio/ticker-badge";
import {
  emptyEntryValues,
  readEntryValue,
  resolveHoldingsEntry,
  writeEntryValue,
  type HoldingEntryMode,
  type HoldingEntryValues,
} from "@/lib/holdings-entry";
import { getHoldingPrices, saveHoldingsByMode } from "@/app/actions/holdings-entry";

/** Fila de la tabla de posiciones. */
export interface EntryPanelRow {
  symbol: string;
  name: string;
  /** Valor de la posición en cada modo (se conservan al cambiar de modo). */
  values: HoldingEntryValues;
  avgCost: number | null;
  currency: "USD" | "CLP";
  market: "US" | "CL" | null;
}

interface PriceInfo {
  close: number;
  currency: "USD" | "CLP";
}

const SYMBOL_PATTERN = /^[A-Z0-9.\-]{1,20}$/;

/** Identidad estable para "sin precios": evita recalcular memos en cada render. */
const EMPTY_PRICES: Record<string, PriceInfo> = {};

/** Etiqueta de la columna de valor según el modo. */
const VALUE_LABEL: Record<HoldingEntryMode, string> = {
  percentage: "Peso %",
  shares: "Cantidad",
  amount: "Monto (USD)",
};

const VALUE_PLACEHOLDER: Record<HoldingEntryMode, string> = {
  percentage: "25",
  shares: "10",
  amount: "1500",
};

/** Mensaje de valor inválido, con el sustantivo correcto de cada modo. */
const MIN_VALUE_MESSAGE: Record<HoldingEntryMode, string> = {
  percentage: "Ingresa un porcentaje mayor que 0.",
  shares: "Ingresa una cantidad de acciones mayor que 0.",
  amount: "Ingresa un monto mayor que 0.",
};

/** Frase para el error de guardado: encaja después de "Ingresa". */
const MISSING_LABEL: Record<HoldingEntryMode, string> = {
  percentage: "porcentaje",
  shares: "cantidad de acciones",
  amount: "monto en USD",
};

function parseNumber(raw: string): number | null {
  const text = raw.trim().replace(",", ".");
  if (text === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function rowInputId(symbol: string): string {
  return `entry-value-${symbol.replace(/[^A-Za-z0-9_-]/g, "-")}`;
}

export function HoldingsEntryPanel({
  initialRows,
  maxPositions,
  planName,
  defaultMode = "percentage",
  onRowsChange,
  onSaved,
}: {
  initialRows: EntryPanelRow[];
  maxPositions: number;
  planName: string;
  defaultMode?: HoldingEntryMode;
  /** Avisa al padre de las filas actuales (para el panel de solapamiento). */
  onRowsChange?: (rows: EntryPanelRow[]) => void;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<HoldingEntryMode>(defaultMode);
  const [rows, setRows] = useState<EntryPanelRow[]>(initialRows);
  // Precios + estado viven juntos y se indexan por `symbolKey`: así el paso a
  // "loading" es derivado (sin setState dentro del efecto) y un resultado
  // viejo nunca se pinta sobre otra lista de símbolos.
  const [pricesState, setPricesState] = useState<{
    key: string;
    status: "idle" | "loading" | "ready" | "error";
    data: Record<string, PriceInfo>;
  }>({ key: "", status: initialRows.length > 0 ? "loading" : "idle", data: {} });
  const [fx, setFx] = useState("");
  const [newSymbol, setNewSymbol] = useState("");
  const [newValue, setNewValue] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [symbolErrors, setSymbolErrors] = useState<Record<string, string>>({});
  const fxRef = useRef<HTMLInputElement>(null);

  // Precios de los símbolos de la tabla: los pesos en vivo los necesita el
  // modo acciones y el modo monto.
  const symbols = useMemo(
    () => [...new Set(rows.map((row) => row.symbol))],
    [rows],
  );
  const symbolKey = symbols.join(",");

  // Derivados: al cambiar la lista de símbolos el estado vuelve a "loading"
  // sin escribir en el efecto; los precios de otra lista no se reutilizan.
  const pricesFresh = pricesState.key === symbolKey;
  const prices = pricesFresh ? pricesState.data : EMPTY_PRICES;
  const pricesStatus = pricesFresh
    ? pricesState.status
    : symbolKey
      ? "loading"
      : "idle";

  useEffect(() => {
    if (symbolKey === "") return;
    let cancelled = false;
    void (async () => {
      const result = await getHoldingPrices(symbols);
      if (cancelled) return;
      if (result.error) {
        setPricesState({ key: symbolKey, status: "error", data: {} });
        return;
      }
      const next: Record<string, PriceInfo> = {};
      for (const price of result.prices ?? []) {
        next[price.symbol] = { close: price.close, currency: price.currency };
      }
      setPricesState({ key: symbolKey, status: "ready", data: next });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolKey]);

  const fxValue = useMemo(() => {
    const parsed = parseNumber(fx);
    return parsed !== null && parsed > 0 ? parsed : null;
  }, [fx]);

  /** Filas del helper con el precio ya resuelto. */
  const entryRows = useMemo(
    () =>
      rows
        .filter((row) => readEntryValue(row.values, mode) !== null)
        .map((row) => {
          const price = prices[row.symbol];
          return {
            symbol: row.symbol,
            name: row.name,
            currency: row.currency,
            market: row.market,
            avg_cost: row.avgCost ?? undefined,
            // En porcentaje la cantidad se conserva si el usuario la tipeó.
            ...(mode === "percentage" ? { shares: row.values.shares ?? undefined } : {}),
            ...(mode === "percentage"
              ? { percentage: row.values.percentage ?? undefined }
              : mode === "shares"
                ? { shares: row.values.shares ?? undefined }
                : { amount: row.values.amount ?? undefined }),
            price: price?.close ?? null,
            priceCurrency: price?.currency ?? null,
          };
        }),
    [rows, mode, prices],
  );

  // Conversión en vivo con el mismo helper del servidor.
  const preview = useMemo(
    () => resolveHoldingsEntry(mode, entryRows, { fx: fxValue }),
    [mode, entryRows, fxValue],
  );

  const weightsBySymbol = useMemo(() => {
    const map: Record<string, number> = {};
    for (const holding of preview.holdings) map[holding.symbol] = holding.weight;
    return map;
  }, [preview.holdings]);

  /** Errores por símbolo del cálculo en vivo, para avisar antes de guardar. */
  const previewErrors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const error of preview.errors) {
      if (error.symbol !== "*") map[error.symbol] = error.message;
    }
    return map;
  }, [preview.errors]);

  const needsFx = useMemo(
    () => preview.errors.some((error) => /tipo de cambio/i.test(error.message)),
    [preview.errors],
  );

  function setRowValue(symbol: string, raw: string) {
    const value = parseNumber(raw);
    setRows((current) => {
      const updated = current.map((row) =>
        row.symbol === symbol
          ? { ...row, values: writeEntryValue(row.values, mode, value) }
          : row,
      );
      onRowsChange?.(updated);
      return updated;
    });
    // El error del símbolo corresponde al valor anterior: se retira al editar.
    setSymbolErrors((current) => {
      if (!current[symbol]) return current;
      const next = { ...current };
      delete next[symbol];
      return next;
    });
  }

  function removeRow(symbol: string) {
    setRows((current) => {
      const updated = current.filter((row) => row.symbol !== symbol);
      onRowsChange?.(updated);
      return updated;
    });
    setSymbolErrors((current) => {
      if (!current[symbol]) return current;
      const next = { ...current };
      delete next[symbol];
      return next;
    });
    setMessage({
      type: "success",
      text: `Quitaste ${symbol}. Guarda la cartera para aplicar el cambio.`,
    });
  }

  const addHolding = useCallback(() => {
    const symbol = newSymbol.trim().toUpperCase();
    if (!SYMBOL_PATTERN.test(symbol)) {
      setMessage({
        type: "error",
        text: "Escribe un ticker válido: hasta 20 caracteres entre letras, números, punto y guion.",
      });
      return;
    }
    const value = parseNumber(newValue);
    if (value === null || value <= 0) {
      setMessage({ type: "error", text: MIN_VALUE_MESSAGE[mode] });
      return;
    }
    if (rows.some((row) => row.symbol === symbol)) {
      setMessage({ type: "error", text: `${symbol} ya está en tu cartera.` });
      return;
    }
    if (rows.length >= maxPositions) {
      setMessage({
        type: "error",
        text: `Alcanzaste el límite de ${maxPositions} posiciones de tu plan ${planName}.`,
      });
      return;
    }
    setRows((current) => {
      const updated: EntryPanelRow[] = [
        ...current,
        {
          symbol,
          name: "",
          values: writeEntryValue(emptyEntryValues(), mode, value),
          avgCost: null,
          currency: "USD",
          market: null,
        },
      ];
      onRowsChange?.(updated);
      return updated;
    });
    setNewSymbol("");
    setNewValue("");
    setMessage({
      type: "success",
      text: `${symbol} agregado. Guarda la cartera para aplicarlo.`,
    });
  }, [mode, newSymbol, newValue, rows, maxPositions, planName, onRowsChange]);

  async function handleSave() {
    if (rows.length === 0) {
      setMessage({ type: "error", text: "Agrega al menos una posición." });
      return;
    }
    const missing = rows.filter((row) => readEntryValue(row.values, mode) === null);
    if (missing.length > 0) {
      setMessage({
        type: "error",
        text: `Ingresa ${MISSING_LABEL[mode]} para ${missing.map((row) => row.symbol).join(", ")}.`,
      });
      return;
    }

    setPending(true);
    setSymbolErrors({});
    try {
      const result = await saveHoldingsByMode({
        mode,
        rows: rows.map((row) => ({
          symbol: row.symbol,
          name: row.name,
          value: readEntryValue(row.values, mode) as number,
          currency: row.currency,
          market: row.market ?? undefined,
          avg_cost: row.avgCost ?? undefined,
        })),
        fx: fxValue ?? undefined,
      });

      if (result.error) {
        const errors: Record<string, string> = {};
        for (const error of result.errors ?? []) {
          if (error.symbol !== "*") errors[error.symbol] = error.message;
        }
        setSymbolErrors(errors);
        setMessage({ type: "error", text: result.error });
        if (/tipo de cambio/i.test(result.error)) fxRef.current?.focus();
        return;
      }
      setMessage({ type: "success", text: result.success ?? "Cartera guardada." });
      onSaved?.();
      router.refresh();
    } catch {
      setMessage({
        type: "error",
        text: "No pudimos guardar la cartera. Revisa tu conexión e inténtalo de nuevo.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div aria-busy={pending} className="flex min-w-0 flex-col gap-4">
      <EntryModeSelector
        mode={mode}
        onChange={(next) => {
          setMode(next);
          setSymbolErrors({});
          setMessage(null);
        }}
        disabled={pending}
      />

      {(needsFx || fx !== "") && (
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="entry-fx" className="text-sm font-medium text-ink-900">
            Tipo de cambio (CLP por USD)
          </label>
          <input
            ref={fxRef}
            id="entry-fx"
            type="number"
            min={0}
            step={1}
            value={fx}
            onChange={(event) => setFx(event.target.value)}
            placeholder="950"
            disabled={pending}
            aria-describedby="entry-fx-hint"
            className="num h-11 w-full min-w-0 border border-line bg-canvas px-3 text-[15px] text-ink-900 transition-colors hover:border-ink-400 focus:border-ink-900 focus:outline-none disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-500 sm:w-40"
          />
          <p id="entry-fx-hint" className="text-xs leading-relaxed text-ink-500">
            Tu cartera mezcla USD y CLP. Sin este tipo de cambio no se pueden
            calcular los pesos sin mezclar monedas.
          </p>
        </div>
      )}

      {message && (
        <p
          role={message.type === "error" ? "alert" : "status"}
          className={
            "border-l-2 pl-3 text-[13px] font-medium leading-relaxed " +
            (message.type === "error"
              ? "border-negative text-negative"
              : "border-ink-900 text-ink-900")
          }
        >
          {message.text}
        </p>
      )}

      {/* Alta de posición */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          addHolding();
        }}
        noValidate
        className="grid min-w-0 grid-cols-1 gap-3 border border-line bg-canvas p-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end sm:p-4"
      >
        <Input
          label="Símbolo"
          id="entry-new-symbol"
          value={newSymbol}
          onChange={(event) => {
            setNewSymbol(event.target.value);
            setMessage(null);
          }}
          placeholder="AAPL"
          maxLength={20}
          autoComplete="off"
          disabled={pending}
        />
        <Input
          label={VALUE_LABEL[mode]}
          id="entry-new-value"
          type="number"
          inputMode="decimal"
          step="any"
          min={0}
          value={newValue}
          onChange={(event) => {
            setNewValue(event.target.value);
            setMessage(null);
          }}
          placeholder={VALUE_PLACEHOLDER[mode]}
          disabled={pending}
        />
        <Button
          type="submit"
          variant="outline"
          disabled={pending}
          className="w-full sm:w-auto"
        >
          <Plus className="size-4" strokeWidth={1.5} aria-hidden />
          Agregar
        </Button>
      </form>

      {/* Tabla de posiciones */}
      <div
        role="region"
        aria-label="Posiciones de la cartera"
        tabIndex={0}
        className="overflow-x-auto"
      >
        <table className="w-full text-sm">
          <caption className="sr-only">
            Posiciones de la cartera con el valor del modo vigente y el peso
            calculado.
          </caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="pb-2.5 pr-3 text-left text-[13px] font-normal text-ink-500">
                Símbolo
              </th>
              <th scope="col" className="pb-2.5 pr-3 text-right text-[13px] font-normal text-ink-500">
                {VALUE_LABEL[mode]}
              </th>
              <th scope="col" className="pb-2.5 pr-3 text-right text-[13px] font-normal text-ink-500">
                Peso
              </th>
              <th scope="col" className="pb-2.5 text-right">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-[13px] text-ink-500">
                  Sin posiciones todavía. Agrega una con el formulario de arriba.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const value = readEntryValue(row.values, mode);
                // El peso puede faltar si aún no hay precio.
                const weight = weightsBySymbol[row.symbol] as number | undefined;
                // Mientras los precios cargan (o si fallaron) no se acusa un
                // problema por símbolo: todavía no hay dato para juzgarlo.
                const error =
                  symbolErrors[row.symbol] ??
                  (pricesStatus === "ready" ? previewErrors[row.symbol] : undefined);
                const inputId = rowInputId(row.symbol);
                const errorId = `${inputId}-error`;

                return (
                  <tr key={row.symbol}>
                    <td className="py-2.5 pr-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <TickerBadge symbol={row.symbol} className="size-7 text-[9px]" />
                        <span className="break-all font-medium text-ink-900">
                          {row.symbol}
                        </span>
                      </div>
                      {error && (
                        <span
                          id={errorId}
                          className="mt-1 block max-w-[22rem] text-[12px] leading-snug text-negative"
                        >
                          {error}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right">
                      <input
                        id={inputId}
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min={0}
                        value={value ?? ""}
                        onChange={(event) =>
                          setRowValue(row.symbol, event.target.value)
                        }
                        aria-label={`${VALUE_LABEL[mode]} de ${row.symbol}`}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? errorId : undefined}
                        disabled={pending}
                        className="num w-24 border border-line bg-canvas px-2 py-1 text-right text-[15px] tabular-nums text-ink-900 aria-invalid:border-negative focus:border-ink-900 focus:outline-none disabled:opacity-50 sm:w-32"
                      />
                    </td>
                    <td className="py-2.5 pr-3 text-right num text-ink-900">
                      {weight === undefined || !Number.isFinite(weight) ? (
                        <span className="text-[12px] font-normal tracking-normal text-ink-500">
                          {pricesStatus === "loading" ? "Calculando…" : "Sin peso"}
                        </span>
                      ) : (
                        formatPercent(weight)
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => removeRow(row.symbol)}
                        disabled={pending}
                        aria-label={`Quitar ${row.symbol}`}
                        className="inline-flex size-10 items-center justify-center border border-line text-ink-600 transition-colors hover:border-ink-900 hover:text-ink-900 disabled:pointer-events-none disabled:opacity-45"
                      >
                        <X className="size-4" strokeWidth={1.5} aria-hidden />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pricesStatus === "error" && (
        <p className="text-[12px] leading-relaxed text-ink-500">
          No pudimos consultar los precios: los pesos quedan sin calcular hasta
          que recargues la página.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <Button
          type="button"
          onClick={() => void handleSave()}
          loading={pending}
          disabled={rows.length === 0}
        >
          {!pending && <Save className="size-4" strokeWidth={1.5} aria-hidden />}
          Guardar cartera
        </Button>
        <span className="text-[12px] text-ink-500">
          {rows.length} de {maxPositions} posiciones · plan {planName}
        </span>
      </div>
    </div>
  );
}

/** Encabezado editorial para el panel que envuelve al formulario de carga. */
export function EntryPanelCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-line bg-canvas">
      <div className="border-b border-line p-5 sm:p-6">
        <h2 className="text-[17px] font-medium leading-snug tracking-[-0.01em] text-ink-900">
          {title}
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500">{description}</p>
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}
