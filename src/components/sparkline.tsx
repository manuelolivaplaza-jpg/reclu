"use client";

import { useEffect, useRef } from "react";

/**
 * Sparkline — línea fina que se dibuja al entrar en viewport.
 * Sin relleno de área, sin gradiente. Trazo negro de 1.5px por defecto.
 *
 * @param data valores (cualquier escala, se normaliza).
 * @param stroke color del trazo, por defecto #0a0a0a.
 * @param strokeWidth grosor, por defecto 1.5.
 */
export function Sparkline({
  data,
  className,
  stroke = "#0a0a0a",
  strokeWidth = 1.5,
}: {
  data: number[];
  className?: string;
  stroke?: string;
  strokeWidth?: number;
}) {
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const length = path.getTotalLength();
    if (reduced) {
      // Sin animación: el trazo aparece completo.
      path.style.strokeDasharray = "none";
      path.style.strokeDashoffset = "0";
      return;
    }
    path.style.strokeDasharray = `${length}`;
    path.style.strokeDashoffset = `${length}`;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            path.style.transition = "stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1)";
            path.style.strokeDashoffset = "0";
            observer.disconnect();
          }
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(path);
    return () => observer.disconnect();
  }, [data]);

  const W = 200;
  const H = 48;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const linePath = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H - ((v - min) / range) * (H - 4) - 2;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        ref={pathRef}
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
