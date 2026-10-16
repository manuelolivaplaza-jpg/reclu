"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import type { Holding } from "@/lib/types";

const CAPITAL_OPTIONS = [
  { label: "$1.000.000", value: 1_000_000 },
  { label: "$5.000.000", value: 5_000_000 },
  { label: "$10.000.000", value: 10_000_000 },
  { label: "$25.000.000", value: 25_000_000 },
] as const;

interface PortfolioToolsProps {
  slug: string;
  portfolioName: string;
  returnYtd: number;
  holdings: Holding[];
  authenticated: boolean;
  isElite: boolean;
}

function formatClp(value: number): string {
  return value.toLocaleString("es-CL", { maximumFractionDigits: 0 });
}

/**
 * PortfolioTools — Simulador de Capital YTD + Exportación CSV (Elite).
 * Dos bloques sobrios con filetes, tipografía num tabular. Cero color
 * salvo el resultado en verde/rojo como cifra de rendimiento.
 */
export function PortfolioTools({
  slug,
  portfolioName,
  returnYtd,
  holdings,
  authenticated,
  isElite,
}: PortfolioToolsProps) {
  const [capital, setCapital] = useState<number>(1_000_000);
  const router = useRouter();

  const finalValue = useMemo(
    () => capital * (1 + returnYtd / 100),
    [capital, returnYtd],
  );
  const profit = finalValue - capital;
  const positive = profit >= 0;

  function handleExport() {
    if (!authenticated) {
      router.push("/signup");
      return;
    }
    if (!isElite) {
      router.push("/#precios");
      return;
    }

    const header = "symbol,name,weight,previous_weight,delta_pp,currency,exchange";
    const rows = holdings.map((h) => {
      const delta =
        h.previous_weight !== null ? (h.weight - h.previous_weight).toFixed(1) : "";
      const prev = h.previous_weight !== null ? h.previous_weight.toFixed(1) : "";
      const name = h.name.includes(",") ? `"${h.name}"` : h.name;
      return [
        h.symbol,
        name,
        h.weight.toFixed(1),
        prev,
        delta,
        h.currency,
        h.exchange ?? "",
      ].join(",");
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reclu-${slug}-composicion.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-12 grid gap-12 border-t border-ink-200 pt-10 lg:grid-cols-[1.6fr_1fr]">
      {/* Simulador de Capital YTD */}
      <section aria-labelledby="simulator-heading">
        <h2 id="simulator-heading" className="text-[15px] font-medium text-ink-900">
          Simulador de Capital YTD
        </h2>

        <div className="mt-4 flex flex-wrap gap-2">
          {CAPITAL_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setCapital(option.value)}
              aria-pressed={capital === option.value}
              className={
                "border px-4 py-2 text-[13px] transition-colors " +
                (capital === option.value
                  ? "border-ink-900 bg-ink-900 text-white"
                  : "border-ink-200 bg-white text-ink-900 hover:border-ink-400")
              }
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mt-6 border-t border-ink-200 pt-5">
          <p className="label-line">Valor estimado hoy</p>
          <p className="num mt-1 text-[clamp(2rem,4vw,3rem)] leading-none text-ink-900">
            ${formatClp(finalValue)}
          </p>
          <p className="mt-2 text-[15px]">
            <span className="text-ink-500">Ganancia neta: </span>
            <span
              className={
                "num font-medium " + (positive ? "text-positive" : "text-negative")
              }
            >
              {positive ? "+" : "−"}${formatClp(Math.abs(profit))}
            </span>
            <span className="text-ink-500"> con el retorno YTD de {portfolioName}.</span>
          </p>
        </div>

        <p className="mt-4 max-w-md text-[13px] leading-relaxed text-ink-500">
          Cálculo ilustrativo sobre retorno YTD reportado sin descontar comisiones.
          No constituye proyección ni asesoría.
        </p>
      </section>

      {/* Exportación CSV */}
      <section aria-labelledby="export-heading">
        <h2 id="export-heading" className="text-[15px] font-medium text-ink-900">
          Exportar composición
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-500">
          Descarga los {holdings.length} activos del portafolio con sus pesos,
          deltas y monedas en un archivo CSV real.
        </p>
        <button
          type="button"
          onClick={handleExport}
          className="mt-5 inline-flex h-12 items-center gap-2 rounded-full bg-ink-900 px-[22px] text-[15px] font-medium text-white transition-colors hover:bg-black"
        >
          <Download className="size-4" strokeWidth={1.8} />
          Exportar CSV ↓
        </button>
        {!authenticated && (
          <p className="mt-3 text-[13px] text-ink-500">
            Requiere cuenta gratuita. Te llevaremos a crear una.
          </p>
        )}
        {authenticated && !isElite && (
          <p className="mt-3 text-[13px] text-ink-500">
            La exportación CSV está incluida en el plan Elite.
          </p>
        )}
      </section>
    </div>
  );
}
