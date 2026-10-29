import { ButtonLink } from "@/components/ui/button";
import { StatusArt } from "@/components/public/status-art";

export default function NotFound() {
  return (
    <div className="pub-canvas flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div className="pub-card pub-rise w-full max-w-lg overflow-hidden">
        <div className="border-b border-ink-200 bg-ink-50/60 px-6 pb-2 pt-6">
          <div className="flex items-center justify-between">
            <span className="pub-chip">Error 404</span>
            <span className="num text-[13px] text-ink-500">Sin datos</span>
          </div>
          <div className="mt-3">
            <StatusArt variant="404" />
          </div>
        </div>
        <div className="p-6 md:p-8">
          <h1 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] text-ink-900 md:text-[32px]">
            Página no encontrada
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-500">
            La página que buscas no existe o fue movida. Puede que el portafolio haya sido
            descontinuado o el enlace esté incorrecto.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/" size="lg" className="w-full sm:w-auto">
              Ir al inicio
            </ButtonLink>
            <ButtonLink href="/explore" variant="outline" size="lg" className="w-full sm:w-auto">
              Explorar portafolios
            </ButtonLink>
          </div>
        </div>
      </div>
    </div>
  );
}
