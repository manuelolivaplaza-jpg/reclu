import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Fila tipo lista (móvil primero): leading (logo oficial / avatar), título,
 * meta y cifra a la derecha. Área táctil ≥ 56px. Si hay href, es un link.
 */
export function ListRow({
  href,
  leading,
  title,
  meta,
  value,
  valueSub,
  positive,
  className,
}: {
  href?: string;
  leading?: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  value?: React.ReactNode;
  valueSub?: React.ReactNode;
  /** Colorea valueSub: true verde, false rojo, undefined neutro. */
  positive?: boolean;
  className?: string;
}) {
  const body = (
    <>
      {leading ? <span className="shrink-0">{leading}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-ink-900">{title}</span>
        {meta ? <span className="mt-0.5 block truncate text-[13px] text-ink-500">{meta}</span> : null}
      </span>
      {value != null || valueSub != null ? (
        <span className="shrink-0 text-right tabular-nums">
          {value != null ? <span className="block text-[15px] font-medium text-ink-900">{value}</span> : null}
          {valueSub != null ? (
            <span
              className={cn(
                "mt-0.5 block text-[13px] font-medium",
                positive === true ? "text-positive" : positive === false ? "text-negative" : "text-ink-500",
              )}
            >
              {valueSub}
            </span>
          ) : null}
        </span>
      ) : null}
    </>
  );
  const cls = cn("flex min-h-14 items-center gap-3 px-3 py-2.5", className);
  return href ? (
    <Link href={href} className={cn(cls, "rounded-app-control transition-colors hover:bg-ink-50 active:bg-ink-100 focus-visible:outline-2 focus-visible:outline-ink-900")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}