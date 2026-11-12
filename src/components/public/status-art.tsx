/**
 * Ilustración SVG de las páginas de estado (404 / error). Sin datos reales.
 *
 * Decorativa y monocroma: todo el trazo sale de `currentColor`, así sigue el
 * esquema de color (tinta en claro, blanco en oscuro) sin rojo ni grises
 * fijos. La grilla usa filetes de 1px reales (`vectorEffect`) para no
 * engrosarse al escalar.
 */
export function StatusArt({ variant }: { variant: "404" | "error" }) {
  const d =
    variant === "404"
      ? "M0,70 L30,62 L60,66 L90,48 L120,54 L150,36 L170,40 L190,40 L200,40"
      : "M0,40 L30,46 L60,38 L90,52 L120,44 L150,58 L170,74 L190,86 L200,90";
  return (
    <svg
      viewBox="0 0 200 100"
      className="h-auto w-full text-ink-900 dark:text-white"
      aria-hidden="true"
      focusable="false"
    >
      <g stroke="currentColor" strokeOpacity="0.18" strokeWidth="1">
        {[25, 50, 75].map((y) => (
          <line
            key={y}
            x1="0"
            x2="200"
            y1={y}
            y2={y}
            strokeDasharray="2 4"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
      <path
        d={`${d} L200,100 L0,100 Z`}
        fill="currentColor"
        fillOpacity="0.06"
      />
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {variant === "404" ? (
        <>
          <line
            x1="170"
            x2="200"
            y1="40"
            y2="40"
            stroke="currentColor"
            strokeOpacity="0.45"
            strokeWidth="1"
            strokeDasharray="3 4"
            vectorEffect="non-scaling-stroke"
          />
          <circle cx="170" cy="40" r="3" fill="currentColor" />
        </>
      ) : (
        <circle cx="200" cy="90" r="3" fill="currentColor" />
      )}
    </svg>
  );
}
