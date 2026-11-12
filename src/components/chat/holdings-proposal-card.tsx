"use client";

/**
 * Propuesta de posiciones para Mi portafolio.
 *
 * La IA solo propone: nada se guarda hasta que la persona confirma. El
 * guardado usa la misma server action que Mi portafolio (sesión, RLS,
 * consentimiento, tope del plan y validación). Esta tarjeta no describe ni
 * promete órdenes de compra o venta: solo registra posiciones.
 */
import { useId, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { saveHoldingsByMode } from "@/app/actions/holdings-entry";
import type { HoldingsProposal } from "@/lib/chat-ia/tools";
import { formatDecimal } from "@/lib/utils";

type State = "pending" | "saving" | "saved" | "cancelled";
type RowError = { symbol: string; message: string };
/** El valor se edita como texto para no perder el punto decimal al teclear. */
type EditableRow = { symbol: string; value: string };

function rowNumber(value: string): number {
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function invalidRowValue(value: string): boolean {
  const text = value.trim().replace(",", ".");
  if (!text) return false;
  const parsed = Number(text);
  return !Number.isFinite(parsed) || parsed < 0;
}

export function HoldingsProposalCard({ proposal }: { proposal: HoldingsProposal }) {
  const [rows, setRows] = useState<EditableRow[]>(() =>
    proposal.rows.map((row) => ({ symbol: row.symbol, value: String(row.value) })),
  );
  const [state, setState] = useState<State>("pending");
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<RowError[]>([]);
  const [success, setSuccess] = useState<string | null>(null);
  const titleId = useId();

  const isShares = proposal.mode === "shares";
  const unit = isShares ? "acciones" : "porcentaje";
  const editing = state === "pending";
  const totalWeight = isShares ? null : rows.reduce((sum, row) => sum + rowNumber(row.value), 0);
  const weightOff =
    totalWeight !== null && rows.length > 0 && Math.abs(totalWeight - 100) > 0.05;
  const weightLabel = totalWeight !== null ? formatDecimal(totalWeight, 1) : null;

  async function confirm() {
    if (state === "saving") return;

    const invalid = rows.filter((row) => invalidRowValue(row.value));
    if (invalid.length > 0) {
      setError(
        `Revisa ${invalid.length === 1 ? "la cantidad de" : "las cantidades de"} ${invalid
          .map((row) => row.symbol)
          .join(", ")}. Usa solo números mayores o iguales a cero.`,
      );
      return;
    }

    const payload = rows
      .map((row) => ({ symbol: row.symbol, value: rowNumber(row.value) }))
      .filter((row) => row.value > 0);

    if (!payload.length) {
      setError("Agrega al menos una posición con un valor mayor que cero.");
      return;
    }

    setState("saving");
    setError(null);
    setRowErrors([]);
    setSuccess(null);

    try {
      const res = await saveHoldingsByMode({ mode: proposal.mode, rows: payload });
      if (res.error || res.errors?.length) {
        setState("pending");
        setError(res.error ?? "No pudimos guardar la propuesta.");
        setRowErrors(res.errors ?? []);
        return;
      }
      setState("saved");
      setSuccess(res.success ?? "Las posiciones quedaron guardadas en Mi portafolio.");
    } catch {
      setState("pending");
      setError("Se cortó la conexión al guardar. Revisa tu red e inténtalo otra vez.");
    }
  }

  return (
    <section
      aria-labelledby={titleId}
      aria-busy={state === "saving"}
      className="border border-ink-900 bg-app-card"
    >
      <header className="flex items-start justify-between gap-3 border-b border-app-border px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <p className="label-line">Propuesta de la IA</p>
          <h3
            id={titleId}
            className="mt-1 text-[15px] font-medium leading-snug tracking-[-0.01em] text-ink-900"
          >
            {state === "saved" ? "Guardadas en Mi portafolio" : "Revisa antes de guardar en Mi portafolio"}
          </h3>
          <p className="mt-1.5 max-w-lg text-[13px] leading-relaxed text-ink-500">
            {state === "saved"
              ? "Confirmaste esta propuesta. El detalle queda en Mi portafolio."
              : "Datos leídos automáticamente: pueden tener errores. Edita lo que haga falta. No se guarda nada sin tu confirmación."}
          </p>
        </div>
        <span className="shrink-0 border border-app-border px-2 py-1 text-[11px] leading-none text-ink-500">
          {isShares ? "Acciones" : "Porcentaje"}
        </span>
      </header>

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-[13px] leading-relaxed text-ink-500 sm:px-5">
          No quedan posiciones en la propuesta. Descártala y vuelve a subir la captura o a pedirla
          de nuevo.
        </p>
      ) : (
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-[13px]">
            <caption className="sr-only">
              Posiciones propuestas para Mi portafolio
            </caption>
            <thead className="sticky top-0 z-10 border-b border-app-border bg-app-card">
              <tr>
                <th scope="col" className="px-4 py-2 text-left font-normal text-ink-500 sm:px-5">
                  Activo
                </th>
                <th scope="col" className="px-2 py-2 text-right font-normal text-ink-500">
                  {isShares ? "Cantidad" : "Peso (%)"}
                </th>
                <th scope="col" className="w-10 px-2 py-2">
                  <span className="sr-only">Quitar</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.symbol} className="border-t border-app-border">
                  <td className="px-4 py-1.5 font-medium tracking-[-0.01em] text-ink-900 sm:px-5">
                    {row.symbol}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      disabled={!editing}
                      aria-label={`${row.symbol}, ${unit}`}
                      value={row.value}
                      onChange={(event) => {
                        const value = event.target.value;
                        setError(null);
                        setRows((prev) =>
                          prev.map((item, position) =>
                            position === index ? { ...item, value } : item,
                          ),
                        );
                      }}
                      className="num w-20 border border-app-border bg-app-card px-2 py-1 text-right text-[16px] text-ink-900 transition-colors focus-visible:border-ink-900 focus-visible:outline-none disabled:border-transparent disabled:bg-transparent disabled:text-ink-500 sm:w-24 sm:text-[13px]"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {editing ? (
                      <button
                        type="button"
                        aria-label={`Quitar ${row.symbol} de la propuesta`}
                        onClick={() =>
                          setRows((prev) => prev.filter((_, position) => position !== index))
                        }
                        className="grid h-8 w-8 place-items-center text-ink-500 transition-colors hover:text-ink-900"
                      >
                        <X className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {weightOff && editing && weightLabel ? (
        <p className="border-t border-app-border px-4 py-2 text-[12px] leading-relaxed text-ink-500 sm:px-5">
          Los pesos suman {weightLabel}%. Al guardar se normalizan al 100%.
        </p>
      ) : null}

      {error ? (
        <div className="border-t border-app-border px-4 py-3 sm:px-5">
          <p
            role="alert"
            className="border-l-2 border-ink-900 pl-2.5 text-[13px] leading-relaxed text-ink-900"
          >
            {error}
          </p>
          {rowErrors.length ? (
            <ul className="mt-1.5 space-y-0.5 pl-2.5">
              {rowErrors.map((rowError) => (
                <li key={rowError.symbol} className="text-[12px] leading-relaxed text-ink-500">
                  <span className="font-medium text-ink-900">{rowError.symbol}</span>:{" "}
                  {rowError.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {state === "saved" ? (
        <div className="border-t border-app-border px-4 py-3.5 sm:px-5">
          <p
            role="status"
            className="border-l-2 border-ink-900 pl-2.5 text-[13px] leading-relaxed text-ink-900"
          >
            {success}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-2.5">
            <Link
              href="/app/portafolio"
              className="text-[13px] font-medium text-ink-900 underline underline-offset-4 transition-opacity hover:opacity-60"
            >
              Ver Mi portafolio
            </Link>
            <p className="text-[11px] leading-snug text-ink-500">No se envió ninguna orden.</p>
          </div>
        </div>
      ) : state === "cancelled" ? (
        <p className="border-t border-app-border px-4 py-3.5 text-[13px] leading-relaxed text-ink-500 sm:px-5">
          Propuesta descartada. No se guardó nada.
        </p>
      ) : (
        <div className="border-t border-app-border px-4 py-3.5 sm:px-5">
          <p className="text-[12px] leading-relaxed text-ink-500">
            Al confirmar, Mi portafolio queda con estas posiciones. No se envían órdenes a tu
            corredora ni a ningún mercado.
          </p>
          <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              disabled={state === "saving"}
              onClick={() => setState("cancelled")}
              aria-label="Descartar la propuesta sin guardar nada"
              className="inline-flex h-10 items-center justify-center px-2 text-[13px] text-ink-500 transition-colors hover:text-ink-900 disabled:opacity-40"
            >
              Descartar
            </button>
            <button
              type="button"
              disabled={state === "saving" || rows.length === 0}
              aria-busy={state === "saving"}
              aria-label={`Confirmar y guardar ${rows.length} ${rows.length === 1 ? "posición" : "posiciones"} en Mi portafolio`}
              onClick={() => void confirm()}
              className="inline-flex h-10 items-center justify-center rounded-full bg-ink-900 px-5 text-[14px] font-medium text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              {state === "saving" ? "Guardando…" : `Confirmar y guardar (${rows.length})`}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
