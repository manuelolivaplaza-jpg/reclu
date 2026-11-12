"use client";

import { useEffect } from "react";
import { PageError } from "./page-error";

export default function AlertsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[reclu] alertas error", error.digest ?? error.message);
  }, [error]);

  return (
    <PageError
      title="No pudimos cargar tus alertas"
      description="No se pudo leer el feed en este momento. Reintenta en unos segundos."
      reset={reset}
      secondaryHref="/app/seguimiento"
      secondaryLabel="Ir a Seguimiento"
    />
  );
}
