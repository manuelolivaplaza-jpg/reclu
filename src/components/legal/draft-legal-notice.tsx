/**
 * Marca visible de texto legal en borrador (F75). La revisión de un abogado
 * (Ley 21.719 y Ley Fintec 21.521) es obligatoria antes de publicar.
 */
export function DraftLegalNotice({ scope }: { scope: string }) {
  return (
    <div className="mt-3 border border-ink-900 p-4 text-[13px] leading-relaxed text-ink-700">
      <p className="font-medium uppercase tracking-[0.08em] text-ink-900">
        Borrador — pendiente revisión de abogado
      </p>
      <p className="mt-1.5">
        Este texto no es la versión final. Debe revisarlo un abogado antes del
        lanzamiento para verificar el cumplimiento de la Ley 21.719 (datos
        personales) y la Ley Fintec 21.521 (asesoría de inversión). {scope}
      </p>
    </div>
  );
}
