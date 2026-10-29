"use client";

import dynamic from "next/dynamic";

/**
 * CommandPalette en diferido: el JS (framer-motion incluido) se descarga
 * después de hidratar. Placeholder del mismo tamaño para evitar CLS.
 */
export const CommandPalette = dynamic(
  () => import("@/components/command-palette").then((mod) => mod.CommandPalette),
  { ssr: false, loading: () => <span aria-hidden className="inline-block size-10" /> },
);
