import { cn } from "@/lib/utils";

/**
 * KPI con delta opcional y mini sparkline SVG propia (sin librerías).
 * No inventa cifras: si value es null muestra "—".
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
  return (
    <div className={cn("app-card flex flex-col gap-2 p-4", className)}>
      <p className="text-app-caption font-medium text-ink-500">{label}</p>
      <div className="flex items-end justify-between gap-3">
        <p className="text-[24px] font-semibold leading-none tracking-tight text-ink-900 tabular-nums">{value ?? "—"}</p>
        {points && points.length > 1 ? <MiniSpark points={points} positive={up} /> : null}
      </div>
      {delta != null && Number.isFinite(delta) ? (
        <p className={cn("text-app-caption font-medium tabular-nums", up ? "text-positive" : "text-negative")}>
          {up ? "+" : ""}
          {delta.toFixed(2)}%{deltaLabel ? <span className="ml-1 font-normal text-ink-500">{deltaLabel}</span> : null}
        </p>
      ) : hint ? (
        <p className="text-app-caption text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}

function MiniSpark({ points, positive }: { points: number[]; positive: boolean }) {
  const w = 72;
  const h = 28;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${((i / (points.length - 1)) * w).toFixed(1)},${(h - ((p - min) / span) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className={positive ? "text-positive" : "text-negative"}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}