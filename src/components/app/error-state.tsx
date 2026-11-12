"use client";

import { cn } from "@/lib/utils";

/** Estado de error editorial con reintento (para error.tsx). */
export function ErrorState({
  title = "Algo salió mal",
  description = "No pudimos cargar esta sección. Intenta de nuevo en unos segundos.",
  eyebrow,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  eyebrow?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "app-panel flex flex-col items-center px-6 py-12 text-center sm:py-14",
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
      <p className="mt-2 max-w-md text-[15px] leading-relaxed text-ink-500">{description}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 inline-flex h-11 items-center rounded-full bg-ink-900 px-6 text-[14px] font-medium text-white transition-colors hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900"
        >
          Reintentar
        </button>
      ) : null}
    </div>
  );
}
