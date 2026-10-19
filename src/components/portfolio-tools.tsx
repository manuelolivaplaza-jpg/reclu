"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, ListPlus } from "lucide-react";
import type { Holding } from "@/lib/types";
import { ReplicateList } from "@/components/replicate-list";

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
 * PortfolioMetricsStrip — Barra arquitectónica de 4 métricas clave de composición.
 * Filetes de 1px, tipografía tabular y monocromo estricto.
 */
export function PortfolioMetricsStrip({ holdings }: { holdings: Holding[] }) {
  const sorted = useMemo(
    () => [...holdings].sort((a, b) => b.weight - a.weight),
    [holdings],
  );

  const top3Weight = useMemo(
    () => sorted.slice(0, 3).reduce((sum, h) => sum + h.weight, 0),
    [sorted],
  );

  const topHolding = sorted[0] ?? null;

  const recentMoves = useMemo(
    () =>
      holdings.filter(
        (h) => h.previous_weight !== null && h.previous_weight !== h.weight,
      ).length,
    [holdings],
  );

  return (
    <div
      aria-label="Métricas de cartera"
      className="mb-10 grid grid-cols-2 gap-px border border-ink-200 bg-ink-200 sm:grid-cols-4"
    >
      <div className="bg-white p-5">
        <p className="text-[13px] text-ink-500">Activos en cartera</p>
        <p className="num mt-1.5 text-2xl font-medium tracking-tight text-ink-900">
          {holdings.length}
        </p>
      </div>

      <div className="bg-white p-5">
        <p className="text-[13px] text-ink-500">Concentración Top 3</p>
        <p className="num mt-1.5 text-2xl font-medium tracking-tight text-ink-900">
          {holdings.length > 0 ? `${top3Weight.toFixed(1)}%` : "—"}
        </p>
      </div>

      <div className="bg-white p-5">
        <p className="text-[13px] text-ink-500">Mayor posición</p>
        <p className="num mt-1.5 text-2xl font-medium tracking-tight text-ink-900">
          {topHolding ? (
            <>
              <span>{topHolding.symbol}</span>{" "}
              <span className="text-[15px] font-normal text-ink-500">
                {topHolding.weight.toFixed(1)}%
              </span>
            </>
          ) : (
            "—"
          )}
        </p>
      </div>

      <div className="bg-white p-5">
        <p className="text-[13px] text-ink-500">Rotación reciente</p>
        <p className="num mt-1.5 text-2xl font-medium tracking-tight text-ink-900">
          {recentMoves}{" "}
          <span className="text-[15px] font-normal text-ink-500">
            movimientos
          </span>
        </p>
      </div>
    </div>
  );
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
  const [showReplicate, setShowReplicate] = useState(false);
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
    <>
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

      {/* Lista de compras ("Copiar en mi corredora") */}
      <div className="lg:col-span-2">
        <button
          type="button"
          onClick={() => setShowReplicate((open) => !open)}
          aria-expanded={showReplicate}
          className="inline-flex h-12 items-center gap-2 rounded-full border border-ink-900 px-6 text-[15px] font-medium text-ink-900 transition-colors hover:bg-ink-900 hover:text-white"
        >
          <ListPlus className="size-4" strokeWidth={1.8} />
          Copiar en mi corredora
        </button>
      </div>
    </div>

    {showReplicate ? (
      <ReplicateList
        slug={slug}
        portfolioName={portfolioName}
        holdings={holdings}
      />
    ) : null}
    </>
  );
}
