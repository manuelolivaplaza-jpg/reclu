import { withSeo } from "@/lib/seo";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AVISO_APRENDE, FICHAS_APRENDE } from "@/content/aprende";

export const metadata: Metadata = withSeo("/aprende", {
  title: "Aprende",
  description:
    "Fichas cortas sobre 13F, Form 4, PTR y la STOCK Act, OGE 278-T, hechos esenciales, AFP, InfoProbidad, sesgos, la Ley Fintec y la DJ 1929.",
});

export default function AprendePage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <div className="container-page max-w-3xl py-16 md:py-20">
          <p className="label-line">Educación</p>
          <h1 className="type-section mt-3 text-ink-900">Aprende.</h1>
          <p className="type-body mt-5">
            Diez fichas cortas sobre los documentos públicos que usa fraccion.si.
            Cada una dice solo lo que está en sus fuentes, con el enlace al
            final. Si un número no está en la fuente, no está en la ficha.
          </p>

          <ul className="mt-12 border-y border-ink-200">
            {FICHAS_APRENDE.map((ficha) => (
              <li key={ficha.slug} className="border-b border-ink-200 last:border-b-0">
                <Link
                  href={`/aprende/${ficha.slug}`}
                  className="block py-6 hover:text-ink-900"
                >
                  <h2 className="text-[22px] font-medium tracking-[-0.03em] text-ink-900">
                    {ficha.titulo}
                  </h2>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-600">
                    {ficha.resumen}
                  </p>
                  <p className="mt-3 text-[13px] underline underline-offset-4">
                    Leer la ficha
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          <p className="mt-10 text-[14px] text-ink-600">
            Cómo se calculan los rendimientos está en{" "}
            <Link href="/metodologia" className="underline underline-offset-4">
              Metodología
            </Link>
            .
          </p>

          {/* TODO(F16): reemplazar por src/components/legal/legal-notice.tsx */}
          <section className="mt-16 border-t border-ink-200 pt-8">
            <h2 className="text-[15px] font-medium text-ink-900">Aviso</h2>
            <p className="mt-3 text-xs leading-relaxed text-ink-500">
              {AVISO_APRENDE}
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
