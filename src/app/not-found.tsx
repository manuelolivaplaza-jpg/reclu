import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-20 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        <Compass className="size-7" />
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
        Página no encontrada
      </h1>
      <p className="mt-3 max-w-md text-ink-600">
        La página que buscas no existe o fue movida. Puede que el portafolio haya sido
        descontinuado o el enlace esté incorrecto.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/"
          className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-600 px-5 text-sm font-medium text-white shadow-subtle transition-colors hover:bg-brand-700"
        >
          Ir al inicio
        </Link>
        <Link
          href="/explore"
          className="inline-flex h-10 items-center justify-center rounded-lg border border-ink-300 bg-white px-5 text-sm font-medium text-ink-900 shadow-subtle transition-colors hover:bg-ink-50"
        >
          Explorar portafolios
        </Link>
      </div>
    </div>
  );
}
