import { forwardRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Input — clean text input with label, error, and hint support.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const inputId = id ?? props.name ?? label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-ink-800">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          className={cn(
            "h-10 w-full rounded-lg border border-ink-300 bg-white px-3 text-sm text-ink-900 shadow-subtle",
            "placeholder:text-ink-400",
            "focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100",
            "disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-500",
            "aria-invalid:border-negative focus:aria-invalid:ring-negative-bg",
            error && "border-negative",
            className,
          )}
          {...props}
        />
        {hint && !error && <p className="text-xs text-ink-500">{hint}</p>}
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
