import { cn } from "@/lib/utils";

/**
 * d65: revelado al entrar en viewport SOLO con CSS (scroll-driven
 * animations). Sin JS ni framer-motion: el HTML inicial ya es visible, así
 * que el LCP no espera la hidratación. Lo que ya está en pantalla al cargar
 * se pinta de inmediato; sin soporte de `animation-timeline` o con
 * prefers-reduced-motion no hay animación. Sirve en Server y Client
 * Components (no usa hooks). Ver `.reveal` en globals.css.
 */
export function FadeIn({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
  /** Se mantiene por compatibilidad; el revelado CSS no usa retraso. */
  delay?: number;
}) {
  return <div className={cn("reveal", className)}>{children}</div>;
}

/** Contenedor de una lista revelada (cada StaggerItem se revela solo). */
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
    <div className={cn("reveal", className)} style={style}>
      {children}
    </div>
  );
}
