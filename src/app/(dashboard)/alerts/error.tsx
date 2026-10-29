"use client";

import { PageError } from "./page-error";

export default function AlertsError({ reset }: { error: Error; reset: () => void }) {
  return <PageError title="No pudimos cargar tus alertas" reset={reset} />;
}
