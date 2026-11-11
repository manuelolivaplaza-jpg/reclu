import { absoluteUrl } from "@/lib/site";
import { itemListSchema, withSeo } from "@/lib/seo";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { JsonLd } from "@/components/json-ld";
import { AVISO_APRENDE, FICHAS_APRENDE } from "@/content/aprende";

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
              <ul className="border-t border-ink-300 dark:border-white/12">
                {FICHAS_APRENDE.map((ficha, i) => (
                  <li key={ficha.slug} className="border-b border-ink-300 dark:border-white/12">
                    <Link href={`/aprende/${ficha.slug}`} className="group flex gap-4 py-7 sm:gap-6">
                      <span aria-hidden className="num mt-1.5 w-6 shrink-0 text-[12px] text-ink-400 dark:text-ink-500">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h2 className="text-[22px] font-medium tracking-[-0.03em] text-ink-900 transition-colors group-hover:text-ink-600 dark:text-white dark:group-hover:text-ink-300">
                          {ficha.titulo}
                        </h2>
                        <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-ink-600 dark:text-ink-400">
                          {ficha.resumen}
                        </p>
                        <span className="mt-4 inline-block border-b border-ink-900 pb-0.5 text-[12px] font-medium text-ink-900 dark:border-white dark:text-white">
                          Leer la ficha
                        </span>
                      </div>
                      <span aria-hidden className="hidden shrink-0 self-center text-ink-400 transition-transform group-hover:translate-x-1 sm:block dark:text-ink-500">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <aside className="border-ink-300 lg:col-span-4 lg:border-l lg:pl-12 dark:border-white/12">
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
            </aside>
          </div>

          {/* TODO(F16): reemplazar por src/components/legal/legal-notice.tsx */}
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
