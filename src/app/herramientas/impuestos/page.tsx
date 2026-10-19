import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { LegalNotice } from "@/components/legal/legal-notice";
import { GUIAS_OFICIALES, PLAZOS, TaxWizard } from "@/components/tax/tax-wizard";

export const metadata: Metadata = {
  title: "Impuestos · DJ 1929",
  description:
    "Asistente paso a paso para ordenar los montos de la Declaración Jurada 1929 y la renta del Formulario 22. Corre en tu navegador, sin enviar datos al servidor.",
};

export default function ImpuestosPage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <div className="container-page max-w-4xl py-16 md:py-20">
          <p className="label-line">Herramientas</p>
          <h1 className="type-section mt-3 text-ink-900">Impuestos.</h1>
          <p className="type-body mt-5 max-w-2xl">
            Ordena los montos de tus inversiones en el exterior para la
            Declaración Jurada 1929 y, si hubo rentas positivas, para el
            Formulario 22. Sube un CSV, revísalo y descarga el resumen. Todo
            ocurre en tu navegador: no se envía nada a un servidor.
          </p>

          <section className="mt-12 grid gap-10 md:grid-cols-2">
            <div>
              <h2 className="text-[15px] font-medium text-ink-900">Plazos</h2>
              <dl className="mt-4 border-t border-ink-200">
                {PLAZOS.map((plazo) => (
                  <div key={plazo.etiqueta} className="border-b border-ink-200 py-4">
                    <dt className="text-[15px] text-ink-900">{plazo.etiqueta}</dt>
                    <dd className="mt-1 text-[14px] text-ink-900">{plazo.plazo}</dd>
                    <dd className="mt-1 text-[13px] leading-relaxed text-ink-600">
                      {plazo.detalle}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div>
              <h2 className="text-[15px] font-medium text-ink-900">Guías oficiales</h2>
              <ul className="mt-4 border-t border-ink-200">
                {GUIAS_OFICIALES.map((guia) => (
                  <li key={guia.url} className="border-b border-ink-200 py-4">
                    <a
                      href={guia.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[14px] text-ink-900 underline underline-offset-4"
                    >
                      {guia.titulo}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="mt-16 border-t border-ink-200 pt-10">
            <TaxWizard />
          </section>

          <p className="mt-8 text-[14px] text-ink-600">
            Para entender qué es la DJ 1929, revisa la ficha{" "}
            <Link href="/aprende/dj-1929" className="underline underline-offset-4">
              Declaración jurada 1929
            </Link>
            .
          </p>

          <div className="mt-12">
            <LegalNotice kind="tax" />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
