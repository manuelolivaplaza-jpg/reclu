"use client";

import { useEffect, useRef } from "react";

/**
 * Sparkline — a tiny self-drawing SVG line chart for inline performance
 * visualization. Draws itself when scrolled into view.
 *
 * @param data normalized values (0-1, 0 = bottom). Any scale is mapped.
 */
export function Sparkline({
  data,
  className,
  color = "#2563eb",
}: {
  data: number[];
  className?: string;
  color?: string;
}) {
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    const length = path.getTotalLength();
    path.style.strokeDasharray = `${length}`;
    path.style.strokeDashoffset = `${length}`;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            path.style.transition = "stroke-dashoffset 1.4s cubic-bezier(0.16, 1, 0.3, 1)";
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

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 4) - 2;
    return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  });

  const linePath = points.join(" ");
  const areaPath = `${linePath} L ${W} ${H} L 0 ${H} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`spark-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#spark-${color.replace("#", "")})`} />
      <path
        ref={pathRef}
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
