import { cn } from "@/lib/utils";

/**
 * d65: revelado al entrar en viewport SOLO con CSS (scroll-driven
 * animations). Sin JS ni framer-motion: el HTML inicial ya es visible, así
 * que el LCP no espera la hidratación. Lo que ya está en pantalla al cargar
 * se pinta de inmediato; sin soporte de `animation-timeline` no hay
 * animación y el bloque se ve tal cual. Sirve en Server y Client Components
 * (no usa hooks). Los keyframes (`.reveal` / `reveal-up`) viven en
 * globals.css.
 *
 * Red de seguridad: `motion-reduce:*` anula la animación y fuerza opacidad
 * 1 y transformación nula cuando el usuario prefiere movimiento reducido,
 * de modo que NUNCA quede un bloque atascado en `opacity: 0`. `print:*`
 * hace lo mismo al imprimir, donde el scroll-timeline no existe.
 */
const REVEAL =
  "reveal motion-reduce:animate-none motion-reduce:opacity-100 motion-reduce:transform-none print:animate-none print:opacity-100 print:transform-none";

export function FadeIn({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
  /**
   * Se mantiene por compatibilidad de API: el revelado CSS es scroll-driven
   * y no admite retraso por tiempo (cada bloque arranca con su scroll).
   */
  delay?: number;
}) {
  return <div className={cn(REVEAL, className)}>{children}</div>;
}

/**
 * Contenedor de una lista revelada (cada StaggerItem se revela solo, con su
 * propio rango de scroll). Se mantiene neutro: sin clase, sin estilo propio,
 * para poder ser `ul`, `div` o lo que pida el layout.
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
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}

export function StaggerItem({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={cn(REVEAL, className)} style={style}>
      {children}
    </div>
  );
}
