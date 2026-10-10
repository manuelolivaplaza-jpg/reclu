import { forwardRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Input — borde 1px gris, radio 0, focus borde negro sin anillo de color.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const inputId = id ?? props.name ?? label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-ink-900">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          className={cn(
            "h-11 w-full rounded-none border border-ink-200 bg-white px-3 text-[15px] text-ink-900",
            "placeholder:text-ink-500",
            "focus:border-ink-900 focus:outline-none",
            "disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-500",
            "aria-invalid:border-negative",
            error && "border-negative",
            className,
          )}
          {...props}
        />
        {hint && !error && <p className="text-xs text-ink-600">{hint}</p>}
        {error && (
          <p role="alert" className="text-xs font-medium text-negative">
            {error}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";

interface InputProps extends React.ComponentProps<"input"> {
  label?: string;
  error?: string;
  hint?: string;
}
