import { withSeo } from "@/lib/seo";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = withSeo("/herramientas", {
  title: "Herramientas",
  description:
    "Calculadoras y simuladores de fraccion.si: backtest de portafolios y asistente para la Declaración Jurada 1929 y el Formulario 22.",
});

const HERRAMIENTAS = [
  {
    href: "/herramientas/backtest",
    titulo: "Backtest de portafolios",
    resumen:
      "Combina hasta cinco portafolios con los pesos que elijas, define el rebalanceo y compara la curva contra el S&P 500 o el IPSA.",
    detalle: "Simulación histórica con series publicadas",
  },
  {
    href: "/herramientas/impuestos",
    titulo: "Impuestos · DJ 1929",
    resumen:
      "Ordena los montos de tus inversiones en el exterior para la Declaración Jurada 1929 y el Formulario 22. Todo ocurre en tu navegador.",
    detalle: "Se ejecuta en tu navegador · no envía tus datos",
  },
];

const LECTURAS = [
  {
    href: "/aprende",
    titulo: "Fichas de Aprende",
    detalle: "Qué es un 13F, un PTR o la DJ 1929, en una página cada uno.",
  },
  {
    href: "/metodologia",
    titulo: "Metodología",
    detalle: "De dónde salen los precios y cómo se calculan los retornos.",
  },
];

export default function HerramientasPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="bg-white dark:bg-ink-950">
        <div className="container-page pb-24 pt-10 md:pt-14">
          <header className="border-b border-ink-300 pb-10 dark:border-white/12 md:pb-12">
            <p className="label-line">Herramientas</p>
            <h1 className="type-section mt-4 text-ink-900 dark:text-white">
              Herramientas.
            </h1>
            <p className="type-body mt-6 max-w-2xl">
              Dos calculadoras para revisar tu cartera: una simula el historial
              con series publicadas; la otra ordena los montos para el SII.
              Ninguna ejecuta órdenes ni entrega recomendaciones.
            </p>
          </header>

          <div className="mt-12 grid gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-8">
              <ul className="border-t border-ink-300 dark:border-white/12">
                {HERRAMIENTAS.map((herramienta, index) => (
                  <li
                    key={herramienta.href}
                    className="border-b border-ink-300 dark:border-white/12"
                  >
                    <Link
                      href={herramienta.href}
                      className="group flex gap-4 py-8 sm:gap-6"
                    >
                      <span
                        aria-hidden="true"
                        className="num mt-1.5 w-6 shrink-0 text-[12px] text-ink-400 dark:text-ink-500"
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h2 className="text-[22px] font-medium tracking-[-0.03em] text-ink-900 decoration-1 underline-offset-[6px] group-hover:underline dark:text-white">
                          {herramienta.titulo}
                        </h2>
                        <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-ink-600 dark:text-ink-400">
                          {herramienta.resumen}
                        </p>
                        <span className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-500 dark:text-ink-400">
                          {herramienta.detalle}
                          <span
                            aria-hidden="true"
                            className="text-ink-300 dark:text-ink-600"
                          >
                            /
                          </span>
                          <span className="font-medium text-ink-900 underline-offset-4 group-hover:underline dark:text-white">
                            Abrir herramienta
                          </span>
                        </span>
                      </div>
                      <span
                        aria-hidden="true"
                        className="hidden shrink-0 self-center text-[18px] leading-none text-ink-400 transition-transform duration-150 group-hover:translate-x-1 sm:block dark:text-ink-500"
                      >
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <aside className="border-ink-300 lg:col-span-4 lg:border-l lg:pl-12 dark:border-white/12">
              <h2 className="label-line">Antes de calcular</h2>
              <p className="mt-3 max-w-[42ch] text-[14px] leading-relaxed text-ink-600 dark:text-ink-400">
                Si es la primera vez que lees un 13F, un PTR o una declaración
                jurada, parte por las fichas: cada una dice solo lo que está en
                su fuente.
              </p>
              <ul className="mt-5 border-t border-ink-300 dark:border-white/12">
                {LECTURAS.map((lectura) => (
                  <li
                    key={lectura.href}
                    className="border-b border-ink-300 dark:border-white/12"
                  >
                    <Link
                      href={lectura.href}
                      className="group flex items-start justify-between gap-4 py-4"
                    >
                      <span className="min-w-0">
                        <span className="block text-[14px] font-medium text-ink-900 underline-offset-4 group-hover:underline dark:text-white">
                          {lectura.titulo}
                        </span>
                        <span className="mt-1 block text-[12px] leading-relaxed text-ink-500 dark:text-ink-400">
                          {lectura.detalle}
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className="mt-0.5 shrink-0 text-ink-400 transition-transform duration-150 group-hover:translate-x-1 dark:text-ink-500"
                      >
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-[12px] leading-relaxed text-ink-500 dark:text-ink-400">
                Los retornos del catálogo se publican con el desfase de cada
                fuente; la metodología lo explica regla por regla.
              </p>
            </aside>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
