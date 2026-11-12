import Link from "next/link";
import { ArrowRight } from "lucide-react";
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

const tone = (v: number | null) =>
  v === null ? "text-ink-500" : v > 0 ? "text-positive" : v < 0 ? "text-negative" : "text-ink-700";

/** Panel derecho: Mi portafolio (valor, variación del día y resultado). Server component. */
export function MyHoldingsPanel({ data }: { data: MyPortfolioSummary }) {
  if (data.state !== "ok") {
    const href = data.state === "disabled" ? "/compare" : "/mi-portafolio";
    const copy =
      data.state === "no-consent"
        ? "Activa Mi portafolio para ver el valor, la variación del día y la ganancia o pérdida de tus acciones."
        : data.state === "empty"
          ? "Agrega tus acciones para ver su valor, la variación diaria y la ganancia o pérdida."
          : "Mi portafolio no está disponible por ahora. Puedes ver tus acciones y su valor en Comparar.";
    const cta =
      data.state === "no-consent"
        ? "Activar Mi portafolio"
        : data.state === "empty"
          ? "Agregar acciones"
          : "Ir a Comparar";

    return (
      <div className="app-panel flex h-full flex-col justify-between gap-5 p-5">
        <div className="min-w-0">
          <p className="label-line">Mi portafolio</p>
          <h2 className="mt-1 text-[17px] font-medium tracking-[-0.02em] text-ink-900">Tu portafolio</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500">{copy}</p>
        </div>
        <Link
          href={href}
          className="inline-flex h-10 w-fit items-center gap-1.5 rounded-full bg-ink-900 px-4 text-[13px] font-medium text-white transition-colors hover:bg-black"
        >
          {cta}
          <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
        </Link>
      </div>
    );
  }

  const hasTotals = data.totals.length > 0;
  const mixedCurrency = data.totals.length > 1;
  const positionsShown = data.positions.slice(0, 6);
  return (
    <div className="app-panel flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <p className="label-line">Mi portafolio</p>
        <Link
          href="/mi-portafolio"
          className="text-[12px] font-medium text-ink-700 underline-offset-4 hover:text-ink-900 hover:underline"
        >
          Editar
        </Link>
      </div>

      {hasTotals ? (
        data.totals.map((t) => (
          <div key={t.currency} className="border-b border-line px-4 py-3 sm:px-5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="num min-w-0 truncate text-[24px] leading-tight text-ink-900">
                {money(t.value, t.currency)}
              </p>
              <span className="shrink-0 text-[11px] text-ink-500">{t.currency}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] tabular-nums">
              <span className={tone(t.dayPct)}>
                {t.dayPct === null ? "Sin dato hoy" : `${formatSignedPct(t.dayPct, 2)} hoy`}
              </span>
              {t.pnlPct === null ? (
                <span className="text-ink-500">Resultado sin dato</span>
              ) : (
                <span className={tone(t.pnlPct)}>
                  <span className="sr-only">Resultado: </span>
                  {`${t.pnl > 0 ? "+" : ""}${money(t.pnl, t.currency)} (${formatSignedPct(t.pnlPct, 1)})`}
                </span>
              )}
            </div>
          </div>
        ))
      ) : (
        <div className="border-b border-line px-4 py-3 sm:px-5">
          <p className="text-[12.5px] leading-relaxed text-ink-500">
            Sin precios de cierre para valorizar tus posiciones.
          </p>
          <Link
            href="/mi-portafolio"
            className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-900 underline-offset-4 hover:underline"
          >
            Revisar posiciones
            <ArrowRight aria-hidden="true" className="size-3" strokeWidth={1.5} />
          </Link>
        </div>
      )}

      {data.positions.length > 0 && (
        <>
          <div className="flex items-center justify-between px-4 pt-3 pb-1.5 sm:px-5">
            <p className="label-line">Posiciones</p>
            <span className="text-[11px] text-ink-500 tabular-nums">
              {data.positions.length > positionsShown.length
                ? `${positionsShown.length} de ${data.positions.length}`
                : data.positions.length}
            </span>
          </div>
          <ul className="divide-y divide-line border-t border-line">
            {positionsShown.map((p) => (
              <li key={p.symbol} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                <span className="w-12 shrink-0 text-[11px] font-medium text-ink-900">
                  {p.symbol.replace(".SN", "")}
                </span>
                <p className="min-w-0 flex-1 truncate text-[11.5px] text-ink-500">{p.name || "Sin nombre"}</p>
                <div className="shrink-0 text-right tabular-nums">
                  <p className={cn("text-[12px]", p.value === null ? "text-[11px] text-ink-500" : "num text-ink-900")}>
                    <span className="sr-only">Valor: </span>
                    {p.value === null ? "Sin cierre" : money(p.value, p.currency)}
                    {mixedCurrency && p.value !== null ? (
                      <span className="ml-1 font-sans text-[10px] font-normal tracking-normal text-ink-500">
                        {p.currency}
                      </span>
                    ) : null}
                  </p>
                  <p className={cn("mt-0.5 text-[11px]", tone(p.pnlPct))}>
                    <span className="sr-only">Resultado: </span>
                    {p.pnlPct === null ? "Sin dato" : formatSignedPct(p.pnlPct, 1)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {data.positions.length === 0 && hasTotals && (
        <p className="px-4 py-3 text-[12px] leading-relaxed text-ink-500 sm:px-5">
          Sin posiciones valorizadas todavía.
        </p>
      )}

      {data.missingPrices > 0 && (
        <p className="px-4 pt-2 text-[11px] leading-relaxed text-ink-500 sm:px-5">
          {data.missingPrices === 1
            ? "1 posición sin cierre: no se incluye en el total."
            : `${data.missingPrices} posiciones sin cierre: no se incluyen en el total.`}
        </p>
      )}

      <div className="mt-auto border-t border-line px-4 py-3 sm:px-5">
        <Link
          href="/mi-portafolio"
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-900 underline-offset-4 hover:underline"
        >
          Ver Mi portafolio
          <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
        </Link>
      </div>
    </div>
  );
}
