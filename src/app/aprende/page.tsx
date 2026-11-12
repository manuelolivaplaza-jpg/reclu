import { absoluteUrl } from "@/lib/site";
import { itemListSchema, withSeo } from "@/lib/seo";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { JsonLd } from "@/components/json-ld";
import {
  BuscadorFichas,
  type FichaListado,
} from "@/components/aprende-buscar/buscador-fichas";
import { AVISO_APRENDE, FICHAS_APRENDE } from "@/content/aprende";

/** Solo lo que el listado muestra: slug, título y resumen. */
const FICHAS_LISTADO: readonly FichaListado[] = FICHAS_APRENDE.map(
  ({ slug, titulo, resumen }) => ({ slug, titulo, resumen }),
);

export const metadata: Metadata = withSeo("/aprende", {
  title: "Aprende",
  description:
    "Fichas cortas sobre 13F, Form 4, PTR y la STOCK Act, OGE 278-T, hechos esenciales, AFP, InfoProbidad, sesgos, la Ley Fintec y la DJ 1929.",
});

export default function AprendePage() {
  return (
    <>
      <JsonLd
        data={itemListSchema(
          "Fichas de Aprende",
          FICHAS_APRENDE.map((ficha) => ({
            name: ficha.titulo,
            url: absoluteUrl(`/aprende/${ficha.slug}`),
          })),
        )}
      />
      <SiteHeader />
      <main id="main" className="bg-white dark:bg-ink-950">
        <div className="container-page pb-24 pt-10 md:pt-14">
          {/* Cabecera editorial a todo el ancho del lienzo (1560px). */}
          <header className="border-b border-ink-300 pb-10 dark:border-white/12 md:pb-12">
            <p className="label-line">Educación</p>
            <h1 className="type-section mt-4 text-ink-900 dark:text-white">Aprende.</h1>
            <p className="type-body mt-6 max-w-2xl">
              {FICHAS_APRENDE.length} fichas cortas sobre los documentos públicos que usa fraccion.si. Cada
              una dice solo lo que está en sus fuentes, con el enlace al final. Si un número no está en la
              fuente, no está en la ficha.
            </p>
          </header>

          {/* Cuerpo: artículos a medida legible + rail editorial. */}
          <div className="mt-12 grid gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-8">
              <BuscadorFichas fichas={FICHAS_LISTADO} />
            </div>

            <aside className="border-t border-ink-300 pt-8 lg:col-span-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-12 dark:border-white/12">
              <section>
                <h2 className="label-line">Cómo se calcula</h2>
                <p className="mt-3 max-w-[42ch] text-[14px] leading-relaxed text-ink-600 dark:text-ink-400">
                  Cada rendimiento sale de precios de cierre y fuentes públicas. Las reglas completas están
                  en la metodología.
                </p>
                <Link
                  href="/metodologia"
                  className="mt-4 inline-flex items-center gap-1.5 border-b border-ink-900 pb-0.5 text-[13px] font-medium text-ink-900 dark:border-white dark:text-white"
                >
                  Metodología <span aria-hidden>→</span>
                </Link>
              </section>

              <section className="mt-10 border-t border-ink-300 pt-8 dark:border-white/12">
                <h2 className="label-line">Glosario</h2>
                <p className="mt-3 max-w-[42ch] text-[14px] leading-relaxed text-ink-600 dark:text-ink-400">
                  Los mismos conceptos, ordenados de la A a la Z y enlazados a su ficha, para
                  cuando llegas con una sigla en la mano.
                </p>
                <Link
                  href="/glosario"
                  className="mt-4 inline-flex items-center gap-1.5 border-b border-ink-900 pb-0.5 text-[13px] font-medium text-ink-900 dark:border-white dark:text-white"
                >
                  Abrir el glosario <span aria-hidden>→</span>
                </Link>
              </section>
            </aside>
          </div>

          <section className="mt-16 max-w-3xl border-t border-ink-300 pt-8 dark:border-white/12">
            <h2 className="text-[13px] font-medium text-ink-900 dark:text-white">Aviso</h2>
            <p className="mt-3 text-[12px] leading-relaxed text-ink-500 dark:text-ink-400">
              {AVISO_APRENDE}
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
