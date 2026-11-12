import Link from "next/link";
import { ArrowRight, Plus, Wallet } from "lucide-react";
import { cn, formatSignedPct } from "@/lib/utils";
import type { MyPortfolioSummary } from "./load-my-portfolio";

function money(v: number, c: "USD" | "CLP") {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: c,
    maximumFractionDigits: c === "CLP" ? 0 : 2,
  })
    .format(v)
    .replace(/^-/, "\u2212");
}

const tone = (v: number | null) => (v === null ? "text-ink-400" : v >= 0 ? "text-positive" : "text-negative");

/** Panel derecho: Mi portafolio (valor, variación del día y P&L). Server component. */
export function MyHoldingsPanel({ data }: { data: MyPortfolioSummary }) {
  if (data.state !== "ok") {
    const href = data.state === "disabled" ? "/compare" : "/mi-portafolio";
    const copy =
      data.state === "no-consent"
        ? "Activa Mi portafolio para ver el valor, la variación y el P&L de tus acciones."
        : data.state === "empty"
          ? "Agrega tus acciones para ver su valor, variación diaria y P&L."
          : "Mi portafolio no está disponible en este entorno. Puedes ver tus acciones en Comparar.";
    return (
      <div className="flex h-full flex-col justify-between gap-4 rounded-app border border-ink-200 bg-white p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full border border-ink-200">
            <Wallet className="size-4 text-ink-700" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-ink-900">Tu portafolio</p>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-500">{copy}</p>
          </div>
        </div>
        <Link
          href={href}
          className="inline-flex h-10 w-fit items-center gap-1.5 rounded-full bg-ink-900 px-4 text-[12.5px] font-semibold text-white hover:bg-black"
        >
          <Plus className="size-4" />
          Agregar acciones
        </Link>
      </div>
    );
  }

  const hasTotals = data.totals.length > 0;
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-app border border-ink-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-ink-200 px-4 py-3 sm:px-5">
        <p className="text-[10px] font-medium tracking-[0.14em] text-ink-500 uppercase">Mi portafolio</p>
        <Link href="/mi-portafolio" className="text-[11px] font-medium text-ink-700 hover:text-ink-900 hover:underline">
          Editar
        </Link>
      </div>

      {hasTotals ? (
        data.totals.map((t) => (
          <div key={t.currency} className="border-b border-ink-200 px-4 py-3 sm:px-5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="min-w-0 truncate text-[26px] leading-tight font-semibold tracking-tight text-ink-900 tabular-nums">
                {money(t.value, t.currency)}
              </p>
              <span className="shrink-0 text-[9px] tracking-wide text-ink-400 uppercase">{t.currency}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] tabular-nums">
              <span className={tone(t.dayPct)}>
                {t.dayPct === null ? "Sin dato hoy" : `${formatSignedPct(t.dayPct, 2)} hoy`}
              </span>
              {t.pnlPct === null ? (
                <span className="text-ink-400">P&L sin dato</span>
              ) : (
                <span className={tone(t.pnlPct)}>
                  {`${t.pnl >= 0 ? "+" : ""}${money(t.pnl, t.currency)} (${formatSignedPct(t.pnlPct, 1)})`}
                </span>
              )}
            </div>
          </div>
        ))
      ) : (
        <p className="border-b border-ink-200 px-4 py-3 text-[11.5px] text-ink-400 sm:px-5">
          Sin precios para valorizar.
        </p>
      )}

      {data.positions.length > 0 && (
        <>
          <div className="flex items-center justify-between px-4 pt-3 pb-1.5 sm:px-5">
            <p className="text-[9px] font-medium tracking-[0.12em] text-ink-500 uppercase">Posiciones</p>
            <span className="text-[10px] text-ink-400 tabular-nums">{data.positions.length}</span>
          </div>
          <ul className="divide-y divide-ink-200 border-t border-ink-200">
            {data.positions.slice(0, 6).map((p) => (
              <li key={p.symbol} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                <span className="w-12 shrink-0 text-[10.5px] font-semibold tracking-wide text-ink-900">
                  {p.symbol.replace(".SN", "")}
                </span>
                <p className="min-w-0 flex-1 truncate text-[11px] text-ink-500">{p.name || "Sin nombre"}</p>
                <div className="shrink-0 text-right tabular-nums">
                  <p className={cn("text-[12px] font-medium text-ink-900", p.value === null && "text-[10.5px] font-normal text-ink-400")}>
                    {p.value === null ? "Sin cierre" : money(p.value, p.currency)}
                  </p>
                  <p className={cn("text-[10.5px]", p.pnlPct === null ? "text-ink-400" : tone(p.pnlPct))}>
                    {p.pnlPct === null ? "Sin dato" : formatSignedPct(p.pnlPct, 1)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {data.positions.length === 0 && (
        <p className="px-4 py-3 text-[11.5px] text-ink-400 sm:px-5">Sin posiciones valorizadas todavía.</p>
      )}

      {data.missingPrices > 0 && (
        <p className="px-4 pt-2 text-[10.5px] text-ink-400 sm:px-5">
          {data.missingPrices} sin cierre, no se valorizan.
        </p>
      )}

      <div className="mt-auto border-t border-ink-200 px-4 py-3 sm:px-5">
        <Link
          href="/mi-portafolio"
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-900 hover:underline"
        >
          Ver Mi portafolio
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}
