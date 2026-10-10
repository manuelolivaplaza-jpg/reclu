"use client";

import { useEffect, useRef } from "react";

/**
 * Animated portfolio chart — an SVG line chart that draws itself on mount,
 * used as the hero's visual anchor. Pure SVG + CSS (no chart library),
 * matches the light brand palette.
 *
 * The line represents an illustrative upward trend (AI/tech portfolio);
 * the animation plays once when scrolled into view.
 */
export function HeroChart({ className }: { className?: string }) {
  const pathRef = useRef<SVGPathElement>(null);
  const areaRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const path = pathRef.current;
    const area = areaRef.current;
    if (!path || !area) return;

    const length = path.getTotalLength();
    path.style.strokeDasharray = `${length}`;
    path.style.strokeDashoffset = `${length}`;
    area.style.opacity = "0";

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            path.style.transition = "stroke-dashoffset 2s cubic-bezier(0.16, 1, 0.3, 1)";
            path.style.strokeDashoffset = "0";
            area.style.transition = "opacity 1.5s ease 0.5s";
            area.style.opacity = "1";
            observer.disconnect();
          }
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(path);
    return () => observer.disconnect();
  }, []);

  // Illustrative data points (normalized 0-1 within viewBox)
  const points = [
    [0, 0.72],
    [0.08, 0.68],
    [0.16, 0.7],
    [0.25, 0.62],
    [0.33, 0.58],
    [0.42, 0.6],
    [0.5, 0.5],
    [0.58, 0.44],
    [0.66, 0.46],
    [0.75, 0.36],
    [0.83, 0.3],
    [0.91, 0.22],
    [1.0, 0.14],
  ];

  const W = 600;
  const H = 300;
  const PAD = 20;

  const toXY = ([px, py]: number[]) => [
    PAD + px * (W - 2 * PAD),
    PAD + py * (H - 2 * PAD),
  ];

  const linePath = points
    .map((p, i) => {
      const [x, y] = toXY(p);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  const areaPath = `${linePath} L ${(W - PAD).toFixed(1)} ${(H - PAD).toFixed(1)} L ${PAD} ${(H - PAD).toFixed(1)} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      role="img"
      aria-label="Gráfico ilustrativo de rendimiento de portafolio"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="hero-line-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
        <linearGradient id="hero-area-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Horizontal grid lines */}
      {[0.25, 0.5, 0.75].map((gy) => (
        <line
          key={gy}
          x1={PAD}
          y1={PAD + gy * (H - 2 * PAD)}
          x2={W - PAD}
          y2={PAD + gy * (H - 2 * PAD)}
          stroke="#eef2f7"
          strokeWidth="1"
        />
      ))}

      {/* Area fill */}
      <path ref={areaRef} d={areaPath} fill="url(#hero-area-grad)" />

      {/* Main line */}
      <path
        ref={pathRef}
        d={linePath}
        fill="none"
        stroke="url(#hero-line-grad)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* End-point dot with pulse */}
      <circle cx={W - PAD} cy={PAD + 0.14 * (H - 2 * PAD)} r="5" fill="#10b981">
        <animate attributeName="r" values="5;7;5" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx={W - PAD} cy={PAD + 0.14 * (H - 2 * PAD)} r="9" fill="#10b981" opacity="0.2" />
    </svg>
  );
}
