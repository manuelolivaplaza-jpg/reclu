import Link from "next/link";
import { cn } from "@/lib/utils";

const ROWS = ["w-[62%]", "w-[48%]", "w-[70%]", "w-[40%]"];

/**
 * D55: bloque difuminado para posiciones bloqueadas por plan. No recibe
 * datos de posiciones (no existen en el HTML): solo filas fantasma y el CTA.
 * Sin hooks: sirve en Server y Client Components.
 */
export function LockedHoldings({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div
      role="region"
      aria-label="Posiciones solo para suscriptores"
      className={cn("relative overflow-hidden rounded-xl border border-ink-200 bg-white", className)}
    >
      <ul aria-hidden="true" className="pointer-events-none flex select-none flex-col gap-3 p-3 blur-[5px]">
        {ROWS.map((w, i) => (
          <li key={i} className="flex items-center gap-2.5">
            <span className="size-7 shrink-0 rounded-full bg-ink-200" />
            <span className={cn("h-2.5 rounded-full bg-ink-200", w)} />
            <span className="ml-auto h-2.5 w-9 rounded-full bg-ink-200" />
          </li>
        ))}
      </ul>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/55 px-4 text-center">
        <p className={cn("font-semibold text-ink-900", compact ? "text-[13px]" : "text-[14px]")}>
          Posiciones solo para suscriptores
        </p>
        <Link
          href="/upgrade"
          className="mt-2 inline-flex h-8 items-center rounded-full bg-ink-900 px-4 text-[12px] font-medium text-white hover:bg-black"
        >
          Suscribirme
        </Link>
      </div>
    </div>
  );
}
