import Link from "next/link";
import { cn } from "@/lib/utils";

/** Estado vacío con CTA opcional (href string, serializable). */
export function EmptyState({
  title,
  description,
  ctaHref,
  ctaLabel,
  className,
}: {
  title: string;
  description?: string;
  ctaHref?: string;
  ctaLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("app-card flex flex-col items-center px-6 py-10 text-center", className)}>
      <p className="text-app-title font-semibold text-ink-900">{title}</p>
      {description ? <p className="mt-1.5 max-w-sm text-app-body text-ink-500">{description}</p> : null}
      {ctaHref && ctaLabel ? (
        <Link
          href={ctaHref}
          className="mt-5 inline-flex h-11 items-center rounded-full bg-ink-900 px-5 text-[14px] font-medium text-white hover:bg-ink-800"
        >
          {ctaLabel}
        </Link>
      ) : null}
    </div>
  );
}