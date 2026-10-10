import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-20 text-center">
      <h1 className="type-section text-ink-900">Página no encontrada.</h1>
      <p className="type-body mt-4 max-w-md">
        La página que buscas no existe o fue movida. Puede que el portafolio haya sido
        descontinuado o el enlace esté incorrecto.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <ButtonLink href="/" size="lg">
          Ir al inicio
        </ButtonLink>
        <ButtonLink href="/explore" variant="outline" size="lg">
          Explorar portafolios
        </ButtonLink>
      </div>
    </div>
  );
}
