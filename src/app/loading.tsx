/**
 * Loading — aro negro que gira, centrado, sin color de marca.
 */
export default function Loading() {
  return (
    <div
      className="flex min-h-[60vh] items-center justify-center bg-canvas"
      role="status"
      aria-live="polite"
    >
      <div
        aria-hidden
        className="size-8 animate-spin rounded-full border-2 border-ink-200 border-t-ink-900 motion-reduce:animate-none"
      />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
