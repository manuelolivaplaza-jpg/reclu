import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Herramientas",
  description:
    "Calculadoras y simuladores de reclu.cl: backtest de portafolios y asistente para la Declaración Jurada 1929 y el Formulario 22.",
};

const HERRAMIENTAS = [
  {
    href: "/herramientas/backtest",
    titulo: "Backtest de portafolios",
    resumen:
      "Combina hasta cinco portafolios con los pesos que elijas, define el rebalanceo y compara la curva contra el S&P 500 o el IPSA.",
  },
  {
    href: "/herramientas/impuestos",
    titulo: "Impuestos · DJ 1929",
    resumen:
      "Ordena los montos de tus inversiones en el exterior para la Declaración Jurada 1929 y el Formulario 22. Todo ocurre en tu navegador.",
  },
];

export default function HerramientasPage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <div className="container-page max-w-3xl py-16 md:py-20">
          <p className="label-line">Herramientas</p>
          <h1 className="type-section mt-3 text-ink-900">Herramientas.</h1>
          <p className="type-body mt-5">
            Dos calculadoras para revisar tu propia cartera con los mismos datos
            públicos del catálogo. No ejecutan órdenes ni entregan
            recomendaciones.
          </p>

          <ul className="mt-12 border-y border-ink-200">
            {HERRAMIENTAS.map((herramienta) => (
              <li
                key={herramienta.href}
                className="border-b border-ink-200 last:border-b-0"
              >
                <Link
                  href={herramienta.href}
                  className="block py-6 hover:text-ink-900"
                >
                  <h2 className="text-[22px] font-medium tracking-[-0.03em] text-ink-900">
                    {herramienta.titulo}
                  </h2>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-600">
                    {herramienta.resumen}
                  </p>
                  <p className="mt-3 text-[13px] underline underline-offset-4">
                    Abrir herramienta
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
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
