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
    <section className={cn(card && "rounded-none border border-ink-200 bg-white p-4 sm:p-5", className)}>
      {title || action ? (
        <div
          className={cn(
            "mb-4 flex items-baseline justify-between gap-3",
            card && "border-b border-ink-200 pb-3",
          )}
        >
          {title ? (
            <h2 className="text-[16px] font-medium leading-tight tracking-[-0.02em] text-ink-900 sm:text-[17px]">{title}</h2>
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
