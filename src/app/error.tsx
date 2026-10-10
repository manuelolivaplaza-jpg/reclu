"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Error boundary global — captura errores de render en server/client.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("reclu.cl runtime error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-20 text-center">
      <h1 className="type-section text-ink-900">Algo salió mal.</h1>
      <p className="type-body mt-4 max-w-md">
        Ocurrió un error inesperado al cargar esta página. Intenta de nuevo en unos
        segundos. Si el problema persiste, escríbenos a{" "}
        <a href="mailto:hola@reclu.cl" className="text-ink-900 underline underline-offset-4">
          hola@reclu.cl
        </a>
        .
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button size="lg" onClick={reset}>
          Reintentar
        </Button>
        <Link
          href="/"
          className="inline-flex h-12 items-center justify-center px-6 text-[15px] text-ink-900 underline-offset-4 hover:underline"
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
