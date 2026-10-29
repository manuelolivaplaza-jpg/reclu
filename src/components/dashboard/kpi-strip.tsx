import { cn, formatSignedPct } from "@/lib/utils";

export interface Kpi {
  label: string;
  value: string;
  hint?: string;
  tone?: "pos" | "neg" | "neutral";
}

/** Franja de KPIs del Resumen. Server component: solo strings, sin íconos como props. */
export function KpiStrip({ items }: { items: Kpi[] }) {
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
      {items.map((k) => (
        <div
          key={k.label}
          className="min-w-[44%] snap-start rounded-[12px] border border-[#e6e6e6] bg-white p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)] sm:min-w-0 sm:p-5"
        >
          <p className="text-[12px] font-medium tracking-[0.02em] text-ink-500">{k.label}</p>
          <p
            className={cn(
              "num mt-2 text-[28px] leading-none font-semibold tracking-[-0.03em] tabular-nums sm:text-[32px]",
              k.tone === "pos" ? "text-positive" : k.tone === "neg" ? "text-negative" : "text-ink-900",
            )}
          >
            {k.value}
          </p>
          {k.hint && <p className="mt-1.5 truncate text-[12px] text-ink-500">{k.hint}</p>}
        </div>
      ))}
    </div>
  );
}

export function pctKpi(v: number | null): Pick<Kpi, "value" | "tone"> {
  if (v === null) return { value: "—", tone: "neutral" };
  return { value: formatSignedPct(v), tone: v >= 0 ? "pos" : "neg" };
}
