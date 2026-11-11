import { cn } from "@/lib/utils";

/** Encabezado de pantalla: eyebrow opcional, título, subtítulo y acciones. */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  className,
}: {
  title: string;
  subtitle?: React.ReactNode;
  eyebrow?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between lg:mb-8", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="label-line">{eyebrow}</p> : null}
        <h1
          className={cn(
            "text-[28px] font-medium leading-[1.06] tracking-[-0.035em] text-ink-900 sm:text-[34px]",
            eyebrow && "mt-1.5",
          )}
        >
          {title}
        </h1>
        {subtitle ? <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
