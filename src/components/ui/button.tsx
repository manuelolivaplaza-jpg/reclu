import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "accent";
type Size = "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white shadow-subtle hover:bg-brand-700 active:bg-brand-800",
  secondary:
    "bg-ink-900 text-white shadow-subtle hover:bg-ink-800 active:bg-ink-950",
  outline:
    "border border-ink-300 bg-white text-ink-900 shadow-subtle hover:bg-ink-50 hover:border-ink-400",
  ghost: "text-ink-700 hover:bg-ink-100 hover:text-ink-900",
  accent:
    "bg-accent-600 text-white shadow-subtle hover:bg-accent-700 active:bg-accent-700",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-lg",
  lg: "h-12 px-6 text-base gap-2 rounded-xl",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  asChildLink?: boolean;
}

/**
 * Button — the workhorse CTA. Follows Stripe/Linear conventions:
 * subtle shadow, clean hover, smooth transition. `loading` shows a spinner
 * and disables interaction.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "primary", size = "md", loading = false, children, disabled, ...props },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-all duration-150",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
          "disabled:pointer-events-none disabled:opacity-50",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

/**
 * ButtonLink — same visuals as Button but renders an <a> (use for
 * internal/external navigation rather than actions).
 */
export function ButtonLink({
  href,
  className,
  variant = "primary",
  size = "md",
  children,
  ...props
}: React.ComponentProps<"a"> & { variant?: Variant; size?: Size }) {
  return (
    <a
      href={href}
      className={cn(
        "inline-flex items-center justify-center font-medium transition-all duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {children}
    </a>
  );
}
