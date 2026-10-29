"use client";

export function PageError({ title, reset }: { title: string; reset: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-app border border-app-border bg-white px-6 py-12 text-center shadow-app"
    >
      <p className="text-[17px] font-medium tracking-[-0.02em] text-ink-900">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-ink-500">
        Fue un problema temporal. Intenta de nuevo en unos segundos.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 inline-flex h-10 items-center rounded-full bg-ink-900 px-5 text-[14px] font-medium text-white hover:bg-black"
      >
        Reintentar
      </button>
    </div>
  );
}
