"use client";

import { useEffect } from "react";
import { PageError } from "./page-error";

export default function CompareError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[reclu] comparar error", error.digest ?? error.message);
  }, [error]);

  return (
    <PageError
      title="No pudimos cargar la comparación"
      description="No se pudo leer tu cartera ni el catálogo. Reintenta en unos segundos."
      reset={reset}
      secondaryHref="/app/explorar"
      secondaryLabel="Ir a Explorar"
    />
  );
}
