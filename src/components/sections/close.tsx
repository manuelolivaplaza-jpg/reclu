import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { FadeIn } from "@/components/ui/reveal";

const secondaryLink =
  "inline-flex items-center justify-center text-[15px] text-ink-900 underline decoration-ink-300 underline-offset-[0.35em] [text-decoration-thickness:1px] transition-[text-decoration-color] duration-200 hover:decoration-ink-900 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-ink-900 dark:text-white dark:decoration-white/30 dark:hover:decoration-white dark:focus-visible:outline-white";

/**
 * Close — remate editorial: una frase a escala display, un filete y la
 * píldora negra. Sin caja, sin degradado, sin sombra.
 */
export function Close() {
  return (
    <section className="pub-canvas section-y border-t border-ink-300 dark:border-white/12">
      <div className="container-page">
        <FadeIn>
          <p className="label-line">Empieza</p>
          <h2 className="type-display mt-5 max-w-[12ch] text-ink-900 dark:text-white">
            Deja de revisar filings.
          </h2>
        </FadeIn>

        <FadeIn delay={0.1}>
          <div className="mt-10 flex flex-col gap-8 border-t border-ink-300 pt-8 dark:border-white/12 md:mt-14 md:flex-row md:items-end md:justify-between md:gap-12 md:pt-10">
            <p className="type-body max-w-[42ch]">
              Explora el catálogo sin cuenta. Sigue portafolios y recibe alertas con tu cuenta.
            </p>
            <div className="flex w-full flex-col items-stretch gap-4 sm:w-auto sm:flex-row sm:items-center sm:gap-6">
              <ButtonLink href="/signup" size="lg" className="w-full sm:w-auto">
                Empezar
              </ButtonLink>
              <Link href="/explore" className={secondaryLink}>
                Ver portafolios <span aria-hidden>→</span>
              </Link>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
