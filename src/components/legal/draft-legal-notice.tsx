/**
 * Marca visible de texto legal en borrador (F75). La revisión de un abogado
 * (Ley 21.719 y Ley Fintec 21.521) es obligatoria antes de publicar.
 */
export function DraftLegalNotice({ scope }: { scope: string }) {
  return (
    <aside
      aria-label="Borrador en revisión legal"
      className="mt-3 border border-ink-300 bg-ink-50/60 px-4 py-3.5 text-[13px] leading-[1.6] text-ink-700 dark:border-white/20 dark:bg-white/5 dark:text-ink-300 print:break-inside-avoid print:border-ink-300 print:bg-transparent print:text-black"
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-900 dark:text-white">
        Borrador en revisión legal
      </p>
      <p className="mt-1.5">
        Esta sección se publica como borrador mientras un abogado verifica el
        cumplimiento de la Ley 21.719 (datos personales) y la Ley Fintec 21.521
        (asesoría de inversión). Su redacción puede cambiar antes de la versión
        definitiva.
      </p>
      <p className="mt-2 text-[12px] text-ink-500 dark:text-ink-400">
        <span className="font-medium text-ink-700 dark:text-ink-200">Nota para la revisión: </span>
        {scope}
      </p>
    </aside>
  );
}
