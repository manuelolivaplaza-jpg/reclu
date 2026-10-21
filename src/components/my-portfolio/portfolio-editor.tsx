"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Save, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PositionsTable } from "@/components/my-portfolio/positions-table";
import { ExportCsvButton } from "@/components/my-portfolio/export-csv-button";
import {
  formatMoney,
  formatPercent,
} from "@/components/my-portfolio/format";
import type { EditablePosition, ValuedPositionRow } from "@/components/my-portfolio/types";
import { valuatePortfolio } from "@/lib/portfolio-valuation";
import {
  clearUserHoldings,
  saveUserHoldings,
} from "@/app/actions/holdings";

const SYMBOL_PATTERN = /^[A-Z0-9.\-]{1,20}$/;

interface DraftForm {
  symbol: string;
  quantity: string;
  cost: string;
  currency: "USD" | "CLP";
  market: "" | "US" | "CL";
}

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
 * Peso para `saveUserHoldings`: valor de mercado si hay precio, si no el
 * costo, y como último recurso la cantidad. `saveUserHoldings` lo normaliza a
 * 100 entre todas las posiciones, así que solo importa la proporción.
 */
function weightFor(position: EditablePosition): number {
  if (position.quantity === null || position.quantity <= 0) return 1;
  const basis = position.price ?? position.avgCost;
  if (basis !== null && basis > 0) return position.quantity * basis;
  return position.quantity;
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
}: {
  initialPositions: EditablePosition[];
  maxPositions: number;
  canExportCsv: boolean;
  planName: string;
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
    setForm({
      symbol: position.symbol,
      quantity: position.quantity === null ? "" : String(position.quantity),
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
      quantity,
      avgCost,
      currency: form.currency,
      market: nextMarket,
      // Si cambió el ticker, la moneda o el mercado, el precio anterior ya no aplica.
      price: sameContext ? (previous?.price ?? null) : null,
      priceDate: sameContext ? (previous?.priceDate ?? null) : null,
    };

    setPositions((current) =>
      editingSymbol
        ? current.map((position) =>
            position.symbol === editingSymbol ? next : position,
          )
        : [...current, next],
    );
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

  async function handleSave() {
    setPending(true);
    // `weight` va en % (0–100) porque el esquema lo valida así. Se reparte
    // según valor de mercado, costo o cantidad, y saveUserHoldings lo vuelve
    // a normalizar a 100.
    const rawWeights = positions.map(weightFor);
    const rawTotal = rawWeights.reduce((sum, weight) => sum + weight, 0);
    const weights = rawWeights.map((weight) =>
      rawTotal > 0 ? Math.min(100, Math.round((weight / rawTotal) * 10_000) / 100) : 0,
    );

    const result =
      positions.length === 0
        ? await clearUserHoldings()
        : await saveUserHoldings(
            positions.map((position, index) => ({
              symbol: position.symbol,
              name: position.name,
              quantity: position.quantity ?? undefined,
              avg_cost: position.avgCost ?? undefined,
              currency: position.currency,
              market: position.market ?? undefined,
              weight: weights[index] ?? 0,
            })),
          );
    setPending(false);

    if (result.error) {
      setMessage({ type: "error", text: result.error });
      return;
    }
    setDirty(false);
    setMessage({ type: "success", text: result.success ?? "Cartera guardada." });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Tope del plan y acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink-500">
          <span className="font-medium text-ink-900">
            {positions.length} de {maxPositions} posiciones
          </span>{" "}
          · plan {planName}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/compare"
            className="inline-flex items-center gap-2 text-[13px] text-ink-900 underline underline-offset-4"
          >
            <Upload className="size-4" strokeWidth={1.5} />
            Importar CSV
          </Link>
          <ExportCsvButton rows={rows} enabled={canExportCsv} />
        </div>
      </div>

      {message && (
        <p
          role={message.type === "error" ? "alert" : "status"}
          className={
            "text-sm font-medium " +
            (message.type === "error" ? "text-negative" : "text-positive")
          }
        >
          {message.text}
        </p>
      )}

      {/* Alta / edición */}
      <Card>
        <CardHeader>
          <CardTitle>{editingSymbol ? `Editar ${editingSymbol}` : "Agregar posición"}</CardTitle>
          <CardDescription>
            {editingSymbol
              ? "Cambia cantidad, costo, moneda o mercado y guarda la cartera."
              : "Ticker, cantidad, costo promedio, moneda y mercado. El peso se calcula al guardar."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
              <Input
                label="Cantidad"
                name="quantity"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={form.quantity}
                onChange={(event) => updateField("quantity", event.target.value)}
                placeholder="10"
              />
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
              <div className="flex flex-col gap-1.5">
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
                  className="h-11 w-full border border-ink-200 bg-white px-3 text-[15px] text-ink-900 focus:border-ink-900 focus:outline-none"
                >
                  <option value="USD">USD</option>
                  <option value="CLP">CLP</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
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
                  className="h-11 w-full border border-ink-200 bg-white px-3 text-[15px] text-ink-900 focus:border-ink-900 focus:outline-none"
                >
                  <option value="">Sin definir</option>
                  <option value="US">US</option>
                  <option value="CL">CL</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
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
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Posiciones</CardTitle>
              <CardDescription>
                Valor y P&amp;L por moneda; CLP y USD no se convierten y el peso
                se calcula dentro de cada moneda.
              </CardDescription>
            </div>
            <Button
              type="button"
              onClick={handleSave}
              loading={pending}
              size="sm"
              disabled={!dirty && positions.length > 0}
            >
              <Save className="size-4" strokeWidth={1.5} />
              {positions.length === 0 ? "Borrar cartera" : "Guardar cartera"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <PositionsTable
            rows={rows}
            disabled={pending}
            onEdit={startEdit}
            onRemove={handleRemove}
          />

          {dirty && (
            <p className="text-[12px] text-ink-500">
              Tienes cambios sin guardar. Se aplican a tu cartera completa.
            </p>
          )}

          {missingPrices > 0 && (
            <p className="text-[12px] leading-relaxed text-ink-500">
              {missingPrices === 1
                ? "Una posición no tiene precio en la base todavía"
                : `${missingPrices} posiciones no tienen precio en la base todavía`}
              . Su valor y P&amp;L quedan fuera hasta que exista un cierre.
            </p>
          )}

          {valuation.totals.length > 0 && (
            <div className="grid gap-px border border-ink-200 bg-ink-200 sm:grid-cols-2">
              {valuation.totals.map((total) => {
                const pnlClass =
                  total.pnl === 0
                    ? "text-ink-900"
                    : total.pnl > 0
                      ? "text-positive"
                      : "text-negative";
                return (
                  <div key={total.currency} className="bg-white p-4">
                    <p className="text-[12px] uppercase tracking-wide text-ink-500">
                      Total {total.currency}
                    </p>
                    {total.pricedPositions === 0 ? (
                      <p className="num mt-1 text-[22px] leading-none text-ink-500">
                        Sin precios
                      </p>
                    ) : (
                      <p className="num mt-1 text-[22px] leading-none text-ink-900">
                        {formatMoney(total.totalValue, total.currency)}
                      </p>
                    )}
                    <p className={`mt-2 text-[13px] tabular-nums ${pnlClass}`}>
                      {formatMoney(total.pnl, total.currency)} ·{" "}
                      {formatPercent(total.pnlPct, true)}
                    </p>
                    <p className="mt-1 text-[12px] text-ink-500">
                      {total.pricedPositions} con precio · {total.missingPrices} sin precio
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
