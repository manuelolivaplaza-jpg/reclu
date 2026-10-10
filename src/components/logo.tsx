import { cn } from "@/lib/utils";

/**
 * Wordmark reclu — solo la palabra, en Instrument Sans, peso 600,
 * tracking apretado. Sin SVG, sin cuadrado, sin gradiente, sin ".cl" de color.
 *
 * `tone="inverse"` lo pone en blanco para usarlo sobre negro (footer).
 */
export function LogoLockup({
  className,
  tone = "default",
}: {
  className?: string;
  tone?: "default" | "inverse";
}) {
  return (
    <span
      className={cn(
        "text-[18px] font-semibold tracking-[-0.04em]",
        tone === "inverse" ? "text-white" : "text-ink-900",
        className,
      )}
    >
      reclu
    </span>
  );
}
