import { cn } from "@/lib/utils";

/**
 * EtfTickerAvatar (D11) — avatar tipográfico de un ETF.
 *
 * Fondo blanco fijo también en modo oscuro, filete de 1px y el ticker en
 * mayúsculas, centrado. El SVG usa `viewBox="0 0 100 100"`: el texto está en
 * unidades del viewBox, así que escala solo y se lee igual de nítido en 40px
 * (fila, card) que monumental en 320px (hero), o cuando el padre lo agranda
 * con `className`.
 *
 * Decorativo en el layout pero con nombre propio: `role="img"` +
 * `aria-label` con el ticker.
 */

/** Tamaño del texto en unidades del viewBox (100 = ancho del avatar). */
function fontSizeFor(ticker: string): number {
  const length = ticker.length;
  if (length <= 3) return 34;
  if (length === 4) return 29;
  if (length === 5) return 29;
  // Tickers más largos (no debería pasar): achicar sin volverse ilegible.
  return Math.max(14, Math.min(26, Math.round(112 / length)));
}

/**
 * ¿El `className` ya define el tamaño (ancho, alto o ambos)? En ese caso no
 * se fija la caja en `px`: el avatar sigue al contenedor (p. ej. `w-full`
 * dentro de un `aspect-*` de 320px) y se mantiene cuadrado.
 */
function hasSizingClass(className?: string): boolean {
  if (!className) return false;
  // `md:w-full`, `size-10`, `h-[320px]`... se comparan sin el prefijo de variante.
  const parts = className.split(/\s+/).flatMap((token) => token.split(":"));
  return parts.some(
    (part) =>
      part.startsWith("size-") ||
      part.startsWith("w-") ||
      part.startsWith("h-"),
  );
}

export interface EtfTickerAvatarProps {
  /** Ticker del ETF ("ARKK", "IBIT", "NANC"...). Se muestra en mayúsculas. */
  ticker: string;
  /** Lado en px cuando el padre no impone tamaño por `className`. */
  size?: number;
  className?: string;
}

export function EtfTickerAvatar({
  ticker,
  size = 40,
  className,
}: EtfTickerAvatarProps) {
  const normalized = ticker.trim().toUpperCase();
  const box = Number.isFinite(size) && size > 0 ? size : 40;

  const fontSize = fontSizeFor(normalized);
  const sizedByClass = hasSizingClass(className);
  // Inter: altura de mayúsculas ≈ 0.727em. Con la baseline a 50 + 0.36em el
  // bloque de mayúsculas queda centrado ópticamente en el cuadrado.
  const baseline = 50 + fontSize * 0.36;
  const tracking = -fontSize * 0.04;

  return (
    <span
      role="img"
      aria-label={normalized}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-[8px] border border-[#e6e6e6] bg-white font-bold leading-none tracking-[-0.04em] text-[#0a0a0a]",
        sizedByClass && "aspect-square",
        className,
      )}
      style={
        sizedByClass ? undefined : { width: box, height: box }
      }
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        focusable="false"
        className="block h-full w-full"
      >
        <rect width="100" height="100" fill="#ffffff" />
        <text
          x="50"
          y={baseline}
          textAnchor="middle"
          fill="#0a0a0a"
          fontSize={fontSize}
          fontWeight={700}
          letterSpacing={tracking}
        >
          {normalized}
        </text>
      </svg>
    </span>
  );
}
