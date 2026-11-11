import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "outline" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

/**
 * Base compartida por Button y ButtonLink.
 * Autopilot × SpaceX: píldora, tipografía protagonista, cero sombra, cero azul.
 * El foco se dibuja con `outline` de 1px (nunca `ring`), así no aparece ningún
 * anillo de color SaaS; en dark se invierte a blanco.
 */
const baseClasses = cn(
  "inline-flex select-none items-center justify-center whitespace-nowrap",
  "rounded-full text-center font-medium leading-none tracking-[-0.01em]",
  "shadow-none transition-colors duration-150",
  "cursor-pointer touch-manipulation",
  "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[3px]",
  "focus-visible:outline-ink-900 dark:focus-visible:outline-white",
  "disabled:pointer-events-none disabled:opacity-45",
  "aria-disabled:pointer-events-none aria-disabled:opacity-45",
);

/**
 * El primario es la píldora negra del sistema: #0a0a0a con texto blanco.
 * En dark se invierte: píldora blanca con tinta #0a0a0a.
 */
const variantClasses: Record<ButtonVariant, string> = {
  primary: cn(
    "bg-ink-900 text-white",
    "hover:bg-black active:bg-ink-800",
    "dark:bg-white dark:text-ink-900 dark:hover:bg-ink-100 dark:active:bg-ink-200",
  ),
  // Secundario inevitable: filete de 1px negro (blanco en dark), sin relleno.
  outline: cn(
    "border border-ink-900 bg-transparent text-ink-900",
    "hover:bg-ink-50 active:bg-ink-100",
    "dark:border-white dark:text-white dark:hover:bg-neutral-900 dark:active:bg-neutral-800",
  ),
  // Texto suelto: sin píldora en reposo. El filete transparente mantiene la
  // misma caja que `outline` para que no salte 1px en filas mixtas.
  ghost: cn(
    "border border-transparent text-ink-700",
    "hover:bg-ink-50 hover:text-ink-900 active:bg-ink-100",
    "dark:text-neutral-300 dark:hover:bg-neutral-900 dark:hover:text-white dark:active:bg-neutral-800",
  ),
};

/**
 * Alturas: sm 36px (filas densas), md 44px (objetivo táctil mínimo), lg 48px
 * (CTA). `md` es el tamaño por defecto y cumple el área táctil de 44px.
 */
const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 gap-1.5 px-4 text-sm",
  md: "h-11 min-h-11 gap-2 px-5 text-[15px]",
  lg: "h-12 min-h-12 gap-2 px-[22px] text-[15px]",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      children,
      disabled,
      "aria-busy": ariaBusy,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        {...props}
        disabled={disabled || loading}
        aria-busy={loading ? true : ariaBusy}
        className={cn(
          baseClasses,
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
      >
        {loading && (
          <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
        )}
        {loading && <span className="sr-only">Cargando…</span>}
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
}: React.ComponentProps<"a"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <a
      href={href}
      className={cn(
        baseClasses,
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
