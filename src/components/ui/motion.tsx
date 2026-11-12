import { cn } from "@/lib/utils";

/**
 * Alias histórico de `@/components/ui/reveal`.
 *
 * El sistema de revelado es CSS puro (scroll-driven) y vive en `reveal.tsx`:
 * sin framer-motion, sin `"use client"`, sin hidratación y con
 * `prefers-reduced-motion` respetado tanto en CSS como con las utilidades
 * `motion-reduce:*`. Este módulo se mantiene para no romper imports antiguos
 * y no duplica una segunda implementación.
 */
export { FadeIn, StaggerList, StaggerItem } from "./reveal";

/**
 * La curva única del sistema (coincide con `reveal-up` y `details-reveal`
 * en `globals.css`). Se exporta por compatibilidad para estilos inline que
 * necesiten la misma easing.
 */
export const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/**
 * Cifra con `num` (tabular, tracking apretado). Conserva el nombre por
 * compatibilidad: ya no anima — el sistema no mueve cifras, y el revelado del
 * bloque contenedor lo aporta `FadeIn`/`.reveal`.
 */
export function AnimatedNumber({
  value,
  className,
  format,
}: {
  value: number;
  className?: string;
  format?: (v: number) => string;
}) {
  return (
    <span className={cn("num", className)}>{format ? format(value) : String(value)}</span>
  );
}
