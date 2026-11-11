"use client";

/**
 * Tarjeta de confirmación para agregar posiciones a Mi portafolio (D52).
 * La IA solo propone. Nada se guarda hasta que el usuario pulsa "Confirmar".
 * El guardado usa la misma server action que Mi portafolio
 * (sesión + RLS + consentimiento + tope del plan + zod).
 */
import { useState } from "react";
import { X } from "lucide-react";
import { saveHoldingsByMode } from "@/app/actions/holdings-entry";
import type { HoldingsProposal } from "@/lib/chat-ia/tools";

type State = "pending" | "saving" | "saved" | "cancelled";

export function HoldingsProposalCard({ proposal }: { proposal: HoldingsProposal }) {
  const [rows, setRows] = useState(proposal.rows);
  const [state, setState] = useState<State>("pending");
  const [message, setMessage] = useState<string | null>(null);
  const unit = proposal.mode === "shares" ? "acciones" : "%";

  async function confirm() {
    setState("saving");
    setMessage(null);
    const res = await saveHoldingsByMode({
      mode: proposal.mode,
      rows: rows.filter((r) => r.value > 0).map((r) => ({ symbol: r.symbol, value: r.value })),
    });
    if (res.error || res.errors?.length) {
      setState("pending");
      setMessage(res.errors?.map((e) => `${e.symbol}: ${e.message}`).join(" · ") || res.error || "No se pudo guardar.");
      return;
    }
    setState("saved");
    setMessage(res.success ?? "Listo, quedó guardado en Mi portafolio.");
  }

  return (
    <div className="border border-ink-900 bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink-900">Revisa antes de agregar a Mi portafolio</p>
          <p className="mt-1 max-w-lg text-xs leading-relaxed text-ink-500">
            Datos leídos automáticamente: pueden tener errores. Edita lo que haga falta. No se guarda nada sin tu confirmación.
          </p>
        </div>
        <span className="shrink-0 border border-ink-200 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-ink-500">
          {proposal.mode === "shares" ? "Acciones" : "Pesos"}
        </span>
      </div>

      <div className="mt-4 max-h-64 overflow-y-auto border border-ink-200">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-ink-50 text-[11px] uppercase tracking-[0.1em] text-ink-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Activo</th>
              <th className="px-3 py-2 text-right font-medium">{proposal.mode === "shares" ? "Cantidad" : "Peso (%)"}</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.symbol} className="border-t border-ink-200">
                <td className="px-3 py-1.5 font-mono text-[13px] text-ink-900">{r.symbol}</td>
                <td className="px-3 py-1.5 text-right">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    disabled={state !== "pending"}
                    aria-label={`${r.symbol} en ${unit}`}
                    value={r.value}
                    onChange={(e) =>
                      setRows((prev) => prev.map((x, j) => (j === i ? { ...x, value: Number(e.target.value) || 0 } : x)))
                    }
                    className="w-24 border border-ink-200 bg-white px-2 py-1 text-right text-[13px] tabular-nums text-ink-900 outline-none transition-colors focus-visible:border-ink-900 disabled:text-ink-400"
                  />
                </td>
                <td className="pr-2 text-right">
                  {state === "pending" && (
                    <button
                      type="button"
                      aria-label={`Quitar ${r.symbol}`}
                      onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                      className="grid h-8 w-8 place-items-center text-ink-400 transition-colors hover:text-ink-900"
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {message && <p className={`mt-3 text-xs leading-relaxed ${state === "saved" ? "text-ink-900" : "text-negative"}`}>{message}</p>}

      {state === "pending" || state === "saving" ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={state === "saving" || rows.length === 0}
            onClick={confirm}
            className="inline-flex h-10 flex-1 items-center justify-center rounded-full bg-ink-900 px-4 text-sm font-medium text-white transition-colors hover:bg-black disabled:opacity-35"
          >
            {state === "saving" ? "Guardando…" : `Confirmar y agregar (${rows.length})`}
          </button>
          <button
            type="button"
            disabled={state === "saving"}
            onClick={() => setState("cancelled")}
            className="inline-flex h-10 items-center justify-center rounded-full border border-ink-200 px-4 text-sm text-ink-700 transition-colors hover:border-ink-900 hover:text-ink-900 disabled:opacity-35"
          >
            Cancelar
          </button>
        </div>
      ) : state === "cancelled" ? (
        <p className="mt-3 text-xs text-ink-500">Cancelado. No se guardó nada.</p>
      ) : null}
    </div>
  );
}
