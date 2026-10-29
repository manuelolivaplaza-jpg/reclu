"use client";

import { PageError } from "./page-error";

export default function CompareError({ reset }: { error: Error; reset: () => void }) {
  return <PageError title="No pudimos cargar la comparación" reset={reset} />;
}
