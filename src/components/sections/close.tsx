import { ButtonLink } from "@/components/ui/button";
import { FadeIn } from "@/components/ui/motion";

/**
 * Close — cierre en blanco, sin caja ni degradado. H2 grande y un botón.
 */
export function Close() {
  return (
    <section className="border-t border-ink-200 bg-white py-32 md:py-40 lg:py-48">
      <div className="container-page">
        <FadeIn>
          <h2 className="type-display max-w-[12ch] text-ink-900">
            Deja de revisar filings.
          </h2>
        </FadeIn>
        <FadeIn delay={0.1}>
          <div className="mt-10 md:mt-12">
            <ButtonLink href="/signup" size="lg">
              Empezar
            </ButtonLink>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
