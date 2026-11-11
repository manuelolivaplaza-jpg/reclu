import { cn } from "@/lib/utils";

export type ChipTone = "neutral" | "buy" | "sell" | "info";

/**
 * Tonos editoriales: blanco, negro y filetes de 1px, radio 0.
 * El verde y el rojo quedan reservados a las cifras de rendimiento.
 */
const TONES: Record<ChipTone, string> = {
  neutral: "border border-ink-200 bg-white text-ink-600",
  buy: "border border-ink-900 bg-white text-ink-900",
  sell: "border border-ink-300 bg-ink-50 text-ink-800",
  info: "border border-ink-900 bg-ink-900 text-white",
};

/** Chip compacto: Compra / Venta / Categoría. */
export function Chip({ tone = "neutral", className, children }: { tone?: ChipTone; className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-none px-2.5 text-[12px] font-medium leading-none",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}