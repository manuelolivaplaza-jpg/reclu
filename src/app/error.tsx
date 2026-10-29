"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatusArt } from "@/components/public/status-art";

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
    <div className="pub-canvas flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div className="pub-card pub-rise w-full max-w-lg overflow-hidden">
        <div className="border-b border-ink-200 bg-ink-50/60 px-6 pb-2 pt-6">
          <div className="flex items-center justify-between">
            <span className="pub-chip">Error inesperado</span>
            {error.digest && <span className="num text-[12px] text-ink-400">#{error.digest}</span>}
          </div>
          <div className="mt-3">
            <StatusArt variant="error" />
          </div>
        </div>
        <div className="p-6 md:p-8">
          <h1 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] text-ink-900 md:text-[32px]">
            Algo salió mal
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-500">
            Ocurrió un error inesperado al cargar esta página. Intenta de nuevo en unos
            segundos. Si el problema persiste, escríbenos a{" "}
            <a href="mailto:hola@reclu.cl" className="text-ink-900 underline underline-offset-4">
              hola@reclu.cl
            </a>
            .
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" onClick={reset} className="w-full sm:w-auto">
              Reintentar
            </Button>
            <Link
              href="/"
              className="inline-flex h-12 w-full items-center justify-center rounded-full border border-ink-200 px-6 text-[15px] font-medium text-ink-900 hover:bg-ink-50 sm:w-auto"
            >
              Ir al inicio
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
