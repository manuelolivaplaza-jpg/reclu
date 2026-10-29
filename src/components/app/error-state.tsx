"use client";

import { cn } from "@/lib/utils";

/** Estado de error con reintento (para error.tsx). */
export function ErrorState({
  title = "Algo salió mal",
  description = "No pudimos cargar esta sección. Intenta de nuevo en unos segundos.",
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div role="alert" className={cn("app-card flex flex-col items-center px-6 py-10 text-center", className)}>
      <p className="text-app-title font-semibold text-ink-900">{title}</p>
      <p className="mt-1.5 max-w-sm text-app-body text-ink-500">{description}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 inline-flex h-11 items-center rounded-full bg-ink-900 px-5 text-[14px] font-medium text-white hover:bg-ink-800"
        >
          Reintentar
        </button>
      ) : null}
    </div>
  );
}