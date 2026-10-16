"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Sistema de animación SpaceX × Autopilot.
 * Física contenida, precisa y sobria: revelado al entrar en viewport,
 * staggers cortos y una sola curva — cubic-bezier(0.16, 1, 0.3, 1).
 * Cero sombras, cero color decorativo. Respeta prefers-reduced-motion.
 */

/** La curva del sistema. */
export const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const fadeInVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: EASE },
  },
} as const;

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
  const reduced = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={reduced ? undefined : { opacity: 0, y: 14 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.55, ease: EASE, delay: reduced ? 0 : delay }}
    >
      {children}
    </motion.div>
  );
}

const listVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06 },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: EASE },
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
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      style={style}
      initial={reduced ? undefined : "hidden"}
      whileInView={reduced ? undefined : "visible"}
      viewport={{ once: true, margin: "-40px" }}
      variants={reduced ? undefined : listVariants}
    >
      {children}
    </motion.div>
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
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      style={style}
      variants={reduced ? undefined : itemVariants}
    >
      {children}
    </motion.div>
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
  const reduced = useReducedMotion();
  const display = format ? format(value) : String(value);
  return (
    <motion.span
      className={cn("tabular-nums", className)}
      initial={reduced ? undefined : { opacity: 0, y: 10 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.55, ease: EASE }}
    >
      {display}
    </motion.span>
  );
}
