/**
 * DemoBadge — etiqueta visible para datos de ejemplo.
 * Se muestra cuando la página sirve datos de demo-data.ts (sin Supabase
 * configurado o base vacía). Evita confundir datos ilustrativos con datos
 * reales del mercado.
 */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 border border-ink-200 bg-white px-2.5 py-1 text-[11px] font-medium tracking-[0.04em] text-ink-600 " +
        (className ?? "")
      }
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-ink-900" />
      Datos de ejemplo
    </span>
  );
}
