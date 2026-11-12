"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Error boundary global — captura errores de render en server/client.
 * La acción principal es reintentar; el digest queda como referencia para
 * soporte, no como mensaje al usuario.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("fraccion.si runtime error:", error);
  }, [error]);

  return (
    <main id="main" className="pub-canvas flex min-h-[70vh] flex-col">
      <div className="container-page flex flex-1 flex-col justify-center py-20 md:py-28">
        <p className="label-line">Error inesperado</p>
        <h1 className="type-section mt-3 max-w-[20ch] text-ink-900">
          Algo salió mal.
        </h1>
        <div role="alert" className="mt-4 max-w-[40rem]">
          <p className="text-[15px] leading-relaxed text-ink-500">
            Ocurrió un error al cargar esta página. Vuelve a intentarlo: si el
            problema sigue, escríbenos a{" "}
            <a
              href="mailto:hola@fraccion.si"
              className="text-ink-900 underline underline-offset-4"
            >
              hola@fraccion.si
            </a>{" "}
            y cuéntanos qué estabas viendo.
          </p>
        </div>
        {error.digest ? (
          <p className="num mt-4 text-[13px] text-ink-500">
            Referencia del error: {error.digest}
          </p>
        ) : null}
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
          <Button type="button" size="lg" onClick={reset}>
            Reintentar
          </Button>
          <Link
            href="/"
            className="inline-flex h-11 items-center text-[15px] text-ink-900 underline-offset-4 hover:underline"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </main>
  );
}
