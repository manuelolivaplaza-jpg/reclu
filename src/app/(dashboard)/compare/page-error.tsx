"use client";

import Link from "next/link";

/**
 * Error de página con reintento accesible. `role="alert"` anuncia el fallo al
 * aparecer y el botón queda en el orden natural del teclado; la salida
 * secundaria evita que la pantalla sea un callejón sin salida.
 */
export function PageError({
  title,
  description = "Fue un problema temporal. Intenta de nuevo en unos segundos.",
  reset,
  secondaryHref,
  secondaryLabel,
}: {
  title: string;
  description?: string;
  reset: () => void;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <div
      role="alert"
      className="app-panel mx-auto flex w-full max-w-xl flex-col items-center px-6 py-12 text-center sm:py-14"
    >
      <p className="text-[18px] font-medium leading-snug tracking-[-0.02em] text-ink-900 sm:text-[20px]">
        {title}
      </p>
      <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-ink-500">{description}</p>

      <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-11 items-center rounded-full bg-ink-900 px-6 text-[14px] font-medium text-white transition-colors hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900"
        >
          Reintentar
        </button>
        {secondaryHref && secondaryLabel ? (
          <Link
            href={secondaryHref}
            className="inline-flex h-11 items-center rounded-full border border-app-border px-5 text-[14px] text-ink-900 transition-colors hover:border-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900"
          >
            {secondaryLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
