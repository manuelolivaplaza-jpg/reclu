"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

/**
 * Global error boundary — catches runtime errors in server/client components.
 * Rendered when a page throws during render or data fetching.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to console (Vercel captures this in production logs)
    console.error("reclu.cl runtime error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-20 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-negative-bg text-negative">
        <AlertTriangle className="size-7" />
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
        Algo salió mal
      </h1>
      <p className="mt-3 max-w-md text-ink-600">
        Ocurrió un error inesperado al cargar esta página. Intenta de nuevo en unos
        segundos. Si el problema persiste, escríbenos a{" "}
        <a href="mailto:hola@reclu.cl" className="font-medium text-brand-600 hover:underline">
          hola@reclu.cl
        </a>
        .
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button
          onClick={reset}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-600 px-5 text-sm font-medium text-white shadow-subtle transition-colors hover:bg-brand-700"
        >
          Reintentar
        </button>
        <Link
          href="/"
          className="inline-flex h-10 items-center justify-center rounded-lg border border-ink-300 bg-white px-5 text-sm font-medium text-ink-900 shadow-subtle transition-colors hover:bg-ink-50"
        >
          Ir al inicio
        </Link>
      </div>
      {error.digest && (
        <p className="mt-6 text-xs text-ink-400">Código de error: {error.digest}</p>
      )}
    </div>
  );
}
