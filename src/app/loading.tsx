/**
 * Loading UI — shown while route segments stream in.
 * Neutral skeleton matching the site's aesthetic.
 */
export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" aria-busy="true" aria-live="polite">
      <div className="flex flex-col items-center gap-4">
        <div className="size-10 animate-spin rounded-full border-3 border-ink-200 border-t-brand-600" />
        <p className="text-sm text-ink-500">Cargando…</p>
      </div>
    </div>
  );
}
