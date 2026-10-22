"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Estado del header respecto al scroll.
 *
 * Reglas:
 * - Con `scrollY < threshold` el header SIEMPRE está visible (no se oculta
 *   nunca en la parte superior de la página).
 * - Al bajar (scrollY aumenta) el header se oculta.
 * - Al subir (scrollY disminuye) el header vuelve a aparecer.
 * - Si la posición no cambia, se conserva el estado anterior.
 *
 * `prevY` es el scrollY anterior; `y` el actual.
 */
export function nextHidden(
  prevY: number,
  y: number,
  hidden: boolean,
  threshold: number,
): boolean {
  if (y < threshold) return false;
  if (y > prevY) return true;
  if (y < prevY) return false;
  return hidden;
}

/**
 * useHideOnScroll — hook de cliente para ocultar la barra al bajar y
 * mostrarla al subir. Respeta `prefers-reduced-motion` en el CSS
 * (`motion-reduce:transition-none`).
 */
export function useHideOnScroll(threshold = 10): boolean {
  const [hidden, setHidden] = useState(false);
  const prevY = useRef(0);
  const hiddenRef = useRef(false);

  useEffect(() => {
    prevY.current = window.scrollY;
    hiddenRef.current = false;
    setHidden(false);

    const onScroll = () => {
      const y = window.scrollY;
      const next = nextHidden(prevY.current, y, hiddenRef.current, threshold);
      prevY.current = y;
      hiddenRef.current = next;
      setHidden(next);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return hidden;
}
