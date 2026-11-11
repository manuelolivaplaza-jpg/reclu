import Link from "next/link";
import { cn } from "@/lib/utils";

/** Estado vacío editorial: filete de 1px, radio 0 y CTA opcional (href serializable). */
export function EmptyState({
  title,
  description,
  eyebrow,
  ctaHref,
  ctaLabel,
  className,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  ctaHref?: string;
  ctaLabel?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-none border border-ink-200 bg-white px-6 py-12 text-center sm:py-14",
        className,
      )}
    >
      {eyebrow ? <p className="label-line">{eyebrow}</p> : null}
      <p
        className={cn(
          "text-[18px] font-medium leading-snug tracking-[-0.02em] text-ink-900 sm:text-[20px]",
          eyebrow && "mt-2",
        )}
      >
        {title}
      </p>
      {description ? <p className="mt-2 max-w-md text-[14px] leading-relaxed text-ink-500">{description}</p> : null}
      {ctaHref && ctaLabel ? (
        <Link
          href={ctaHref}
          className="mt-6 inline-flex h-11 items-center rounded-full bg-ink-900 px-6 text-[14px] font-medium text-white transition-colors hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900"
        >
          {ctaLabel}
        </Link>
      ) : null}
    </div>
  );
}
