import { formatLagBadge, type LagBadgeInput } from "@/lib/disclosure-lag";
import { cn } from "@/lib/utils";

interface LagBadgeProps extends LagBadgeInput {
  className?: string;
  /** Antepone "· " para ir en una fila de metadatos. */
  leadingDot?: boolean;
}

/**
 * Fecha de publicación en hora de Chile y días de atraso.
 * Ejemplo: "Publicado 08-10-2026 · 48 días después de la operación".
 */
export function LagBadge({ className, leadingDot = false, ...input }: LagBadgeProps) {
  const text = formatLagBadge(input);
  if (!text) return null;
  return (
    <span className={cn("text-[13px] tabular-nums text-ink-500", className)}>
      {leadingDot ? "· " : null}
      {text}
    </span>
  );
}
