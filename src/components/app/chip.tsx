import { cn } from "@/lib/utils";

export type ChipTone = "neutral" | "buy" | "sell" | "info";

const TONES: Record<ChipTone, string> = {
  neutral: "bg-ink-100 text-ink-700",
  buy: "bg-positive/10 text-positive",
  sell: "bg-negative/10 text-negative",
  info: "bg-ink-900 text-white",
};

/** Chip compacto: Compra / Venta / Categoría. */
export function Chip({ tone = "neutral", className, children }: { tone?: ChipTone; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-medium", TONES[tone], className)}>
      {children}
    </span>
  );
}