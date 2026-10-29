/** Ilustración SVG de las páginas de estado (404 / error). Sin datos reales. */
export function StatusArt({ variant }: { variant: "404" | "error" }) {
  const stroke = variant === "404" ? "#0a0a0a" : "#c81e1e";
  const d =
    variant === "404"
      ? "M0,70 L30,62 L60,66 L90,48 L120,54 L150,36 L170,40 L190,40 L200,40"
      : "M0,40 L30,46 L60,38 L90,52 L120,44 L150,58 L170,74 L190,86 L200,90";
  return (
    <svg viewBox="0 0 200 100" className="h-auto w-full" aria-hidden>
      <defs>
        <linearGradient id={`st-${variant}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.14" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[25, 50, 75].map((y) => (
        <line key={y} x1="0" x2="200" y1={y} y2={y} stroke="#e6e6e6" strokeDasharray="2 4" />
      ))}
      <path d={`${d} L200,100 L0,100 Z`} fill={`url(#st-${variant})`} />
      <path d={d} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={variant === "404" ? "0" : "0"} />
      {variant === "404" ? (
        <>
          <line x1="170" x2="200" y1="40" y2="40" stroke="#c4c4c4" strokeWidth="2" strokeDasharray="3 4" />
          <circle cx="170" cy="40" r="4" fill="#0a0a0a" />
        </>
      ) : (
        <circle cx="200" cy="90" r="4" fill="#c81e1e" />
      )}
    </svg>
  );
}
