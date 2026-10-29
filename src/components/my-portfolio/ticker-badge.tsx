import { cn } from "@/lib/utils";

/**
 * Insignia de ticker para filas de posiciones. No hay logo oficial por
 * ticker en el catálogo, así que se usa el fallback de iniciales (nunca una
 * imagen generada). Color determinista por símbolo, sin hooks: sirve en
 * Server y Client Components.
 */
const TONES = [
  "bg-ink-900 text-white",
  "bg-emerald-600 text-white",
  "bg-sky-600 text-white",
  "bg-violet-600 text-white",
  "bg-amber-500 text-white",
  "bg-rose-600 text-white",
  "bg-teal-600 text-white",
  "bg-indigo-600 text-white",
];

function toneFor(symbol: string): string {
  let hash = 0;
  for (let i = 0; i < symbol.length; i += 1) hash = (hash * 31 + symbol.charCodeAt(i)) >>> 0;
  return TONES[hash % TONES.length];
}

export function TickerBadge({
  symbol,
  className,
}: {
  symbol: string;
  className?: string;
}) {
  const clean = symbol.replace(/\.SN$/i, "").replace(/[^A-Z0-9]/gi, "");
  const label = clean.slice(0, clean.length > 4 ? 3 : 4) || "?";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-10 shrink-0 select-none items-center justify-center rounded-full font-semibold tracking-tight",
        label.length >= 4 ? "text-[10px]" : "text-[12px]",
        toneFor(clean),
        className,
      )}
    >
      {label}
    </span>
  );
}
