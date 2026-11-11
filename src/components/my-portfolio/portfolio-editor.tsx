"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Save, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PositionsTable } from "@/components/my-portfolio/positions-table";
import { ExportCsvButton } from "@/components/my-portfolio/export-csv-button";
import { EntryModeSelector } from "@/components/my-portfolio/entry-mode-selector";
import { PortfolioImageImport } from "@/components/portfolio-image-import";
import { detectedToEntryRows } from "@/lib/portfolio-image-entry";
import {
  formatMoney,
  formatPercent,
} from "@/components/my-portfolio/format";
import type { EditablePosition, ValuedPositionRow } from "@/components/my-portfolio/types";
import { valuatePortfolio } from "@/lib/portfolio-valuation";
import { toEditableRows, type DetectedPosition } from "@/lib/portfolio-image-rows";
import {
  emptyEntryValues,
  readEntryValue,
  writeEntryValue,
  type HoldingEntryMode,
  type HoldingEntryValues,
} from "@/lib/holdings-entry";
import {
  clearUserHoldings,
} from "@/app/actions/holdings";
import { saveHoldingsByMode } from "@/app/actions/holdings-entry";

const SYMBOL_PATTERN = /^[A-Z0-9.\-]{1,20}$/;

/** Rótulo de KPI: 13px gris de apoyo, sin mayúsculas forzadas (diseño). */
const KPI_LABEL = "text-[13px] font-normal leading-none text-ink-500";

interface DraftForm {
  symbol: string;
  quantity: string;
  cost: string;
  currency: "USD" | "CLP";
  market: "" | "US" | "CL";
}

/** Etiqueta del campo principal según el modo de ingreso (F78). */
const VALUE_LABEL: Record<HoldingEntryMode, string> = {
  shares: "Cantidad de acciones",
  amount: "Monto (USD)",
  percentage: "Peso %",
};

const VALUE_PLACEHOLDER: Record<HoldingEntryMode, string> = {
  shares: "10",
  amount: "1500",
  percentage: "25",
};

const EMPTY_FORM: DraftForm = {
  symbol: "",
  quantity: "",
  cost: "",
  currency: "USD",
  market: "",
};

function parseNumber(raw: string): number | null {
  const text = raw.trim().replace(",", ".");
  if (text === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/**
 * Editor de Mi portafolio (F62): tabla valorizada, alta/edición de posiciones,
 * quitar y guardar la cartera completa. `saveUserHoldings` reemplaza la
 * cartera actual, por eso siempre se envía el arreglo completo.
 *
 * Quien monta este componente solo lo hace con consentimiento vigente.
 */
export function PortfolioEditor({
  initialPositions,
  maxPositions,
  canExportCsv,
  planName,
  imageImportEnabled = false,
}: {
  initialPositions: EditablePosition[];
  maxPositions: number;
  canExportCsv: boolean;
  planName: string;
  /** Muestra el importador de capturas (F79). Apagado por flag. */
  imageImportEnabled?: boolean;
}) {
  const router = useRouter();
  const [positions, setPositions] = useState<EditablePosition[]>(initialPositions);
  // Tras guardar, el servidor vuelve a mandar las posiciones con su precio más
  // reciente (router.refresh). Patrón de React para ajustar estado cuando
  // cambian las props, sin un efecto que dispare renders en cascada.
  const [syncedInitial, setSyncedInitial] = useState(initialPositions);
  if (syncedInitial !== initialPositions) {
    setSyncedInitial(initialPositions);
    setPositions(initialPositions);
  }
  const [form, setForm] = useState<DraftForm>(EMPTY_FORM);
  const [editingSymbol, setEditingSymbol] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [dirty, setDirty] = useState(false);
  // F78: un solo modo por cartera. Cada posición guarda el valor de los tres
  // modos para que cambiar de modo no borre lo ya tipeado.
  const [mode, setMode] = useState<HoldingEntryMode>("shares");
  const [entryValues, setEntryValues] = useState<Record<string, HoldingEntryValues>>(
    () =>
      Object.fromEntries(
        initialPositions.map((position) => [
          position.symbol,
          {
            ...emptyEntryValues(),
            shares: position.quantity,
            percentage: position.weight,
          },
        ]),
      ),
  );
  const [fx, setFx] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );

  const valuation = useMemo(
    () =>
      valuatePortfolio(
        positions.map((position) => ({
          symbol: position.symbol,
          quantity: position.quantity,
          avgCost: position.avgCost,
          currency: position.currency,
          price: position.price,
          priceDate: position.priceDate,
        })),
      ),
    [positions],
  );

  // valuatePortfolio conserva el orden de entrada: se puede unir por índice.
  const rows: ValuedPositionRow[] = valuation.positions.map((row, index) => ({
    ...row,
    name: positions[index]?.name ?? "",
    market: positions[index]?.market ?? null,
  }));

  const missingPrices = valuation.totals.reduce(
    (sum, total) => sum + total.missingPrices,
    0,
  );

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingSymbol(null);
  }

  function updateField<K extends keyof DraftForm>(key: K, value: DraftForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startEdit(symbol: string) {
    const position = positions.find((row) => row.symbol === symbol);
    if (!position) return;
    setEditingSymbol(symbol);
    const values = entryValues[symbol] ?? emptyEntryValues();
    setForm({
      symbol: position.symbol,
      // El campo principal muestra el valor del modo vigente (F78).
      quantity:
        readEntryValue(values, mode) !== null
          ? String(readEntryValue(values, mode))
          : mode === "shares" && position.quantity !== null
            ? String(position.quantity)
            : "",
      cost: position.avgCost === null ? "" : String(position.avgCost),
      currency: position.currency,
      market: position.market ?? "",
    });
    setMessage(null);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const symbol = form.symbol.trim().toUpperCase();
    if (!SYMBOL_PATTERN.test(symbol)) {
      setMessage({ type: "error", text: "Ingresa un ticker válido (letras, números, punto o guion)." });
      return;
    }

    const quantity = parseNumber(form.quantity);
    if (quantity !== null && quantity < 0) {
      setMessage({ type: "error", text: "La cantidad no puede ser negativa." });
      return;
    }
    if (quantity !== null && quantity === 0 && mode !== "percentage") {
      setMessage({
        type: "error",
        text: `Ingresa un valor mayor que 0 en ${VALUE_LABEL[mode].toLowerCase()}.`,
      });
      return;
    }
    const avgCost = parseNumber(form.cost);
    if (avgCost !== null && avgCost < 0) {
      setMessage({ type: "error", text: "El costo no puede ser negativo." });
      return;
    }

    const duplicate = positions.some(
      (position) =>
        position.symbol.toUpperCase() === symbol &&
        position.symbol.toUpperCase() !== editingSymbol?.toUpperCase(),
    );
    if (duplicate) {
      setMessage({ type: "error", text: `${symbol} ya está en tu cartera. Edítalo en la tabla.` });
      return;
    }

    if (!editingSymbol && positions.length >= maxPositions) {
      setMessage({
        type: "error",
        text: `Alcanzaste el límite de ${maxPositions} posiciones de tu plan ${planName}.`,
      });
      return;
    }

    const previous = editingSymbol
      ? positions.find((position) => position.symbol === editingSymbol)
      : undefined;
    const sameSymbol = previous?.symbol.toUpperCase() === symbol;
    const nextMarket = form.market === "" ? null : form.market;
    const sameContext =
      sameSymbol &&
      previous?.currency === form.currency &&
      previous?.market === nextMarket;

    const next: EditablePosition = {
      symbol,
      name: previous?.name ?? "",
      // En modo acciones la cantidad es el valor tipeado; en monto y
      // porcentaje la calcula el servidor con el precio (F78).
      quantity: mode === "shares" ? quantity : (previous?.quantity ?? null),
      avgCost,
      currency: form.currency,
      market: nextMarket,
      // Si cambió el ticker, la moneda o el mercado, el precio anterior ya no aplica.
      price: sameContext ? (previous?.price ?? null) : null,
      priceDate: sameContext ? (previous?.priceDate ?? null) : null,
      weight: previous?.weight ?? null,
    };

    setPositions((current) =>
      editingSymbol
        ? current.map((position) =>
            position.symbol === editingSymbol ? next : position,
          )
        : [...current, next],
    );
    // F78: el valor tipeado se guarda en el modo vigente.
    setEntryValues((current) => ({
      ...current,
      [symbol]: writeEntryValue(
        current[symbol] ?? emptyEntryValues(),
        mode,
        quantity,
      ),
    }));
    setDirty(true);
    setMessage(null);
    resetForm();
  }

  function handleRemove(symbol: string) {
    setPositions((current) => current.filter((position) => position.symbol !== symbol));
    if (editingSymbol === symbol) resetForm();
    setDirty(true);
    setMessage(null);
  }

  /**
   * F79: usa las posiciones detectadas en una captura. La cantidad y el
   * costo promedio salen de lo que se leyó (cantidad y monto÷cantidad); lo
   * que no apareció en la imagen queda vacío, no se inventa. Guardar sigue
   * siendo la acción normal del editor.
   */
  function handleDetectedPositions(detected: DetectedPosition[]) {
    const rows = toEditableRows(detected);
    setPositions((current) => {
      const existing = new Map(
        current.map((position) => [position.symbol.toUpperCase(), position]),
      );
      return rows.map((row) => {
        // Si el símbolo ya estaba en la cartera, se conserva su precio.
        const previous = existing.get(row.symbol);
        return {
          symbol: row.symbol,
          name: previous?.name ?? "",
          quantity: row.quantity,
          avgCost: row.avgCost,
          currency: row.currency,
          market: previous?.market ?? null,
          price: previous?.price ?? null,
          priceDate: previous?.priceDate ?? null,
          weight: previous?.weight ?? null,
        } satisfies EditablePosition;
      });
    });
    // F78: el modo y los valores salen de lo detectado (acciones, monto o %).
    const entry = detectedToEntryRows(detected);
    setEntryValues(Object.fromEntries(entry.rows.map((row) => [row.symbol, row.values])));
    setMode(entry.mode);
    setDirty(true);
    setMessage({
      type: "success",
      text: `${rows.length} posición${rows.length === 1 ? "" : "es"} lista${rows.length === 1 ? "" : "s"}. Revísalas y guarda la cartera.`,
    });
  }

  async function handleSave() {
    setPending(true);

    if (positions.length === 0) {
      const cleared = await clearUserHoldings();
      setPending(false);
      if (cleared.error) {
        setMessage({ type: "error", text: cleared.error });
        return;
      }
      setDirty(false);
      setMessage({ type: "success", text: cleared.success ?? "Cartera guardada." });
      router.refresh();
      return;
    }

    // F78: cada posición se envía con el valor del modo vigente. El servidor
    // convierte con el último precio y calcula el peso.
    const rows = positions.map((position) => {
      const values = entryValues[position.symbol] ?? emptyEntryValues();
      const value = readEntryValue(values, mode);
      return {
        symbol: position.symbol,
        name: position.name,
        value: value ?? 0,
        quantity: position.quantity ?? undefined,
        avg_cost: position.avgCost ?? undefined,
        currency: position.currency,
        market: position.market ?? undefined,
      };
    });

    const missing = rows.filter((row) => row.value <= 0);
    if (missing.length > 0) {
      setPending(false);
      setMessage({
        type: "error",
        text: `Completa ${VALUE_LABEL[mode].toLowerCase()} de ${missing.map((row) => row.symbol).join(", ")}.`,
      });
      return;
    }

    const fxValue = parseNumber(fx);
    const result = await saveHoldingsByMode({
      mode,
      rows,
      fx: fxValue !== null && fxValue > 0 ? fxValue : undefined,
    });
    setPending(false);

    if (result.error) {
      setMessage({ type: "error", text: result.error });
      return;
    }
    setDirty(false);
    setMessage({ type: "success", text: result.success ?? "Cartera guardada." });
    router.refresh();
  }

  const usesFx = mode === "shares";

  return (
    <div className="flex flex-col gap-6">
      {/* Valorización: una tira de KPIs con filetes de 1px. */}
      <section aria-label="Valorización de la cartera" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <h2 className="text-[13px] font-normal leading-none text-ink-500">
            Valorización
          </h2>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link
              href="/compare"
              className="inline-flex items-center gap-1.5 text-[13px] text-ink-700 underline-offset-4 hover:text-ink-900 hover:underline"
            >
              <Upload className="size-3.5" strokeWidth={1.5} />
              Importar CSV
            </Link>
            <ExportCsvButton rows={rows} enabled={canExportCsv} />
          </div>
        </div>

        <div className="border border-ink-200 bg-white">
          <div className="flex flex-col divide-y divide-ink-200 sm:flex-row sm:divide-x sm:divide-y-0">
            {valuation.totals.length === 0 ? (
              <div className="min-w-0 flex-1 p-4 sm:p-5">
                <p className={KPI_LABEL}>Valor total</p>
                <p className="mt-2 text-[13px] text-ink-400">
                  Sin posiciones valorizadas todavía
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-500">
                  Agrega una posición para ver su valor y su P&amp;L.
                </p>
              </div>
            ) : (
              valuation.totals.map((total) => {
                const pnlClass =
                  total.pnl === 0
                    ? "text-ink-900"
                    : total.pnl > 0
                      ? "text-positive"
                      : "text-negative";
                return (
                  <div key={total.currency} className="min-w-0 flex-1 p-4 sm:p-5">
                    <p className={KPI_LABEL}>Valor total · {total.currency}</p>
                    {total.pricedPositions === 0 ? (
                      <p className="mt-2 text-[13px] text-ink-400">Sin precios disponibles</p>
                    ) : (
                      <p className="num mt-2 text-[24px] leading-none tracking-[-0.02em] text-ink-900">
                        {formatMoney(total.totalValue, total.currency)}
                      </p>
                    )}
                    <p className="mt-3 flex flex-wrap items-baseline gap-x-1.5 text-[12px] text-ink-500">
                      <span>P&amp;L acumulado</span>
                      {total.pnl === 0 && total.pnlPct === null ? (
                        <span className="text-ink-400">Sin base de costo</span>
                      ) : (
                        <>
                          <span className={`num font-medium ${pnlClass}`}>
                            {formatMoney(total.pnl, total.currency)}
                          </span>
                          {total.pnlPct !== null && (
                            <span className={`num font-medium ${pnlClass}`}>
                              {formatPercent(total.pnlPct, true)}
                            </span>
                          )}
                        </>
                      )}
                    </p>
                    <p className="mt-1 text-[11px] text-ink-400">
                      {total.pricedPositions} con precio · {total.missingPrices} sin precio
                    </p>
                  </div>
                );
              })
            )}

            <div className="min-w-0 p-4 sm:w-[220px] sm:shrink-0 sm:p-5">
              <p className={KPI_LABEL}>Posiciones</p>
              <p className="num mt-2 text-[24px] leading-none tracking-[-0.02em] text-ink-900">
                {positions.length}
                <span className="text-[15px] text-ink-400"> / {maxPositions}</span>
              </p>
              <p className="mt-3 text-[12px] text-ink-500">
                Tu plan {planName} permite hasta {maxPositions}.
              </p>
            </div>
          </div>
        </div>
      </section>

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

      {/* Modo de ingreso (F78): un solo modo por cartera */}
      <EntryModeSelector mode={mode} onChange={setMode} disabled={pending} />

      {/* F79: importación desde una captura de la corredora (detrás de flag). */}
      {imageImportEnabled && (
        <PortfolioImageImport
          onUse={handleDetectedPositions}
          maxPositions={maxPositions}
        />
      )}

      {/* Alta / edición */}
      <section className="border border-ink-200 bg-white">
        <div className="border-b border-ink-200 p-5 sm:p-6">
          <h2 className="text-[15px] font-medium leading-snug tracking-[-0.01em] text-ink-900">
            {editingSymbol ? `Editar ${editingSymbol}` : "Agregar posición"}
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500">
            {editingSymbol
              ? "Cambia cantidad, costo, moneda o mercado y guarda la cartera."
              : "Ticker, cantidad, costo promedio, moneda y mercado. El peso se calcula al guardar."}
          </p>
        </div>
        <div className="p-5 sm:p-6">
          <form onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-5">
            <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="min-w-0">
                <Input
                  label="Ticker"
                  name="symbol"
                  value={form.symbol}
                  onChange={(event) => updateField("symbol", event.target.value)}
                  placeholder="AAPL"
                  maxLength={20}
                  autoComplete="off"
                  required
                />
              </div>
              <div className="min-w-0">
                <Input
                  label={VALUE_LABEL[mode]}
                  name="quantity"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  value={form.quantity}
                  onChange={(event) => updateField("quantity", event.target.value)}
                  placeholder={VALUE_PLACEHOLDER[mode]}
                />
              </div>
              <div className="min-w-0">
                <Input
                  label="Costo promedio"
                  name="avg_cost"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  value={form.cost}
                  onChange={(event) => updateField("cost", event.target.value)}
                  placeholder="150.50"
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="currency" className="text-sm font-medium text-ink-900">
                  Moneda
                </label>
                <select
                  id="currency"
                  name="currency"
                  value={form.currency}
                  onChange={(event) =>
                    updateField("currency", event.target.value as "USD" | "CLP")
                  }
                  className="h-11 w-full min-w-0 border border-ink-200 bg-white px-3 text-[15px] text-ink-900 transition-colors hover:border-ink-400 focus:border-ink-900 focus:outline-none"
                >
                  <option value="USD">USD</option>
                  <option value="CLP">CLP</option>
                </select>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="market" className="text-sm font-medium text-ink-900">
                  Mercado
                </label>
                <select
                  id="market"
                  name="market"
                  value={form.market}
                  onChange={(event) =>
                    updateField("market", event.target.value as DraftForm["market"])
                  }
                  className="h-11 w-full min-w-0 border border-ink-200 bg-white px-3 text-[15px] text-ink-900 transition-colors hover:border-ink-400 focus:border-ink-900 focus:outline-none"
                >
                  <option value="">Sin definir</option>
                  <option value="US">US</option>
                  <option value="CL">CL</option>
                </select>
              </div>
              {usesFx && (
                <div className="flex min-w-0 flex-col gap-1.5">
                  <label
                    htmlFor="portfolio-fx"
                    className="text-sm font-medium text-ink-900"
                  >
                    Tipo de cambio
                  </label>
                  <input
                    id="portfolio-fx"
                    type="number"
                    min={0}
                    step={1}
                    value={fx}
                    onChange={(event) => setFx(event.target.value)}
                    placeholder="950"
                    className="h-11 w-full min-w-0 border border-ink-200 bg-white px-3 num text-[15px] text-ink-900 transition-colors hover:border-ink-400 focus:border-ink-900 focus:outline-none"
                  />
                  <p className="text-xs leading-relaxed text-ink-500">
                    CLP por USD. Solo si mezclas ambas monedas.
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-ink-200 pt-4">
              <Button type="submit" size="sm" variant={editingSymbol ? "outline" : "primary"}>
                <Plus className="size-4" strokeWidth={1.5} />
                {editingSymbol ? "Aplicar cambio" : "Agregar"}
              </Button>
              {editingSymbol && (
                <Button type="button" size="sm" variant="ghost" onClick={resetForm}>
                  Cancelar
                </Button>
              )}
              <span className="text-[12px] text-ink-500">
                Los precios son el cierre más reciente disponible (EOD).
              </span>
            </div>
          </form>
        </div>
      </section>

      {/* Barra de cambios sin guardar: visible en escritorio y móvil. */}
      {dirty && (
        <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 flex flex-col gap-3 border border-ink-900 bg-white p-3 sm:flex-row sm:items-center sm:justify-between sm:px-4 lg:bottom-4">
          <p className="text-[13px] leading-relaxed text-ink-700">
            <span className="font-medium text-ink-900">Cambios sin guardar.</span>{" "}
            {positions.length === 0
              ? "Guardar deja tu cartera sin posiciones."
              : "Se aplican a tu cartera completa."}
          </p>
          <Button
            type="button"
            onClick={handleSave}
            loading={pending}
            size="md"
            className="w-full sm:w-auto"
          >
            <Save className="size-4" strokeWidth={1.5} />
            {positions.length === 0 ? "Borrar cartera" : "Guardar cambios"}
          </Button>
        </div>
      )}

      {/* Tabla */}
      <section className="border border-ink-200 bg-white">
        <div className="flex flex-col gap-1 border-b border-ink-200 p-5 sm:p-6">
          <h2 className="text-[15px] font-medium leading-snug tracking-[-0.01em] text-ink-900">
            Posiciones
          </h2>
          <p className="text-[13px] leading-relaxed text-ink-500">
            Valor y P&amp;L por moneda; CLP y USD no se convierten y el peso se
            calcula dentro de cada moneda.
          </p>
        </div>
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <PositionsTable
            rows={rows}
            disabled={pending}
            onEdit={startEdit}
            onRemove={handleRemove}
          />

          {missingPrices > 0 && (
            <p className="text-[12px] leading-relaxed text-ink-500">
              {missingPrices === 1
                ? "Una posición no tiene precio en la base todavía"
                : `${missingPrices} posiciones no tienen precio en la base todavía`}
              . Su valor y P&amp;L quedan fuera hasta que exista un cierre.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
