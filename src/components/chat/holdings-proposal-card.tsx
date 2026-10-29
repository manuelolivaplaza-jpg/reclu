"use client";

/**
 * Tarjeta de confirmación para agregar posiciones a Mi portafolio (D52).
 * La IA solo propone. Nada se guarda hasta que el usuario pulsa "Confirmar".
 * El guardado usa la misma server action que Mi portafolio
 * (sesión + RLS + consentimiento + tope del plan + zod).
 */
import { useState } from "react";
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
    <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.06] p-4">
      <p className="text-sm font-medium text-white">Revisa antes de agregar a Mi portafolio</p>
      <p className="mt-0.5 text-xs text-zinc-400">
        Datos leídos automáticamente: pueden tener errores. Edita lo que haga falta. No se guarda nada sin tu confirmación.
      </p>
      <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-zinc-900 text-xs text-zinc-400">
            <tr>
              <th className="px-3 py-2 text-left font-normal">Activo</th>
              <th className="px-3 py-2 text-right font-normal">{proposal.mode === "shares" ? "Cantidad" : "Peso (%)"}</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.symbol} className="border-t border-white/5">
                <td className="px-3 py-1.5 font-mono text-white">{r.symbol}</td>
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
                    className="w-24 rounded-md bg-white/5 px-2 py-1 text-right tabular-nums text-white outline-none focus:ring-1 focus:ring-emerald-400"
                  />
                </td>
                <td className="pr-2 text-right">
                  {state === "pending" && (
                    <button
                      type="button"
                      aria-label={`Quitar ${r.symbol}`}
                      onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                      className="text-zinc-500 hover:text-red-400"
                    >
                      ×
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {message && <p className={`mt-2 text-xs ${state === "saved" ? "text-emerald-300" : "text-red-300"}`}>{message}</p>}
      {state === "pending" || state === "saving" ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={state === "saving" || rows.length === 0}
            onClick={confirm}
            className="flex-1 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {state === "saving" ? "Guardando…" : `Confirmar y agregar (${rows.length})`}
          </button>
          <button
            type="button"
            disabled={state === "saving"}
            onClick={() => setState("cancelled")}
            className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-zinc-300 hover:bg-white/5"
          >
            Cancelar
          </button>
        </div>
      ) : state === "cancelled" ? (
        <p className="mt-2 text-xs text-zinc-400">Cancelado. No se guardó nada.</p>
      ) : null}
    </div>
  );
}
