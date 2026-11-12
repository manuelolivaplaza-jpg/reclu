import { cn } from "@/lib/utils";

/**
 * Sparkline de las tarjetas del chat: línea fina, sin relleno ni degradado.
 *
 * - Trazo de 1.5px que no se engrosa al estirar el SVG (`non-scaling-stroke`).
 * - Decorativa por defecto: la cifra de retorno siempre va al lado, así que
 *   se oculta a lectores de pantalla. Si se pasa `label`, se expone como
 *   imagen con esa descripción.
 * - Con menos de dos puntos válidos no se inventa una línea: se pinta un
 *   filete de 1px que conserva el espacio de la tarjeta.
 */
export function Sparkline({
  values,
  className = "h-9 w-24",
  label,
}: {
  values: number[];
  className?: string;
  /** Descripción para lectores de pantalla. Sin ella, el gráfico es decorativo. */
  label?: string;
}) {
  const usable = values.filter((value) => Number.isFinite(value));

  if (usable.length < 2) {
    return (
      <span
        aria-hidden="true"
        className={cn("block h-9 w-24 border-t border-app-border", className)}
      />
    );
  }

  const min = Math.min(...usable);
  const max = Math.max(...usable);
  const span = max - min || 1;
  const width = 200;
  const height = 48;
  const pad = 4;

  const points = usable
    .map((value, index) => {
      const x = (index / (usable.length - 1)) * width;
      const y = height - ((value - min) / span) * (height - pad * 2) - pad;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("block text-ink-900", className)}
      role={label ? "img" : undefined}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      focusable="false"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
