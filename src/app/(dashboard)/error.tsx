"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/app/error-state";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[reclu] dashboard error", error.digest ?? error.message);
  }, [error]);
  return <ErrorState title="No pudimos cargar esta sección" onRetry={reset} />;
}