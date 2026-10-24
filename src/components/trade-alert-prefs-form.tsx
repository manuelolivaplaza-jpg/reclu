"use client";

import { useActionState } from "react";
import { saveTradeAlertPref } from "@/app/actions/trade-alert-prefs";
import type { FormState } from "@/lib/form-state";
import type { TradeAlertPref } from "@/lib/trade-alert-prefs";

function Row({ pref }: { pref: TradeAlertPref }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveTradeAlertPref, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
      <input type="hidden" name="portfolio_id" value={pref.portfolioId} />
      <a href={`/portfolio/${pref.slug}`} className="min-w-0 flex-1 truncate text-[15px] font-medium text-neutral-950 hover:underline">
        {pref.name}
      </a>
      <label className="flex items-center gap-2 text-[14px] text-neutral-700">
        <input type="checkbox" name="email_buys" defaultChecked={pref.emailBuys} className="size-4 accent-neutral-950" />
        Compras
      </label>
      <label className="flex items-center gap-2 text-[14px] text-neutral-700">
        <input type="checkbox" name="email_sells" defaultChecked={pref.emailSells} className="size-4 accent-neutral-950" />
        Ventas
      </label>
      <button type="submit" disabled={pending} className="rounded-full bg-neutral-950 px-3 py-1 text-[13px] font-medium text-white disabled:opacity-50">
        {pending ? "Guardando…" : "Guardar"}
      </button>
      {state.error ? <p className="w-full text-[13px] text-red-600">{state.error}</p> : null}
      {state.success ? <p className="w-full text-[13px] text-green-700">{state.success}</p> : null}
    </form>
  );
}

export function TradeAlertPrefsForm({ prefs, unavailable }: { prefs: TradeAlertPref[]; unavailable?: boolean }) {
  if (unavailable) return <p className="text-[14px] text-neutral-500">Las alertas de compra y venta aún no están disponibles.</p>;
  if (prefs.length === 0)
    return <p className="text-[14px] text-neutral-500">Sigue un portafolio para recibir un email cuando compre o venda.</p>;
  return (
    <div className="divide-y divide-neutral-200/70">
      {prefs.map((p) => (
        <Row key={p.portfolioId} pref={p} />
      ))}
    </div>
  );
}
