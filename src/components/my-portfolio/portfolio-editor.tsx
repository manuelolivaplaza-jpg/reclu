"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PositionsTable } from "@/components/my-portfolio/positions-table";
import { ExportCsvButton } from "@/components/my-portfolio/export-csv-button";
import { EntryModeSelector } from "@/components/my-portfolio/entry-mode-selector";
import { PortfolioImageImport } from "@/components/portfolio-image-import";
import { detectedToEntryRows } from "@/lib/portfolio-image-entry";
import { formatMoney, formatPercent } from "@/components/my-portfolio/format";
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
import { clearUserHoldings } from "@/app/actions/holdings";
import { saveHoldingsByMode } from "@/app/actions/holdings-entry";

const SYMBOL_PATTERN = /^[A-Z0-9.\-]{1,20}$/;

/** Rótulo de KPI: 13px gris de apoyo, sin mayúsculas forzadas (diseño). */
const KPI_LABEL = "text-[13px] font-normal leading-snug text-ink-500";
const LABEL_CLASS = "text-sm font-medium tracking-[-0.01em] text-ink-900";
const SELECT_CLASS =
  "h-11 min-h-11 w-full min-w-0 rounded-none border border-line bg-canvas px-3 text-[15px] text-ink-900 transition-colors hover:border-ink-400 focus:border-ink-900 focus:outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-ink-900 disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-500";

interface DraftForm {
  symbol: string;
  quantity: string;
  cost: string;
  currency: "USD" | "CLP";
  market: "" | "US" | "CL";
}

type FieldKey = "symbol" | "quantity" | "cost";

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

const VALUE_HINT: Record<HoldingEntryMode, string> = {
  shares: "Se valoriza con el último precio disponible.",
  amount: "Solo en USD. Las acciones se calculan con el precio.",
  percentage: "Los pesos se normalizan a 100% al guardar.",
};

/** Frase del modo para copy y errores: encaja tras "Ticker y" o "Ingresa". */
const VALUE_PHRASE: Record<HoldingEntryMode, string> = {
  shares: "cantidad de acciones",
  amount: "monto en USD",
  percentage: "peso",
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

function entryValuesFrom(
  positions: EditablePosition[],
): Record<string, HoldingEntryValues> {
  const values: Record<string, HoldingEntryValues> = {};
  for (const position of positions) {
    values[position.symbol] = {
      ...emptyEntryValues(),
      shares: position.quantity,
      percentage: position.weight,
    };
  }
  return values;
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
  // F78: un solo modo por cartera. Cada posición guarda el valor de los tres
  // modos para que cambiar de modo no borre lo ya tipeado.
  const [entryValues, setEntryValues] = useState<Record<string, HoldingEntryValues>>(
    () => entryValuesFrom(initialPositions),
  );
  // Tras guardar, el servidor vuelve a mandar las posiciones con su precio más
  // reciente (router.refresh). Patrón de React para ajustar estado cuando
  // cambian las props, sin un efecto que dispare renders en cascada.
  const [syncedInitial, setSyncedInitial] = useState(initialPositions);
  if (syncedInitial !== initialPositions) {
    setSyncedInitial(initialPositions);
    setPositions(initialPositions);
    setEntryValues(entryValuesFrom(initialPositions));
  }
  const [form, setForm] = useState<DraftForm>(EMPTY_FORM);
  const [editingSymbol, setEditingSymbol] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [pending, setPending] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [mode, setMode] = useState<HoldingEntryMode>("shares");
  const [fx, setFx] = useState("");
  const [fxError, setFxError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );

  const symbolRef = useRef<HTMLInputElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const costRef = useRef<HTMLInputElement>(null);
  const fxRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);
  const cancelClearRef = useRef<HTMLButtonElement>(null);
  const clearTriggerRef = useRef<HTMLButtonElement>(null);

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

  const atLimit = !editingSymbol && positions.length >= maxPositions;

  function focusField(key: FieldKey) {
    const refs = { symbol: symbolRef, quantity: quantityRef, cost: costRef };
    refs[key].current?.focus();
  }

  function showMessage(type: "success" | "error", text: string) {
    setMessage({ type, text });
    // El aviso puede quedar fuera del viewport: se lleva el foco para que el
    // lector de pantalla lo anuncie y el teclado no se pierda al guardar.
    requestAnimationFrame(() => messageRef.current?.focus());
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingSymbol(null);
    setFieldErrors({});
  }

  function cancelEdit() {
    resetForm();
    // El botón Cancelar desaparece al salir de edición: el foco vuelve al form.
    requestAnimationFrame(() => symbolRef.current?.focus());
  }

  function updateField<K extends keyof DraftForm>(key: K, value: DraftForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    if (key === "symbol" || key === "quantity" || key === "cost") {
      const field: FieldKey = key;
      setFieldErrors((current) => {
        if (!current[field]) return current;
        const next = { ...current };
        delete next[field];
        return next;
      });
    }
  }

  function handleModeChange(next: HoldingEntryMode) {
    if (next === mode) return;
    setMode(next);
    setFieldErrors({});
    setMessage(null);
    setFxError(null);
    // El número cambia de significado al cambiar de modo: no se arrastra.
    setForm((current) => (current.quantity === "" ? current : { ...current, quantity: "" }));
  }

  function startEdit(symbol: string) {
    const position = positions.find((row) => row.symbol === symbol);
    if (!position) return;
    setEditingSymbol(symbol);
    const values = entryValues[symbol] ?? emptyEntryValues();
    const currentValue = readEntryValue(values, mode);
    setForm({
      symbol: position.symbol,
      // El campo principal muestra el valor del modo vigente (F78).
      quantity:
        currentValue !== null
          ? String(currentValue)
          : mode === "shares" && position.quantity !== null
            ? String(position.quantity)
            : "",
      cost: position.avgCost === null ? "" : String(position.avgCost),
      currency: position.currency,
      market: position.market ?? "",
    });
    setFieldErrors({});
    setConfirmClear(false);
    setMessage(null);
    requestAnimationFrame(() => {
      quantityRef.current?.focus();
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const symbol = form.symbol.trim().toUpperCase();
    const nextErrors: Partial<Record<FieldKey, string>> = {};

    if (symbol === "") {
      nextErrors.symbol = "Escribe el ticker de la posición.";
    } else if (!SYMBOL_PATTERN.test(symbol)) {
      nextErrors.symbol =
        "Ticker inválido: hasta 20 caracteres entre letras, números, punto y guion.";
    }

    const quantity = parseNumber(form.quantity);
    if (form.quantity.trim() !== "" && quantity === null) {
      nextErrors.quantity = "Escribe un número válido.";
    } else if (quantity !== null && quantity <= 0) {
      nextErrors.quantity = "El valor debe ser mayor que 0.";
    }

    const avgCost = parseNumber(form.cost);
    if (form.cost.trim() !== "" && avgCost === null) {
      nextErrors.cost = "Escribe un número válido.";
    } else if (avgCost !== null && avgCost < 0) {
      nextErrors.cost = "El costo promedio no puede ser negativo.";
    }

    if (symbol !== "" && !nextErrors.symbol) {
      const duplicate = positions.some(
        (position) =>
          position.symbol.toUpperCase() === symbol &&
          position.symbol.toUpperCase() !== editingSymbol?.toUpperCase(),
      );
      if (duplicate) {
        nextErrors.symbol = `${symbol} ya está en tu cartera. Edítalo en la tabla.`;
      }
    }

    const firstError = (["symbol", "quantity", "cost"] as const).find(
      (key) => nextErrors[key],
    );
    if (firstError) {
      setFieldErrors(nextErrors);
      setMessage(null);
      requestAnimationFrame(() => focusField(firstError));
      return;
    }

    if (atLimit) {
      showMessage(
        "error",
        `Alcanzaste el límite de ${maxPositions} posiciones de tu plan ${planName}.`,
      );
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
    setConfirmClear(false);
    setFieldErrors({});
    setMessage(null);
    resetForm();
    requestAnimationFrame(() => symbolRef.current?.focus());
  }

  function handleRemove(symbol: string) {
    setPositions((current) => current.filter((position) => position.symbol !== symbol));
    // El valor tipeado no sobrevive al borrado: si el símbolo vuelve, entra limpio.
    setEntryValues((current) => {
      if (!(symbol in current)) return current;
      const next = { ...current };
      delete next[symbol];
      return next;
    });
    if (editingSymbol === symbol) {
      resetForm();
      requestAnimationFrame(() => symbolRef.current?.focus());
    }
    setDirty(true);
    setConfirmClear(false);
    setMessage(null);
  }

  /**
   * F79: usa las posiciones detectadas en una captura. La cantidad y el
   * costo promedio salen de lo que se leyó (cantidad y monto÷cantidad); lo
   * que no apareció en la imagen queda vacío, no se inventa. Guardar sigue
   * siendo la acción normal del editor.
   */
  function handleDetectedPositions(detected: DetectedPosition[]) {
    const detectedRows = toEditableRows(detected);
    setPositions((current) => {
      const existing = new Map(
        current.map((position) => [position.symbol.toUpperCase(), position]),
      );
      return detectedRows.map((row) => {
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
    setFieldErrors({});
    setFxError(null);
    resetForm();
    setDirty(true);
    setConfirmClear(false);
    setMessage({
      type: "success",
      text: `${detectedRows.length} posición${detectedRows.length === 1 ? "" : "es"} lista${detectedRows.length === 1 ? "" : "s"}. Revísalas y guarda la cartera.`,
    });
  }

  async function savePositions() {
    setPending(true);
    setFxError(null);
    setMessage(null);
    try {
      if (positions.length === 0) {
        const cleared = await clearUserHoldings();
        if (cleared.error) {
          showMessage("error", cleared.error);
          return;
        }
        setDirty(false);
        setConfirmClear(false);
        showMessage("success", cleared.success ?? "Cartera eliminada.");
        router.refresh();
        return;
      }

      // F78: cada posición se envía con el valor del modo vigente. El servidor
      // convierte con el último precio y calcula el peso.
      const rowsToSave = positions.map((position) => {
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

      const missing = rowsToSave.filter((row) => row.value <= 0);
      if (missing.length > 0) {
        showMessage(
          "error",
          `Ingresa ${VALUE_PHRASE[mode]} para ${missing.map((row) => row.symbol).join(", ")}.`,
        );
        return;
      }

      const fxValue = parseNumber(fx);
      const result = await saveHoldingsByMode({
        mode,
        rows: rowsToSave,
        fx: fxValue !== null && fxValue > 0 ? fxValue : undefined,
      });

      if (result.error) {
        if (/tipo de cambio/i.test(result.error)) {
          setFxError(result.error);
          requestAnimationFrame(() => fxRef.current?.focus());
          return;
        }
        showMessage("error", result.error);
        return;
      }
      setDirty(false);
      setConfirmClear(false);
      showMessage("success", result.success ?? "Cartera guardada.");
      router.refresh();
    } catch {
      showMessage(
        "error",
        "No pudimos guardar la cartera. Revisa tu conexión e inténtalo de nuevo.",
      );
    } finally {
      setPending(false);
    }
  }

  function requestSave() {
    if (positions.length === 0) {
      setConfirmClear(true);
      requestAnimationFrame(() => cancelClearRef.current?.focus());
      return;
    }
    void savePositions();
  }

  function cancelClear() {
    setConfirmClear(false);
    requestAnimationFrame(() => clearTriggerRef.current?.focus());
  }

  const usesFx = mode === "shares";

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {/* Valorización: una tira de KPIs con filetes de 1px. */}
      <section aria-labelledby="valuation-title" className="flex min-w-0 flex-col gap-3">
        <div className="min-w-0">
          <h2
            id="valuation-title"
            className="text-[17px] font-medium leading-snug tracking-[-0.01em] text-ink-900"
          >
            Valorización
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-500">
            Con el último cierre disponible. CLP y USD no se convierten: cada
            moneda se suma por separado.
          </p>
        </div>

        <div className="min-w-0 border border-line bg-canvas">
          <div className="flex min-w-0 flex-col divide-y divide-ink-200 sm:flex-row sm:divide-x sm:divide-y-0">
            {valuation.totals.length === 0 ? (
              <div className="min-w-0 flex-1 p-4 sm:p-5">
                <p className={KPI_LABEL}>Valor total</p>
                <p className="mt-2 text-[15px] leading-snug text-ink-900">
                  Sin posiciones todavía
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-500">
                  Agrega la primera abajo para ver su valor y su P&amp;L.
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
                const group = valuation.positions.filter(
                  (position) => position.currency === total.currency,
                );
                const valued = group.filter((position) => position.value !== null).length;
                const withoutPrice = group.filter(
                  (position) => position.price === null,
                ).length;
                const withoutQuantity = group.filter(
                  (position) => position.price !== null && position.value === null,
                ).length;
                // Posiciones con valor pero sin P&L %: su P&L queda fuera del
                // porcentaje, y la cobertura lo dice para no aparentar una cifra completa.
                const withoutCost = group.filter(
                  (position) => position.value !== null && position.pnlPct === null,
                ).length;
                const coverage = [
                  valued > 0
                    ? `${valued} ${
                        valued === 1 ? "posición valorizada" : "posiciones valorizadas"
                      }`
                    : null,
                  withoutPrice > 0 ? `${withoutPrice} sin precio` : null,
                  withoutQuantity > 0 ? `${withoutQuantity} sin cantidad` : null,
                  withoutCost > 0 ? `${withoutCost} sin costo` : null,
                ]
                  .filter(Boolean)
                  .join(" · ");

                return (
                  <div key={total.currency} className="min-w-0 flex-1 p-4 sm:p-5">
                    <p className={KPI_LABEL}>Valor total · {total.currency}</p>
                    {valued === 0 ? (
                      <>
                        <p className="mt-2 text-[15px] leading-snug text-ink-500">
                          Sin valor todavía
                        </p>
                        <p className="mt-1 text-[12px] leading-relaxed text-ink-500">
                          {withoutPrice > 0
                            ? "Falta un cierre en la base para valorizar las posiciones."
                            : "Falta la cantidad de las posiciones."}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="num mt-2 text-[24px] leading-none text-ink-900">
                          {formatMoney(total.totalValue, total.currency)}
                        </p>
                        <p className="mt-3 flex flex-wrap items-baseline gap-x-1.5 text-[12px] text-ink-500">
                          <span>P&amp;L acumulado</span>
                          {total.pnl === 0 && total.pnlPct === null ? (
                            <span className="text-ink-500">Sin base de costo</span>
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
                      </>
                    )}
                    <p className="mt-2 text-[12px] leading-relaxed text-ink-500">
                      {coverage}
                    </p>
                  </div>
                );
              })
            )}

            <div className="min-w-0 p-4 sm:w-[200px] sm:shrink-0 sm:p-5">
              <p className={KPI_LABEL}>Posiciones</p>
              <p className="num mt-2 text-[24px] leading-none text-ink-900">
                {positions.length}
                <span className="text-[15px] text-ink-500"> / {maxPositions}</span>
              </p>
              <p className="mt-3 text-[12px] leading-relaxed text-ink-500">
                {positions.length >= maxPositions
                  ? `Llegaste al tope de tu plan ${planName}.`
                  : `Tu plan ${planName} permite hasta ${maxPositions}.`}
              </p>
            </div>
          </div>
        </div>
      </section>

      {message && (
        <p
          ref={messageRef}
          tabIndex={-1}
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

      {/* Modo de ingreso (F78): un solo modo por cartera */}
      <EntryModeSelector mode={mode} onChange={handleModeChange} disabled={pending} />

      {/* F79: importación desde una captura de la corredora (detrás de flag). */}
      {imageImportEnabled && (
        <PortfolioImageImport
          onUse={handleDetectedPositions}
          maxPositions={maxPositions}
        />
      )}

      {/* Alta / edición */}
      <section
        aria-labelledby="position-form-title"
        aria-busy={pending}
        className="min-w-0 border border-line bg-canvas"
      >
        <div className="border-b border-line p-5 sm:p-6">
          <h2
            id="position-form-title"
            className="text-[17px] font-medium leading-snug tracking-[-0.01em] text-ink-900"
          >
            {editingSymbol ? `Editar ${editingSymbol}` : "Agregar posición"}
          </h2>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-ink-500">
            {editingSymbol
              ? "Ajusta el valor, el costo, la moneda o el mercado. El cambio se aplica cuando guardas la cartera."
              : `Ticker y ${VALUE_PHRASE[mode]}. El costo promedio es opcional.`}
          </p>
        </div>

        <div className="p-5 sm:p-6">
          <form onSubmit={handleSubmit} noValidate className="min-w-0">
            <fieldset
              disabled={pending}
              className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0"
            >
              <legend className="sr-only">Datos de la posición</legend>

              <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Input
                  ref={symbolRef}
                  id="position-symbol"
                  name="symbol"
                  label="Ticker"
                  value={form.symbol}
                  onChange={(event) => updateField("symbol", event.target.value)}
                  placeholder="AAPL"
                  maxLength={20}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  required
                  error={fieldErrors.symbol}
                  hint="Hasta 20 caracteres: letras, números, punto o guion."
                />

                <Input
                  ref={quantityRef}
                  id="position-value"
                  name="quantity"
                  label={VALUE_LABEL[mode]}
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  value={form.quantity}
                  onChange={(event) => updateField("quantity", event.target.value)}
                  placeholder={VALUE_PLACEHOLDER[mode]}
                  error={fieldErrors.quantity}
                  hint={VALUE_HINT[mode]}
                />

                <Input
                  ref={costRef}
                  id="position-cost"
                  name="avg_cost"
                  label="Costo promedio"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  value={form.cost}
                  onChange={(event) => updateField("cost", event.target.value)}
                  placeholder="150.50"
                  error={fieldErrors.cost}
                  hint="Opcional. En la moneda de la posición."
                />

                <div className="flex min-w-0 flex-col gap-1.5">
                  <label htmlFor="position-currency" className={LABEL_CLASS}>
                    Moneda
                  </label>
                  <select
                    id="position-currency"
                    name="currency"
                    value={form.currency}
                    onChange={(event) =>
                      updateField("currency", event.target.value as "USD" | "CLP")
                    }
                    aria-describedby={
                      mode === "amount" && form.currency === "CLP"
                        ? "position-currency-warning"
                        : undefined
                    }
                    className={SELECT_CLASS}
                  >
                    <option value="USD">USD</option>
                    <option value="CLP">CLP</option>
                  </select>
                  {mode === "amount" && form.currency === "CLP" && (
                    <p
                      id="position-currency-warning"
                      className="text-xs leading-relaxed text-negative"
                    >
                      En modo monto las posiciones van solo en USD. Cambia la
                      moneda o ingresa por cantidad o porcentaje.
                    </p>
                  )}
                </div>

                <div className="flex min-w-0 flex-col gap-1.5">
                  <label htmlFor="position-market" className={LABEL_CLASS}>
                    Mercado
                  </label>
                  <select
                    id="position-market"
                    name="market"
                    value={form.market}
                    onChange={(event) =>
                      updateField("market", event.target.value as DraftForm["market"])
                    }
                    aria-describedby="position-market-hint"
                    className={SELECT_CLASS}
                  >
                    <option value="">Sin definir</option>
                    <option value="US">US</option>
                    <option value="CL">CL</option>
                  </select>
                  <p
                    id="position-market-hint"
                    className="text-xs leading-relaxed text-ink-500"
                  >
                    Ayuda a buscar el precio correcto.
                  </p>
                </div>

                {usesFx && (
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <label htmlFor="position-fx" className={LABEL_CLASS}>
                      Tipo de cambio
                    </label>
                    <input
                      ref={fxRef}
                      id="position-fx"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={1}
                      value={fx}
                      onChange={(event) => {
                        setFx(event.target.value);
                        setFxError(null);
                      }}
                      placeholder="950"
                      aria-invalid={fxError ? true : undefined}
                      aria-describedby={
                        fxError
                          ? "position-fx-hint position-fx-error"
                          : "position-fx-hint"
                      }
                      className={`num ${SELECT_CLASS}`}
                    />
                    <p
                      id="position-fx-hint"
                      className="text-xs leading-relaxed text-ink-500"
                    >
                      CLP por USD. Solo si tu cartera mezcla ambas monedas.
                    </p>
                    {fxError && (
                      <p
                        id="position-fx-error"
                        role="alert"
                        className="text-xs font-medium leading-relaxed text-negative"
                      >
                        {fxError}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {atLimit && (
                <p className="text-[12px] leading-relaxed text-ink-500">
                  Alcanzaste el límite de {maxPositions} posiciones de tu plan{" "}
                  {planName}. Edita o quita una posición para agregar otra.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line pt-4">
                <Button
                  type="submit"
                  size="md"
                  variant={editingSymbol ? "outline" : "primary"}
                  disabled={atLimit}
                >
                  {editingSymbol ? (
                    <Check className="size-4" strokeWidth={1.5} aria-hidden />
                  ) : (
                    <Plus className="size-4" strokeWidth={1.5} aria-hidden />
                  )}
                  {editingSymbol ? "Aplicar cambio" : "Agregar"}
                </Button>
                {editingSymbol && (
                  <Button type="button" size="md" variant="ghost" onClick={cancelEdit}>
                    Cancelar
                  </Button>
                )}
                <p className="text-[12px] leading-relaxed text-ink-500">
                  Los precios son el cierre más reciente disponible (EOD).
                </p>
              </div>
            </fieldset>
          </form>
        </div>
      </section>

      {/* Barra de cambios sin guardar: visible en escritorio y móvil. */}
      {dirty && (
        <div
          role="group"
          aria-label="Cambios sin guardar"
          onKeyDown={(event) => {
            if (confirmClear && event.key === "Escape") {
              event.preventDefault();
              cancelClear();
            }
          }}
          className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 border border-ink-900 bg-canvas p-3 sm:p-4 lg:bottom-4"
        >
          {confirmClear ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div role="alert" className="min-w-0">
                <p className="text-[13px] font-medium leading-snug text-ink-900">
                  ¿Borrar tu cartera completa?
                </p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-500">
                  Se eliminarán todas las posiciones guardadas. No se puede deshacer.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  type="button"
                  onClick={() => void savePositions()}
                  loading={pending}
                  className="w-full sm:w-auto"
                >
                  Sí, borrar cartera
                </Button>
                <Button
                  ref={cancelClearRef}
                  type="button"
                  variant="ghost"
                  onClick={cancelClear}
                  disabled={pending}
                  className="w-full sm:w-auto"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[13px] leading-relaxed text-ink-700">
                <span className="font-medium text-ink-900">Cambios sin guardar.</span>{" "}
                {positions.length === 0
                  ? "Guardar deja tu cartera sin posiciones."
                  : positions.length === 1
                    ? "Se aplican a la única posición de tu cartera."
                    : `Se aplican a las ${positions.length} posiciones de tu cartera.`}
              </p>
              {positions.length === 0 ? (
                <Button
                  ref={clearTriggerRef}
                  type="button"
                  variant="outline"
                  onClick={requestSave}
                  disabled={pending}
                  className="w-full sm:w-auto"
                >
                  Borrar cartera…
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={requestSave}
                  loading={pending}
                  className="w-full sm:w-auto"
                >
                  {!pending && <Save className="size-4" strokeWidth={1.5} aria-hidden />}
                  Guardar cambios
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tabla */}
      <section
        aria-labelledby="positions-title"
        aria-busy={pending}
        className="min-w-0 border border-line bg-canvas"
      >
        <div className="flex flex-col gap-3 border-b border-line p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div className="min-w-0">
            <h2
              id="positions-title"
              className="text-[17px] font-medium leading-snug tracking-[-0.01em] text-ink-900"
            >
              Posiciones
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500">
              Edita una posición en el formulario o quítala de la lista. Los
              cambios se aplican al guardar.
            </p>
          </div>
          <div className="sm:shrink-0">
            <ExportCsvButton rows={rows} enabled={canExportCsv} />
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-4 p-5 sm:p-6">
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
