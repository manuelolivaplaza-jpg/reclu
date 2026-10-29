import Link from "next/link";
import { Plus, Wallet } from "lucide-react";
import { cn, formatSignedPct } from "@/lib/utils";
import type { MyPortfolioSummary } from "./load-my-portfolio";

function money(v: number, c: "USD" | "CLP") {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: c, maximumFractionDigits: c === "CLP" ? 0 : 2 }).format(v);
}
const tone = (v: number | null) => (v === null ? "text-ink-400" : v >= 0 ? "text-positive" : "text-negative");

/** Panel derecho: Mi portafolio (valor, variación del día y P&L). Server component. */
export function MyHoldingsPanel({ data }: { data: MyPortfolioSummary }) {
  if (data.state !== "ok") {
    const href = data.state === "disabled" ? "/compare" : "/mi-portafolio";
    return (
      <div className="app-card flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-app-canvas">
          <Wallet className="size-5 text-ink-700" strokeWidth={1.75} />
        </span>
        <div>
          <p className="text-app-body font-semibold text-ink-900">Tu portafolio</p>
          <p className="mt-1 text-app-caption text-ink-500">
            {data.state === "no-consent"
              ? "Activa Mi portafolio para ver valor, variación y P&L de tus acciones."
              : "Agrega tus acciones para ver su valor, variación diaria y P&L."}
          </p>
        </div>
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 rounded-app-control bg-ink-900 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-ink-700"
        >
          <Plus className="size-4" />
          Agregar acciones
        </Link>
      </div>
    );
  }

  const main = data.totals[0];
  return (
    <div className="app-card flex h-full flex-col p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <p className="text-app-caption font-medium text-ink-500">Mi portafolio</p>
        <Link href="/mi-portafolio" className="text-app-caption font-medium text-ink-900 hover:underline">
          Editar
        </Link>
      </div>
      {data.totals.map((t) => (
        <div key={t.currency} className="mt-2">
          <p className="text-[28px] leading-tight font-semibold tracking-tight text-ink-900 tabular-nums">{money(t.value, t.currency)}</p>
          <div className="mt-1 flex flex-wrap gap-x-3 text-[13px] tabular-nums">
            <span className={tone(t.dayPct)}>{t.dayPct === null ? "—" : formatSignedPct(t.dayPct, 2)} hoy</span>
            <span className={tone(t.pnl)}>
              {t.pnl >= 0 ? "+" : ""}
              {money(t.pnl, t.currency)} {t.pnlPct === null ? "" : `(${formatSignedPct(t.pnlPct, 1)})`}
            </span>
          </div>
        </div>
      ))}
      {!main && <p className="mt-2 text-app-caption text-ink-400">Sin precios para valorizar.</p>}

      <ul className="mt-4 flex flex-col divide-y divide-app-border border-t border-app-border">
        {data.positions.slice(0, 6).map((p) => (
          <li key={p.symbol} className="flex items-center gap-3 py-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-app-canvas text-[10px] font-semibold text-ink-700">
              {p.symbol.replace(".SN", "").slice(0, 4)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-ink-900">{p.symbol}</p>
              <p className="truncate text-[11px] text-ink-500">{p.name}</p>
            </div>
            <div className="text-right tabular-nums">
              <p className="text-[13px] font-medium text-ink-900">{p.value === null ? "—" : money(p.value, p.currency)}</p>
              <p className={cn("text-[11px]", tone(p.pnlPct))}>{p.pnlPct === null ? "—" : formatSignedPct(p.pnlPct, 1)}</p>
            </div>
          </li>
        ))}
      </ul>
      {data.missingPrices > 0 && (
        <p className="mt-2 text-[11px] text-ink-400">{data.missingPrices} sin precio, no se valorizan.</p>
      )}
    </div>
  );
}
