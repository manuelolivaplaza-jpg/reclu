import { cn } from "@/lib/utils";

/**
 * Card — clean surface with subtle border and shadow.
 * Hover elevation is opt-in via `interactive`.
 */
export function Card({
  className,
  interactive = false,
  ...props
}: React.ComponentProps<"div"> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-card border border-ink-200 bg-white shadow-card",
        interactive &&
          "transition-all duration-200 hover:border-ink-300 hover:shadow-raised",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5 p-6", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      className={cn("text-lg font-semibold tracking-tight text-ink-900", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p className={cn("text-sm leading-relaxed text-ink-600", className)} {...props} />
  );
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex items-center gap-3 border-t border-ink-200 p-6", className)}
      {...props}
    />
  );
}
