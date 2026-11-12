import { cn } from "@/lib/utils";

/**
 * KPI editorial: filete de 1px, radio 0, sin sombra.
 * No inventa cifras: si no hay dato muestra "Sin datos" (nunca "—").
 */
export function StatCard({
  label,
  value,
  delta,
  deltaLabel,
  points,
  hint,
  className,
}: {
  label: string;
  value: string | null;
  /** Delta numérico en %, positivo verde / negativo rojo. */
  delta?: number | null;
  deltaLabel?: string;
  points?: number[];
  hint?: string;
  className?: string;
}) {
  const up = (delta ?? 0) >= 0;
  const text = typeof value === "string" ? value.trim() : "";
  const hasValue = value != null && text !== "" && !/^[—–-]$/.test(text);
  return (
    <div className={cn("app-panel flex flex-col gap-2 p-4 sm:p-5", className)}>
      <p className="label-line">{label}</p>
      <div className="flex items-end justify-between gap-3">
        {hasValue ? (
          <p className="num text-[26px] leading-none text-ink-900 sm:text-[28px]">{value}</p>
        ) : (
          <span className="text-[13px] font-normal leading-none text-ink-500">Sin datos</span>
        )}
        {points && points.length > 1 ? <MiniSpark points={points} /> : null}
      </div>
      {delta != null && Number.isFinite(delta) ? (
        <p className={cn("num text-[12px]", up ? "text-positive" : "text-negative")}>
          {up ? "+" : ""}
          {delta.toFixed(2)}%{deltaLabel ? <span className="ml-1 font-normal text-ink-500">{deltaLabel}</span> : null}
        </p>
      ) : hint ? (
        <p className="text-[12px] text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}

/** Trazo negro editorial: el color queda solo en la cifra del delta. */
function MiniSpark({ points }: { points: number[] }) {
  const w = 72;
  const h = 28;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${((i / (points.length - 1)) * w).toFixed(1)},${(h - ((p - min) / span) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="shrink-0 text-ink-900">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
