"use client";
import { formatPctPlain } from "@/lib/utils";

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

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EntryModeSelector } from "@/components/my-portfolio/entry-mode-selector";
import { TickerBadge } from "@/components/my-portfolio/ticker-badge";
import {
  HOLDING_ENTRY_MODE_LABELS,
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

function parseNumber(raw: string): number | null {
  const text = raw.trim().replace(",", ".");
  if (text === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
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
  const [prices, setPrices] = useState<Record<string, PriceInfo>>({});
  const [fx, setFx] = useState("");
  const [newSymbol, setNewSymbol] = useState("");
  const [newValue, setNewValue] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [symbolErrors, setSymbolErrors] = useState<Record<string, string>>({});

  // Precios de los símbolos de la tabla: los pesos en vivo los necesita el
  // modo acciones y el modo monto.
  const symbols = useMemo(
    () => [...new Set(rows.map((row) => row.symbol))],
    [rows],
  );
  const symbolKey = symbols.join(",");

  useEffect(() => {
    if (symbolKey === "") return;
    let cancelled = false;
    void (async () => {
      const result = await getHoldingPrices(symbols);
      if (cancelled || result.error) return;
      const next: Record<string, PriceInfo> = {};
      for (const price of result.prices ?? []) {
        next[price.symbol] = { close: price.close, currency: price.currency };
      }
      setPrices(next);
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
            // En porcentaje la cantidad se conserva si el usuario la tahu.
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
  }

  function removeRow(symbol: string) {
    setRows((current) => {
      const updated = current.filter((row) => row.symbol !== symbol);
      onRowsChange?.(updated);
      return updated;
    });
    setMessage(null);
  }

  const addHolding = useCallback(() => {
    const symbol = newSymbol.trim().toUpperCase();
    if (!SYMBOL_PATTERN.test(symbol)) {
      setMessage({ type: "error", text: "Ingresa un ticker válido." });
      return;
    }
    const value = parseNumber(newValue);
    if (value === null || value <= 0) {
      setMessage({
        type: "error",
        text: `Ingresa un valor mayor que 0 en ${HOLDING_ENTRY_MODE_LABELS[mode].toLowerCase()}.`,
      });
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
    setMessage(null);
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
        text: `Completa el valor de ${missing.map((row) => row.symbol).join(", ")} en ${HOLDING_ENTRY_MODE_LABELS[mode].toLowerCase()}.`,
      });
      return;
    }

    setPending(true);
    setSymbolErrors({});
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
    setPending(false);

    if (result.error) {
      const errors: Record<string, string> = {};
      for (const error of result.errors ?? []) {
        if (error.symbol !== "*") errors[error.symbol] = error.message;
      }
      setSymbolErrors(errors);
      setMessage({ type: "error", text: result.error });
      return;
    }
    setMessage({ type: "success", text: result.success ?? "Cartera guardada." });
    onSaved?.();
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <EntryModeSelector mode={mode} onChange={setMode} disabled={pending} />

      {needsFx && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="entry-fx" className="text-sm font-medium text-ink-900">
            Tipo de cambio (CLP por USD)
          </label>
          <input
            id="entry-fx"
            type="number"
            min={0}
            step={1}
            value={fx}
            onChange={(event) => setFx(event.target.value)}
            className="h-11 w-full min-w-0 border border-ink-200 bg-white px-3 num text-[15px] text-ink-900 transition-colors hover:border-ink-400 focus:border-ink-900 focus:outline-none sm:w-40"
          />
          <p className="text-xs text-ink-500">
            Tu cartera mezcla USD y CLP. Sin este tipo de cambio no se pueden
            calcular los pesos sin mezclar monedas.
          </p>
        </div>
      )}

      {message && (
        <p
          role={message.type === "error" ? "alert" : "status"}
          className={
            "border-l border-ink-900 pl-3 text-[13px] font-medium " +
            (message.type === "error"
              ? "border-negative text-negative"
              : "border-ink-900 text-ink-900")
          }
        >
          {message.text}
        </p>
      )}

      {/* Alta de posición */}
      <div className="flex flex-wrap items-end gap-2 border border-ink-200 bg-white p-3 sm:p-4">
        <div className="min-w-[140px] flex-1">
          <Input
            label="Símbolo"
            value={newSymbol}
            onChange={(event) => setNewSymbol(event.target.value)}
            placeholder="AAPL"
            maxLength={20}
            autoComplete="off"
          />
        </div>
        <div className="w-36 min-w-0">
          <Input
            label={VALUE_LABEL[mode]}
            type="number"
            inputMode="decimal"
            step="any"
            min={0}
            value={newValue}
            onChange={(event) => setNewValue(event.target.value)}
            placeholder={VALUE_PLACEHOLDER[mode]}
          />
        </div>
        <Button variant="outline" onClick={addHolding} className="mb-0.5">
          <Plus className="size-4" strokeWidth={1.5} />
          Agregar
        </Button>
      </div>

      {/* Tabla de posiciones */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-ink-200 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-ink-500">
              <th className="pb-2.5 pr-3 font-medium">Símbolo</th>
              <th className="pb-2.5 pr-3 text-right font-medium">{VALUE_LABEL[mode]}</th>
              <th className="pb-2.5 pr-3 text-right font-medium">Peso</th>
              <th className="pb-2.5 text-right font-medium" aria-label="Acciones" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-ink-600">
                  Aún no tienes posiciones.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const value = readEntryValue(row.values, mode);
                // El peso puede faltar si aún no hay precio: el índice no está
                // tipado como opcional, así que se declara explícito.
                const weight = weightsBySymbol[row.symbol] as number | undefined;
                const error = symbolErrors[row.symbol];
                return (
                  <tr key={row.symbol}>
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2.5">
                        <TickerBadge symbol={row.symbol} className="size-7 text-[9px]" />
                        <span className="font-medium text-ink-900">{row.symbol}</span>
                      </div>
                      {error && (
                        <span className="mt-0.5 block text-[12px] text-negative">
                          {error}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right">
                      <input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min={0}
                        value={value ?? ""}
                        onChange={(event) =>
                          setRowValue(row.symbol, event.target.value)
                        }
                        aria-label={`${VALUE_LABEL[mode]} de ${row.symbol}`}
                        className="num w-32 border border-ink-200 bg-white px-2 py-1 text-right text-[15px] text-ink-900 focus:border-ink-900 focus:outline-none"
                      />
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-ink-900">
                      {weight === undefined || !Number.isFinite(weight) ? (
                        <span className="text-[12px] text-ink-400">Sin peso</span>
                      ) : (
                        `${formatPctPlain(weight, 2)}`
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => removeRow(row.symbol)}
                        aria-label={`Quitar ${row.symbol}`}
                        className="inline-flex size-10 items-center justify-center border border-ink-200 text-ink-600 transition-colors hover:border-ink-900 hover:text-ink-900"
                      >
                        <X className="size-4" strokeWidth={1.5} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-ink-200 pt-4">
        <Button onClick={handleSave} loading={pending} disabled={rows.length === 0}>
          <Save className="size-4" strokeWidth={1.5} />
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
    <section className="border border-ink-200 bg-white">
      <div className="border-b border-ink-200 p-5 sm:p-6">
        <h2 className="text-[15px] font-medium leading-snug tracking-[-0.01em] text-ink-900">
          {title}
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500">{description}</p>
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}
