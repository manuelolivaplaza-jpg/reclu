"use client";

import { useMemo, useState } from "react";
import { computeAlignment, DEFAULT_ALIGNMENT_ALERT_THRESHOLD } from "@/lib/alignment";
import type { CatalogPortfolio } from "@/components/portfolio-manager";

/**
 * F5: "Ajusta tu cartera para parecerte a X" — compara los holdings del
 * usuario con un portafolio del catálogo: % de similitud, qué te falta, qué
 * te sobra y diferencias de peso.
 *
 * Información, no recomendación: Reclu no ejecuta órdenes ni sugiere
 * comprar/vender. El usuario decide.
 */
export function AlignmentPanel({
  userHoldings,
  catalog,
}: {
  userHoldings: { symbol: string; name?: string; weight: number }[];
  catalog: CatalogPortfolio[];
}) {
  const crossable = useMemo(
    () => catalog.filter((p) => p.holdings.length > 0),
    [catalog],
  );
  const [targetSlug, setTargetSlug] = useState(crossable[0]?.slug ?? "");
  const target = crossable.find((p) => p.slug === targetSlug) ?? crossable[0];

  const alignment = useMemo(
    () =>
      target
        ? computeAlignment(
            userHoldings.map((h) => ({ symbol: h.symbol, weight: h.weight })),
            target.holdings,
          )
        : null,
    [userHoldings, target],
  );

  if (!target) return null;

  if (!alignment || alignment.reasons.length > 0) {
    return (
      <div className="border border-ink-200 p-6">
        <h2 className="text-[15px] font-medium text-ink-900">
          Ajusta tu cartera para parecerte a {target.name}
        </h2>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-500">
          {alignment?.reasons[0] ?? "Sin portafolio objetivo disponible."}{" "}
          Agrega tus activos arriba y vuelve a intentar.
        </p>
      </div>
    );
  }

  const belowThreshold = alignment.similarityPct < DEFAULT_ALIGNMENT_ALERT_THRESHOLD;

  return (
    <div className="border border-ink-200">
      {/* Cabecera: objetivo + similitud */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-ink-200 p-6">
        <div>
          <h2 className="text-[15px] font-medium text-ink-900">
            ¿Cuánto se parece tu cartera a…
          </h2>
          <select
            aria-label="Portafolio objetivo"
            value={target.slug}
            onChange={(e) => setTargetSlug(e.target.value)}
            className="mt-2 h-10 w-full max-w-xs border border-ink-200 bg-white px-3 text-[14px] text-ink-900 focus:border-ink-900 focus:outline-none"
          >
            {crossable.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
          <p className="mt-2 text-[13px] text-ink-500">
            Comparación de pesos normalizados. {alignment.sharedCount} de{" "}
            {alignment.targetCount} activos del objetivo en común.
          </p>
        </div>
        <p className="num text-[clamp(2rem,4vw,2.75rem)] font-medium leading-none tracking-[-0.03em] text-ink-900">
          {alignment.similarityPct.toFixed(1)}
          <span className="text-[0.45em] text-ink-500">%</span>
        </p>
      </div>

      {/* Aviso de desalineación */}
      {belowThreshold ? (
        <p className="border-b border-ink-200 bg-ink-50 px-6 py-3 text-[13px] text-ink-900">
          Tu cartera está a más de{" "}
          {(100 - DEFAULT_ALIGNMENT_ALERT_THRESHOLD).toFixed(0)} puntos de{" "}
          {target.name}. Recibirás una alerta cuando la similitud caiga bajo{" "}
          {DEFAULT_ALIGNMENT_ALERT_THRESHOLD}% (configurable en tus follows).
        </p>
      ) : null}

      {/* Falta / Sobra */}
      <div className="grid gap-px bg-ink-200 sm:grid-cols-2">
        <div className="bg-white p-6">
          <h3 className="text-[13px] font-medium text-ink-500">Te falta</h3>
          {alignment.missing.length === 0 ? (
            <p className="mt-3 text-[13px] text-ink-500">
              Nada: tu cartera ya cubre todos los activos del objetivo.
            </p>
          ) : (
            <ul className="mt-3">
              {alignment.missing.slice(0, 8).map((row) => (
                <li key={row.symbol} className="flex items-baseline justify-between border-t border-ink-100 py-2 text-[13px]">
                  <span className="num font-medium text-ink-900">{row.symbol}</span>
                  <span className="num text-ink-500">
                    {row.targetWeight.toFixed(1)}% del objetivo
                  </span>
                </li>
              ))}
              {alignment.missing.length > 8 ? (
                <li className="pt-2 text-[12px] text-ink-400">
                  +{alignment.missing.length - 8} más
                </li>
              ) : null}
            </ul>
          )}
        </div>
        <div className="bg-white p-6">
          <h3 className="text-[13px] font-medium text-ink-500">Te sobra</h3>
          {alignment.excess.length === 0 ? (
            <p className="mt-3 text-[13px] text-ink-500">
              Nada: ningún activo pasa del peso del objetivo.
            </p>
          ) : (
            <ul className="mt-3">
              {alignment.excess.slice(0, 8).map((row) => (
                <li key={row.symbol} className="flex items-baseline justify-between border-t border-ink-100 py-2 text-[13px]">
                  <span className="num font-medium text-ink-900">{row.symbol}</span>
                  <span className="num text-ink-500">
                    {row.delta < 0
                      ? `${Math.abs(row.delta).toFixed(1)} pp sobre el objetivo`
                      : `fuera del objetivo (${row.userWeight.toFixed(1)}%)`}
                  </span>
                </li>
              ))}
              {alignment.excess.length > 8 ? (
                <li className="pt-2 text-[12px] text-ink-400">
                  +{alignment.excess.length - 8} más
                </li>
              ) : null}
            </ul>
          )}
        </div>
      </div>

      {/* Diferencias de peso */}
      {alignment.weightDiffs.length > 0 ? (
        <div className="p-6">
          <h3 className="text-[13px] font-medium text-ink-500">
            Diferencias de peso (objetivo vs tuyo)
          </h3>
          <table className="mt-3 w-full text-[13px]">
            <thead>
              <tr className="border-b border-ink-200 text-left text-[12px] text-ink-500">
                <th className="pb-2 font-normal">Activo</th>
                <th className="pb-2 text-right font-normal">Objetivo</th>
                <th className="pb-2 text-right font-normal">Tuyo</th>
                <th className="pb-2 text-right font-normal">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {alignment.weightDiffs.slice(0, 10).map((row) => (
                <tr key={row.symbol} className="border-b border-ink-100">
                  <td className="py-2 font-medium text-ink-900">{row.symbol}</td>
                  <td className="num py-2 text-right text-ink-600">{row.targetWeight.toFixed(1)}%</td>
                  <td className="num py-2 text-right text-ink-600">{row.userWeight.toFixed(1)}%</td>
                  <td
                    className={
                      "num py-2 text-right " +
                      (row.delta > 0 ? "text-positive" : row.delta < 0 ? "text-negative" : "text-ink-400")
                    }
                  >
                    {row.delta > 0 ? "+" : ""}
                    {row.delta.toFixed(1)} pp
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {alignment.weightDiffs.length > 10 ? (
            <p className="mt-2 text-[12px] text-ink-400">
              Mostrando los 10 activos con mayor diferencia.
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="border-t border-ink-200 px-6 py-4 text-xs leading-relaxed text-ink-500">
        Información, no recomendación: esto describe qué tan distinta es tu
        cartera de la que sigues. Reclu no ejecuta órdenes ni gestiona carteras.
      </p>
    </div>
  );
}
