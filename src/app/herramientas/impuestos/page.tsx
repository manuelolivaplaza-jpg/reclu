import { withSeo } from "@/lib/seo";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { LegalNotice } from "@/components/legal/legal-notice";
import { TaxWizard } from "@/components/tax/tax-wizard";
import { GUIAS_OFICIALES, PLAZOS } from "@/lib/tax/plazos";

export const metadata: Metadata = withSeo("/herramientas/impuestos", {
  title: "Impuestos · DJ 1929",
  description:
    "Asistente paso a paso para ordenar los montos de la Declaración Jurada 1929 y la renta del Formulario 22. Se ejecuta en tu navegador, sin enviar datos al servidor.",
});

/** Alcance explícito del asistente: qué ordena y qué no resuelve. */
const ALCANCE = [
  {
    titulo: "Qué hace",
    items: [
      "Ordena por instrumento los montos que pide la sección B de la DJ 1929.",
      "Convierte a pesos con el tipo de cambio que ingresas tú: no usa un dólar de referencia.",
      "Descarga un CSV con el resumen para revisarlo antes de declarar; no es el archivo que recibe el SII.",
    ],
  },
  {
    titulo: "Qué no hace",
    items: [
      "No calcula el impuesto a pagar ni presenta la declaración ante el SII.",
      "No reemplaza a tu contador: esto no es asesoría tributaria.",
      "No envía tus montos ni el archivo a ningún servidor: todo queda en tu navegador.",
    ],
  },
];

export default function ImpuestosPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="bg-white dark:bg-ink-950">
        <div className="container-page pb-24 pt-10 md:pt-14">
          <header className="border-b border-ink-300 pb-10 dark:border-white/12 md:pb-12">
            <p className="label-line">Herramientas</p>
            <h1 className="type-section mt-4 text-ink-900 dark:text-white">
              Impuestos.
            </h1>
            <p className="type-body mt-6 max-w-2xl">
              Ordena los montos de tus inversiones en el exterior para la
              Declaración Jurada 1929 y, si hubo rentas positivas, para el
              Formulario 22. Sube un CSV, revísalo y descarga el resumen.
            </p>
            <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-500 dark:text-ink-400">
              <span>Declaración Jurada 1929</span>
              <span aria-hidden="true" className="text-ink-300 dark:text-ink-600">
                /
              </span>
              <span>Formulario 22</span>
              <span aria-hidden="true" className="text-ink-300 dark:text-ink-600">
                /
              </span>
              <span>Cálculo en tu navegador</span>
            </p>
          </header>

          <section aria-label="Asistente DJ 1929" className="mt-10">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="label-line">Asistente paso a paso</p>
              <p className="text-[12px] text-ink-500 dark:text-ink-400">
                No se envía nada a un servidor
              </p>
            </div>
            {/* El asistente es un componente claro (filetes y tinta propios):
                vive sobre superficie blanca para conservar contraste. */}
            <div className="mt-4 border border-ink-200 bg-white p-4 sm:p-6 lg:p-8 dark:border-white/15">
              <TaxWizard />
            </div>
          </section>

          <section className="mt-16 grid gap-10 border-t border-ink-300 pt-10 dark:border-white/12 md:grid-cols-2 md:gap-16">
            {ALCANCE.map((bloque) => (
              <div key={bloque.titulo}>
                <h2 className="text-[15px] font-medium text-ink-900 dark:text-white">
                  {bloque.titulo}
                </h2>
                <ul className="mt-4 max-w-[54ch] space-y-3 text-[14px] leading-relaxed text-ink-600 dark:text-ink-400">
                  {bloque.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          <section className="mt-16 grid gap-10 border-t border-ink-300 pt-10 dark:border-white/12 md:grid-cols-2 md:gap-16">
            <div>
              <h2 className="text-[15px] font-medium text-ink-900 dark:text-white">
                Plazos
              </h2>
              <dl className="mt-4 border-t border-ink-300 dark:border-white/12">
                {PLAZOS.map((plazo) => (
                  <div
                    key={plazo.etiqueta}
                    className="border-b border-ink-300 py-4 dark:border-white/12"
                  >
                    <dt className="text-[15px] text-ink-900 dark:text-white">
                      {plazo.etiqueta}
                    </dt>
                    <dd className="mt-1 text-[14px] text-ink-700 dark:text-ink-300">
                      {plazo.plazo}
                    </dd>
                    <dd className="mt-1 max-w-[54ch] text-[13px] leading-relaxed text-ink-600 dark:text-ink-400">
                      {plazo.detalle}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div>
              <h2 className="text-[15px] font-medium text-ink-900 dark:text-white">
                Guías oficiales
              </h2>
              <ul className="mt-4 border-t border-ink-300 dark:border-white/12">
                {GUIAS_OFICIALES.map((guia) => (
                  <li
                    key={guia.url}
                    className="border-b border-ink-300 dark:border-white/12"
                  >
                    <a
                      href={guia.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-start justify-between gap-4 py-4 text-[14px] leading-relaxed text-ink-900 underline-offset-4 hover:underline dark:text-white"
                    >
                      <span>
                        {guia.titulo}
                        <span className="sr-only">
                          {" "}
                          (abre en una pestaña nueva)
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className="shrink-0 text-ink-400 transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 dark:text-ink-500"
                      >
                        ↗
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <p className="mt-12 max-w-2xl text-[14px] leading-relaxed text-ink-600 dark:text-ink-400">
            Para entender qué pide la DJ 1929, revisa la ficha{" "}
            <Link
              href="/aprende/dj-1929"
              className="font-medium text-ink-900 underline underline-offset-4 dark:text-white"
            >
              Declaración jurada 1929
            </Link>
            .
          </p>

          {/* Aviso legal sobre papel blanco: su texto es de 12px y no tiene
              variante oscura propia. */}
          <div className="mt-8">
            <LegalNotice kind="tax" />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
