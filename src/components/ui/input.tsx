import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends React.ComponentProps<"input"> {
  label?: string;
  error?: string;
  hint?: string;
}

/**
 * Input — filete 1px del sistema en reposo, radio 0, fondo del lienzo y altura
 * táctil de 44px. Foco: el filete pasa a tinta #0a0a0a y el outline de 1px del
 * sistema (offset 3px) queda como indicador; nunca un anillo azul.
 * `aria-invalid` se activa con `error` (o si lo pasa el consumidor); el
 * mensaje se asocia con `aria-describedby` y el hint se oculta si hay error.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      label,
      error,
      hint,
      id,
      "aria-invalid": ariaInvalid,
      "aria-describedby": ariaDescribedBy,
      ...props
    },
    ref,
  ) => {
    const inputId = id ?? props.name ?? label?.toLowerCase().replace(/\s+/g, "-");
    const invalid = Boolean(error) || ariaInvalid === true || ariaInvalid === "true";
    const messageId = inputId ? `${inputId}-message` : undefined;
    const hasMessage = Boolean(error || hint);
    const describedBy =
      [ariaDescribedBy, hasMessage ? messageId : undefined]
        .filter(Boolean)
        .join(" ") || undefined;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium tracking-[-0.01em] text-ink-900 dark:text-neutral-200"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={cn(
            "h-11 min-h-11 w-full rounded-none border border-line bg-canvas px-3 text-[15px] text-ink-900 shadow-none",
            "placeholder:text-ink-500",
            "transition-colors duration-150",
            "hover:border-ink-400",
            "focus-visible:border-ink-900",
            "disabled:cursor-not-allowed disabled:border-line disabled:bg-ink-50 disabled:text-ink-500",
            "aria-invalid:border-negative",
            "dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-500",
            "dark:hover:border-neutral-700",
            "dark:focus-visible:border-white",
            "dark:disabled:border-neutral-800 dark:disabled:bg-neutral-900 dark:disabled:text-neutral-500",
            className,
          )}
          {...props}
        />
        {hint && !error && (
          <p id={messageId} className="text-xs leading-relaxed text-ink-500 dark:text-neutral-400">
            {hint}
          </p>
        )}
        {error && (
          <p
            id={messageId}
            role="alert"
            className="text-xs font-medium leading-relaxed text-negative dark:text-red-400"
          >
            {error}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";
