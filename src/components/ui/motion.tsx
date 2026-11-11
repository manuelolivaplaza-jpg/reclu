"use client";

import { LazyMotion, MotionConfig, m, useReducedMotion } from "framer-motion";
import { loadMotionFeatures } from "@/lib/load-motion-features";
import { cn } from "@/lib/utils";

/**
 * Sistema de animación SpaceX × Autopilot.
 * Física contenida, precisa y sobria: revelado al entrar en viewport,
 * staggers cortos y una sola curva — cubic-bezier(0.16, 1, 0.3, 1).
 * Desplazamientos de 10px como máximo, sin rebotes ni escalados.
 * Cero sombras, cero color decorativo.
 *
 * Con `prefers-reduced-motion: reduce` no hay desplazamiento, ni fundido,
 * ni stagger: el contenido aparece tal cual y de inmediato. `MotionConfig`
 * con `reducedMotion="user"` repite la preferencia para cualquier
 * `motion.*` que viva dentro de estos componentes.
 */

/** La curva del sistema. Una sola: fuera easings elásticos o "suaves". */
export const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** Ritmo del sistema: corto y sobrio (nada de animaciones de 800ms). */
const DURATION = 0.5;
/** Desplazamiento vertical máximo, en px. */
const OFFSET = 10;
/** Desplazamiento de cifras: un punto más discreto. */
const OFFSET_NUMBER = 8;
/** Stagger entre hijos de una lista. */
const STAGGER = 0.05;

export const fadeInVariants = {
  hidden: { opacity: 0, y: OFFSET },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION, ease: EASE },
  },
} as const;

/**
 * Contexto compartido: features de framer-motion en diferido (LazyMotion,
 * no engordan el bundle inicial) + `reducedMotion="user"` como segunda red
 * de seguridad para el movimiento de los hijos.
 */
function MotionRoot({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={loadMotionFeatures}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

/** true solo cuando el usuario pidió explícitamente movimiento reducido. */
function useStill() {
  return useReducedMotion() === true;
}

/**
 * FadeIn — revela el children al entrar en viewport (una sola vez).
 * Envuelve en un div neutro; sin padding ni color.
 */
export function FadeIn({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const still = useStill();

  return (
    <MotionRoot>
      <m.div
        className={className}
        initial={still ? undefined : { opacity: 0, y: OFFSET }}
        whileInView={still ? undefined : { opacity: 1, y: 0 }}
        viewport={still ? undefined : { once: true, margin: "-40px" }}
        transition={{ duration: DURATION, ease: EASE, delay: still ? 0 : delay }}
      >
        {children}
      </m.div>
    </MotionRoot>
  );
}

const listVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: STAGGER },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: OFFSET },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION, ease: EASE },
  },
} as const;

/**
 * StaggerList — contenedor que revela sus StaggerItem uno tras otro.
 * No renderiza un wrapper visual: hereda el layout del children (ul, div...).
 * En reduced-motion no aplica variants y el contenido se muestra directo.
 */
export function StaggerList({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const still = useStill();
  return (
    <MotionRoot>
      <m.div
        className={className}
        style={style}
        initial={still ? undefined : "hidden"}
        whileInView={still ? undefined : "visible"}
        viewport={still ? undefined : { once: true, margin: "-40px" }}
        variants={still ? undefined : listVariants}
      >
        {children}
      </m.div>
    </MotionRoot>
  );
}

/**
 * StaggerItem — hijo de StaggerList. Debe ir directamente dentro de él.
 */
export function StaggerItem({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const still = useStill();
  return (
    <MotionRoot>
      <m.div
        className={className}
        style={style}
        variants={still ? undefined : itemVariants}
      >
        {children}
      </m.div>
    </MotionRoot>
  );
}

/**
 * AnimatedNumber — cifra clave que entra con un leve revelado vertical.
 * Mantiene tabular-nums para que el ancho no salte durante la animación.
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
  const still = useStill();
  const display = format ? format(value) : String(value);
  return (
    <MotionRoot>
      <m.span
        className={cn("tabular-nums", className)}
        initial={still ? undefined : { opacity: 0, y: OFFSET_NUMBER }}
        whileInView={still ? undefined : { opacity: 1, y: 0 }}
        viewport={still ? undefined : { once: true, margin: "-40px" }}
        transition={{ duration: DURATION, ease: EASE }}
      >
        {display}
      </m.span>
    </MotionRoot>
  );
}
