import type { Holding } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Panel de concentración de cartera.
 *
 * Todo sale de los pesos declarados que ya vienen en `holdings`; no hay cifras
 * de relleno. Tres lecturas:
 *  1) Top 3 y Top 10 acumulados (suma de `weight`, con tope de 100%).
 *  2) Posiciones efectivas = (Σw)² / Σ(w²), invariante a la escala de los pesos.
 *  3) Herfindahl = Σ (w_i / Σw × 100)², en la escala 0–10.000.
 *
 * Si los pesos no suman 100%, el pie del panel dice cuánto suman y sobre qué
 * base se calcula cada medida. Sin colores: esto describe composición, no
 * rendimiento.
 */

const PCT_1 = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const INT_0 = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

export interface ConcentrationPanelProps {
  /** Cualquier lista con símbolo, nombre y peso 0–100 (Holding o una proyección). */
  holdings: readonly ConcentrationItem[];
  /** Título del panel; se usa también para el id accesible (kebab-case). */
  title?: string;
  /** Id del encabezado. Obligatorio si hay más de un panel en la página. */
  id?: string;
}

/** Proyección mínima de `Holding`: así sirve para carteras propias y de catálogo. */
export type ConcentrationItem = Pick<Holding, "symbol" | "name" | "weight">;

interface Cell {
  label: string;
  value: string;
  hint: string;
  /** Símbolos largos: se recortan y el texto completo queda en el `title`. */
  truncateHint?: boolean;
  /** Las dos celdas de contexto ocupan dos columnas en desktop. */
  wide?: boolean;
}

function formatPct(value: number): string {
  return `${PCT_1.format(value)}%`;
}

/** Acepta número o string numérico; cualquier otra cosa se ignora sin romper. */
function readWeight(holding: ConcentrationItem): number {
  const raw: unknown = holding?.weight;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : Number.NaN;
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }
  return Number.NaN;
}

function symbolOf(holding: ConcentrationItem): string {
  const symbol = String(holding?.symbol ?? "").trim();
  if (symbol) return symbol;
  const name = String(holding?.name ?? "").trim();
  return name || "Sin identificador";
}

function topHint(count: number, limit: number): string {
  if (count >= limit) {
    return limit === 3 ? "Las tres posiciones de mayor peso." : "Las diez posiciones de mayor peso.";
  }
  if (count === 1) return "La única posición.";
  return `Suma de las ${count} disponibles.`;
}

function hhiReading(hhi: number): { label: string; range: string } {
  if (hhi < 1500) return { label: "Diversificada", range: "bajo 1.500" };
  if (hhi <= 2500) return { label: "Concentrada", range: "1.500–2.500" };
  return { label: "Muy concentrada", range: "sobre 2.500" };
}

function PanelHeader({
  id,
  title,
  withDescription = true,
}: {
  id: string;
  title: string;
  withDescription?: boolean;
}) {
  return (
    <header className="border-b border-line px-5 py-4 sm:px-6 sm:py-5">
      <h2 id={id} className="text-[17px] font-medium leading-snug text-ink-900">
        {title}
      </h2>
      {withDescription ? (
        <p className="label-line mt-1">Cuánto del portafolio depende de sus mayores posiciones.</p>
      ) : null}
    </header>
  );
}

export function ConcentrationPanel({
  holdings,
  title = "Concentración",
  id = "concentracion",
}: ConcentrationPanelProps) {
  const rows = (Array.isArray(holdings) ? holdings : [])
    .filter((holding): holding is ConcentrationItem => holding != null)
    .map((holding) => ({ holding, weight: readWeight(holding) }))
    .filter((row) => Number.isFinite(row.weight) && row.weight > 0)
    .sort((a, b) => b.weight - a.weight);

  const count = rows.length;
  const total = rows.reduce((sum, row) => sum + row.weight, 0);

  if (count === 0 || !Number.isFinite(total) || total <= 0) {
    return (
      <section aria-labelledby={id} className="app-panel">
        <PanelHeader id={id} title={title} withDescription={false} />
        <p className="label-line px-5 py-5 sm:px-6">Sin posiciones para analizar.</p>
      </section>
    );
  }

  const top3Raw = rows.slice(0, 3).reduce((sum, row) => sum + row.weight, 0);
  const top10Raw = rows.slice(0, 10).reduce((sum, row) => sum + row.weight, 0);
  const top3 = Math.min(100, top3Raw);
  const top10 = Math.min(100, top10Raw);

  // Invariante a escala: multiplicar todos los pesos por k no cambia el resultado.
  const sumSquares = rows.reduce((sum, row) => sum + row.weight * row.weight, 0);
  const effective = (total * total) / sumSquares;

  // Equivale a Σ (w_i / Σw · 100)², con los pesos normalizados sobre lo declarado.
  const hhiRaw = rows.reduce((sum, row) => sum + (row.weight / total) ** 2 * 10000, 0);
  const hhi = Math.min(10000, Math.max(0, Math.round(hhiRaw)));
  const reading = hhiReading(hhi);

  const under1 = rows.filter((row) => row.weight < 1).length;
  const declared = Math.round(total * 10) / 10;
  const largest = rows[0];
  const largestSymbol = symbolOf(largest.holding);
  const positionWord = count === 1 ? "posición" : "posiciones";

  const cells: Cell[] = [
    {
      label: "Top 3",
      value: formatPct(top3),
      hint: topHint(count, 3),
    },
    {
      label: "Top 10",
      value: formatPct(top10),
      hint: topHint(count, 10),
    },
    {
      label: "Posiciones efectivas",
      value: PCT_1.format(effective),
      hint: "Cuántas posiciones equivalentes tiene la cartera si todas pesaran lo mismo.",
    },
    {
      label: "Herfindahl (0–10.000)",
      value: INT_0.format(hhi),
      hint: `${reading.label} (${reading.range}).`,
    },
    {
      label: "Mayor posición",
      value: formatPct(largest.weight),
      hint: largestSymbol,
      truncateHint: true,
      wide: true,
    },
    {
      label: "Posiciones bajo 1%",
      value: INT_0.format(under1),
      hint: `de ${count} ${positionWord}`,
      wide: true,
    },
  ];

  const notes: string[] = [];
  if (declared !== 100) {
    notes.push(
      `Los pesos declarados suman ${formatPct(total)}, no 100%: el Top 3 y el Top 10 suman los pesos tal como vienen; el Herfindahl y las posiciones efectivas se calculan sobre esa suma.`,
    );
  }
  if (top3Raw > 100 || top10Raw > 100) {
    notes.push("Las sumas del Top 3 y del Top 10 llevan tope de 100%.");
  }
  if (count < 3) {
    notes.push(
      count === 1
        ? "La cartera tiene una sola posición: todas las cifras describen ese único peso."
        : "La cartera tiene dos posiciones: el Top 3 y el Top 10 son la suma de ambas.",
    );
  }

  return (
    <section aria-labelledby={id} className="app-panel">
      <PanelHeader id={id} title={title} />

      <dl className="grid grid-cols-2 gap-px bg-line md:grid-cols-4">
        {cells.map((cell) => (
          <div
            key={cell.label}
            className={cn("min-w-0 bg-app-card p-4 sm:p-5", cell.wide && "md:col-span-2")}
          >
            <dt className="label-line">{cell.label}</dt>
            <dd className="mt-2 min-w-0">
              <span className="num block text-[24px] leading-none text-ink-900 sm:text-[26px]">
                {cell.value}
              </span>
              <span
                className={cn(
                  "mt-1.5 block text-[12px] leading-snug text-ink-500",
                  cell.truncateHint && "truncate",
                )}
                title={cell.truncateHint ? cell.hint : undefined}
              >
                {cell.hint}
              </span>
            </dd>
          </div>
        ))}
      </dl>

      {notes.length > 0 ? (
        <div className="border-t border-line px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-1.5">
            {notes.map((note) => (
              <p key={note} className="text-[12px] leading-relaxed text-ink-500">
                {note}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
