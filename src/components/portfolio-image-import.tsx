"use client";

import { useRef, useState } from "react";
import { Camera, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DETECTED_SYMBOL_PATTERN,
  type DetectedPosition, AMOUNT_USD_MESSAGE, amountCurrencyProblems } from "@/lib/portfolio-image-rows";

/**
 * Importación de cartera desde una captura de la corredora (F79).
 *
 * El componente NO guarda la imagen: la manda a `/api/holdings/image`, que
 * la procesa y la descarta. Aquí solo se muestran las posiciones detectadas,
 * que el usuario puede corregir y borrar antes de'usar'. Guardar la cartera
 * sigue siendo la acción normal del editor (nunca se guarda solo).
 */

interface PortfolioImageImportProps {
  /** Callback con las posiciones ya revisadas por el usuario. */
  onUse: (positions: DetectedPosition[]) => void;
  /** Tope de posiciones del editor: avisa antes de llenarlo de más. */
  maxPositions?: number;
}

/** Fila editable: los valores se guardan como texto para no perder lo escrito. */
interface DraftRow {
  symbol: string;
  quantity: string;
  amount: string;
  weight: string;
  currency: "USD" | "CLP" | "";
  /** El monto detectado no venia en USD: hay que corregirlo. */
  amountNeedsUsd: boolean;
}

/** Convierte texto a número: vacío o inválido se guarda como null. */
function toNumber(text: string): number | null {
  const trimmed = text.trim().replace(",", ".");
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

function toDraft(position: DetectedPosition): DraftRow {
  return {
    symbol: position.symbol,
    quantity: position.quantity === null ? "" : String(position.quantity),
    amount: position.amount === null ? "" : String(position.amount),
    weight: position.weight === null ? "" : String(position.weight),
    currency: position.currency ?? "",
    amountNeedsUsd: position.amountNeedsUsd === true,
  };
}

function fromDraft(row: DraftRow): DetectedPosition | null {
  const symbol = row.symbol.trim().toUpperCase();
  if (!DETECTED_SYMBOL_PATTERN.test(symbol)) return null;
  const quantity = toNumber(row.quantity);
  const amount = toNumber(row.amount);
  const weight = toNumber(row.weight);
  return {
    symbol,
    quantity: quantity !== null && quantity > 0 ? quantity : null,
    amount: amount !== null && amount > 0 ? amount : null,
    weight: weight !== null && weight >= 0 && weight <= 100 ? weight : null,
    currency: row.currency === "" ? null : row.currency,
    ...(row.amountNeedsUsd ? { amountNeedsUsd: true } : {}),
  };
}

export function PortfolioImageImport({
  onUse,
  maxPositions,
}: PortfolioImageImportProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );
  const [rows, setRows] = useState<DraftRow[]>([]);

  async function handleFile(file: File) {
    setLoading(true);
    setMessage(null);
    setRows([]);

    const form = new FormData();
    form.append("file", file);

    let response: Response;
    try {
      response = await fetch("/api/holdings/image", { method: "POST", body: form });
    } catch {
      setLoading(false);
      setMessage({ type: "error", text: "No pudimos subir la imagen. Intenta de nuevo." });
      return;
    }
    setLoading(false);

    const payload = (await response.json().catch(() => null)) as
      | {
          positions?: DetectedPosition[];
          discarded?: number;
          error?: string;
        }
      | null;

    if (!response.ok) {
      setMessage({
        type: "error",
        text: payload?.error ?? "No pudimos leer la captura. Intenta de nuevo.",
      });
      return;
    }

    const positions = payload?.positions ?? [];
    if (positions.length === 0) {
      setMessage({ type: "error", text: "No encontramos posiciones en la captura." });
      return;
    }

    setRows(positions.map(toDraft));
    const discarded = payload?.discarded ?? 0;
    setMessage({
      type: "success",
      text:
        `Leímos ${positions.length} posición${positions.length === 1 ? "" : "es"}.` +
        (discarded > 0 ? ` ${discarded} se descartaron por datos dudiosos.` : "") +
        " Revísalas y corrige lo que haga falta antes de usarlas.",
    });
  }

  function updateRow(index: number, key: keyof DraftRow, value: string) {
    if (key === "amount" || key === "currency") {
      setRows((current) =>
        current.map((row, position) =>
          position === index ? { ...row, amountNeedsUsd: key === "currency" ? value !== "USD" && row.amountNeedsUsd : false } : row,
        ),
      );
    }
    setRows((current) =>
      current.map((row, position) =>
        position === index ? { ...row, [key]: value } : row,
      ),
    );
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, position) => position !== index));
  }

  function handleUse() {
    const positions: DetectedPosition[] = [];
    for (const row of rows) {
      const position = fromDraft(row);
      if (position) positions.push(position);
    }
    // Montos solo en USD (decision de Manu): se pide corregir antes de usar.
    const problems = amountCurrencyProblems(positions);
    if (problems.length > 0) {
      setMessage({
        type: "error",
        text: `${AMOUNT_USD_MESSAGE} ${problems.join(", ")} (o usa cantidad o porcentaje).`,
      });
      return;
    }
    if (positions.length === 0) {
      setMessage({
        type: "error",
        text: "Deja al menos una posición válida para continuar.",
      });
      return;
    }
    onUse(positions);
    setRows([]);
    setMessage({
      type: "success",
      text: `${positions.length} posición${positions.length === 1 ? "" : "es"} cargadas al editor. Revisa y guarda cuando estén listas.`,
    });
  }

  const overLimit =
    maxPositions !== undefined && rows.length > maxPositions;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Subir captura</CardTitle>
        <CardDescription>
          Lee una captura de tu corredora y te propone las posiciones. La imagen
          no se guarda: se procesa y se descarta.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Permite volver a elegir el mismo archivo.
            event.target.value = "";
            if (file) void handleFile(file);
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            loading={loading}
            onClick={() => fileRef.current?.click()}
          >
            <Camera className="size-4" strokeWidth={1.5} />
            Subir captura
          </Button>
          <span className="text-[12px] text-ink-500">
            PNG, JPEG o WebP. Hasta 4 MB.
          </span>
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

        {rows.length > 0 && (
          <>
            <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                    <th className="pb-2">Símbolo</th>
                    <th className="pb-2">Cantidad</th>
                    <th className="pb-2">Monto (USD)</th>
                    <th className="pb-2">Peso %</th>
                    <th className="pb-2">Moneda</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {rows.map((row, index) => (
                    <tr key={index}>
                      <td className="py-2 pr-2">
                        <input
                          value={row.symbol}
                          onChange={(event) =>
                            updateRow(index, "symbol", event.target.value)
                          }
                          aria-label={`Símbolo de la posición ${index + 1}`}
                          className="h-9 w-full rounded-none border border-ink-200 bg-white px-2 text-[14px] text-ink-900 uppercase focus:border-ink-900 focus:outline-none"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          value={row.quantity}
                          inputMode="decimal"
                          onChange={(event) =>
                            updateRow(index, "quantity", event.target.value)
                          }
                          aria-label={`Cantidad de la posición ${index + 1}`}
                          placeholder="—"
                          className="h-9 w-full rounded-none border border-ink-200 bg-white px-2 text-[14px] text-ink-900 focus:border-ink-900 focus:outline-none"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          value={row.amount}
                          inputMode="decimal"
                          onChange={(event) =>
                            updateRow(index, "amount", event.target.value)
                          }
                          aria-label={`Monto de la posición ${index + 1}`}
                          placeholder="—"
                          className="h-9 w-full rounded-none border border-ink-200 bg-white px-2 text-[14px] text-ink-900 focus:border-ink-900 focus:outline-none"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          value={row.weight}
                          inputMode="decimal"
                          onChange={(event) =>
                            updateRow(index, "weight", event.target.value)
                          }
                          aria-label={`Peso de la posición ${index + 1}`}
                          placeholder="—"
                          className="h-9 w-full rounded-none border border-ink-200 bg-white px-2 text-[14px] text-ink-900 focus:border-ink-900 focus:outline-none"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <select
                          value={row.currency}
                          onChange={(event) =>
                            updateRow(
                              index,
                              "currency",
                              event.target.value as DraftRow["currency"],
                            )
                          }
                          aria-label={`Moneda de la posición ${index + 1}`}
                          className="h-9 w-full rounded-none border border-ink-200 bg-white px-2 text-[14px] text-ink-900 focus:border-ink-900 focus:outline-none"
                        >
                          <option value="">—</option>
                          <option value="USD">USD</option>
                          <option value="CLP">CLP</option>
                        </select>
                      </td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeRow(index)}
                          className="-m-3 inline-flex size-11 items-center justify-center rounded text-ink-400 hover:bg-ink-100 hover:text-negative"
                          aria-label={`Quitar ${row.symbol || `la posición ${index + 1}`}`}
                        >
                          <X className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {overLimit && (
              <p className="text-[12px] text-negative">
                Son {rows.length} posiciones y tu plan permite {maxPositions}.
                Quita las que no necesites.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" onClick={handleUse} disabled={overLimit}>
                Usar estas posiciones
              </Button>
              <button
                type="button"
                onClick={() => {
                  setRows([]);
                  setMessage(null);
                }}
                className="inline-flex items-center gap-2 text-[13px] text-ink-900 underline underline-offset-4"
              >
                <Trash2 className="size-4" strokeWidth={1.5} />
                Descartar
              </button>
            </div>

            <p className="text-[12px] leading-relaxed text-ink-500">
              Revisa los datos antes de guardar: la IA puede leer mal un
              símbolo o un monto. La imagen no se guarda en ninguna parte.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
