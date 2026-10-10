import { ButtonLink } from "@/components/ui/button";

/**
 * Close — cierre en blanco, sin caja ni degradado. H2 grande y un botón.
 */
export function Close() {
  return (
    <section className="bg-white py-24 md:py-32">
      <div className="container-page">
        <h2 className="type-display max-w-[12ch] text-ink-900">
          Deja de revisar filings.
        </h2>
        <div className="mt-8">
          <ButtonLink href="/signup" size="lg">
            Empezar
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
