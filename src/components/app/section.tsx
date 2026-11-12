import { cn } from "@/lib/utils";

/** Bloque de contenido con título opcional y acción (p. ej. "Ver todo"). */
export function Section({
  title,
  action,
  card = true,
  className,
  children,
}: {
  title?: string;
  action?: React.ReactNode;
  card?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn(card && "app-panel p-4 sm:p-5", className)}>
      {title || action ? (
        <div
          className={cn(
            "mb-4 flex items-baseline justify-between gap-3",
            card && "border-b border-line pb-3",
          )}
        >
          {title ? (
            <h2 className="text-app-title font-medium tracking-[-0.02em] text-ink-900">{title}</h2>
          ) : (
            <span />
          )}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
