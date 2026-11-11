import { cn } from "@/lib/utils";

/**
 * Card — superficie con filete 1px (#e6e6e6), radio 0, sin sombra.
 * Autopilot: la separación la hacen el filete y el aire, nunca la elevación.
 */
export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-none border border-ink-200 bg-white text-ink-900 shadow-none",
        "dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-1.5 p-5 sm:p-6", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      className={cn(
        "text-base font-medium leading-snug tracking-[-0.015em] text-ink-900 dark:text-white",
        className,
      )}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "text-sm leading-relaxed text-ink-500 dark:text-neutral-400",
        className,
      )}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("px-5 pb-5 pt-0 sm:px-6 sm:pb-6", className)}
      {...props}
    />
  );
}

export function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 border-t border-ink-200 px-5 py-4 sm:px-6 sm:py-5",
        "dark:border-neutral-800",
        className,
      )}
      {...props}
    />
  );
}
