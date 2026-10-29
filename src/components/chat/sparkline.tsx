/** Mini-gráfico SVG sin librerías (mismo enfoque que los gráficos de Reclu). */
export function Sparkline({ values, positive }: { values: number[]; positive: boolean }) {
  if (values.length < 2) return <div className="h-10 w-24 rounded bg-white/5" aria-hidden="true" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 96;
  const h = 40;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - ((v - min) / span) * (h - 4) - 2).toFixed(1)}`);
  const color = positive ? "#22c55e" : "#ef4444";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-10 w-24" aria-hidden="true">
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
