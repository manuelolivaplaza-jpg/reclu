/**
 * Loading — aro negro que gira, centrado.
 */
export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" aria-busy="true" aria-live="polite">
      <div className="size-8 animate-spin rounded-full border-2 border-ink-200 border-t-ink-900" />
    </div>
  );
}
