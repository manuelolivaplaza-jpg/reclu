import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  // Píldora negra, sin sombra. Hover a negro puro.
  primary: "bg-ink-900 text-white hover:bg-black",
  // Borde 1px negro, píldora. Solo cuando un outline es inevitable.
  outline: "border border-ink-900 bg-transparent text-ink-900 hover:bg-ink-50",
  // Texto negro, sin fondo, sin pastilla en hover.
  ghost: "text-ink-900 hover:opacity-60",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-9 px-4 text-sm gap-1.5 rounded-full",
  md: "h-11 px-5 text-[15px] gap-2 rounded-full",
  lg: "h-12 px-[22px] text-[15px] gap-2 rounded-full font-medium",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

/**
 * Button — píldora. Sistema Autopilot: negro sobre blanco, radio 999px,
 * sin sombra. Focus outline negro (lo pone el base layer de globals.css).
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
          "inline-flex items-center justify-center transition-opacity duration-150",
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
 * ButtonLink — mismos visuales que Button, renderiza un <a>.
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
        "inline-flex items-center justify-center transition-opacity duration-150",
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
