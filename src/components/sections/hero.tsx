import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { FadeIn } from "@/components/ui/reveal";
import type { ReactNode } from "react";

/**
 * Hero — apertura editorial: eyebrow con filete de 1px, titular a gran escala
 * y una columna de apoyo con los dos caminos (cuenta y exploración).
 *
 * Copy: se mantiene el titular vigente ("Sigue las carteras que mueven el
 * mercado."), que ya está revisado desde el punto de vista legal: no
 * promete rentabilidad ni invita a copiar carteras ajenas.
 *
 * Si `mockups` resuelve a nada (catálogo sin portafolios con retorno), el
 * pie legal queda a `mt-10` del bloque anterior: no se reserva un hueco.
 */

/**
 * d65: el texto del hero es estático y va en el shell prerenderizado (es el
 * LCP en móvil). Solo las tarjetas dependen de datos: llegan por `mockups`
 * dentro de un Suspense, sin bloquear el titular.
 */
export function Hero({ mockups }: { mockups: ReactNode }) {
  return (
    <section className="bg-white pt-10 pb-16 text-ink-900 dark:bg-ink-950 dark:text-white md:pt-14 md:pb-24">
      <div className="container-page">
        <FadeIn>
          <div className="flex items-center justify-between gap-4 border-b border-ink-300 pb-4 dark:border-white/12">
            <p className="label-line min-w-0">Portafolios públicos</p>
            <p className="label-line min-w-0 text-right">Alertas por correo</p>
          </div>

          <div className="mt-10 grid gap-10 md:mt-14 lg:grid-cols-12 lg:gap-12">
            <h1 className="type-display lg:col-span-8">
              Sigue las carteras que mueven el mercado.
            </h1>

            <div className="min-w-0 lg:col-span-4 lg:self-end lg:pb-1">
              <p className="type-body max-w-md">
                Políticos de EE.UU., corredoras chilenas y fondos. Una alerta en tu
                correo cuando algo cambia. Sin órdenes. Sin ruido.
              </p>

              <div className="mt-8 flex flex-col items-start gap-4">
                <ButtonLink href="/signup" size="lg" className="w-full sm:w-auto">
                  Empezar gratis
                </ButtonLink>
                <Link
                  href="/explore"
                  className="group inline-flex min-h-11 items-center gap-2 text-[15px] font-medium text-ink-900 underline decoration-ink-300 underline-offset-[0.35em] transition-[text-decoration-color] duration-200 hover:decoration-ink-900 dark:text-white dark:decoration-white/30 dark:hover:decoration-white"
                >
                  Explorar portafolios
                  <span
                    aria-hidden="true"
                    className="transition-transform duration-150 group-hover:translate-x-0.5"
                  >
                    →
                  </span>
                </Link>
              </div>

              <p className="mt-4 text-[13px] leading-relaxed text-ink-500 dark:text-ink-400">
                Gratis con carteras de corredoras. Sin tarjeta.
              </p>
            </div>
          </div>

          <Link
            href="/trump-dice"
            className="group mt-12 flex items-center justify-between gap-6 border-y border-ink-300 py-4 transition-colors hover:border-ink-900 dark:border-white/12 dark:hover:border-white/40 md:mt-16"
          >
            <span className="label-line transition-colors group-hover:text-ink-900 dark:group-hover:text-white">
              Trump dice: cada mención y su retorno vs el S&amp;P 500
            </span>
            <span
              aria-hidden="true"
              className="shrink-0 text-[15px] text-ink-900 transition-transform duration-150 group-hover:translate-x-0.5 dark:text-white"
            >
              →
            </span>
          </Link>
        </FadeIn>

        {mockups}

        <p className="mx-auto mt-10 max-w-2xl text-center text-[12px] leading-relaxed text-ink-500 dark:text-ink-400 md:mt-12">
          Rendimiento pasado no garantiza resultados futuros. Cifras calculadas con
          datos públicos; no es asesoría de inversión.
        </p>
      </div>
    </section>
  );
}
