import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";

/**
 * 404 global. Sin ilustraciones ni color: la tipografía lleva el estado.
 * Dos salidas reales: el catálogo (lo más útil) y el inicio.
 */
export default function NotFound() {
  return (
    <main id="main" className="pub-canvas flex min-h-[70vh] flex-col">
      <div className="container-page flex flex-1 flex-col justify-center py-20 md:py-28">
        <p className="label-line">Error 404</p>
        <h1 className="type-section mt-3 max-w-[20ch] text-ink-900">
          Esta página no existe.
        </h1>
        <p className="mt-4 max-w-[40rem] text-[15px] leading-relaxed text-ink-500">
          Puede que el enlace esté mal escrito, que el portafolio haya cambiado
          de nombre o que la página ya no esté publicada. El catálogo sigue
          disponible.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
          <ButtonLink href="/explore" size="lg">
            Explorar portafolios
          </ButtonLink>
          <Link
            href="/"
            className="inline-flex h-11 items-center text-[15px] text-ink-900 underline-offset-4 hover:underline"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </main>
  );
}
