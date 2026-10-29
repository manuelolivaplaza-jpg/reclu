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
    <section className={cn(card && "app-card p-4 sm:p-5", className)}>
      {title || action ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title ? <h2 className="text-app-title font-semibold text-ink-900">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}