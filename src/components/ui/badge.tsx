import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "brand" | "accent" | "positive" | "negative" | "warning" | "outline";

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-ink-100 text-ink-700",
  brand: "bg-brand-50 text-brand-700",
  accent: "bg-accent-50 text-accent-700",
  positive: "bg-positive-bg text-positive",
  negative: "bg-negative-bg text-negative",
  warning: "bg-warning-bg text-warning",
  outline: "border border-ink-300 text-ink-600",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"span"> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
