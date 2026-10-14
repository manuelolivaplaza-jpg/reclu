/**
 * SourceLine — una sola línea con las fuentes, entre dos filetes.
 * Sin chips, sin sombras, sin stats.
 */
export function SourceLine() {
  return (
    <div className="border-y border-ink-200 py-6 md:py-7">
      <p className="label-line container-page text-center text-pretty tracking-[0.015em]">
        Capitol Trades · Renta 4 · LarrainVial · BTG Pactual · InfoProbidad · SEC 13F
      </p>
    </div>
  );
}
