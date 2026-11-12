import { cn } from "@/lib/utils";

/**
 * Insignia de ticker para filas de posiciones. No hay logo oficial por
 * ticker en el catálogo, así que se usa el fallback de iniciales (nunca una
 * imagen generada). Monocromo: filete de 1px, fondo ink-50 y radio 0, igual
 * que el resto de las superficies de tabla. Sin hooks: sirve en Server y
 * Client Components.
 */
export function TickerBadge({
  symbol,
  className,
}: {
  symbol: string;
  className?: string;
}) {
  const clean = symbol
    .replace(/\.SN$/i, "")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase();
  const label = clean.slice(0, clean.length > 4 ? 3 : 4) || "·";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-10 shrink-0 select-none items-center justify-center border border-ink-200 bg-ink-50 font-medium text-ink-900",
        label.length >= 4 ? "text-[10px]" : "text-[11px]",
        className,
      )}
    >
      {label}
    </span>
  );
}
