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
 */

/**
 * d65: el texto del hero es estático y va en el shell prerenderizado (es el
 * LCP en móvil). Solo las tarjetas dependen de datos: llegan por `mockups`
 * dentro de un Suspense, sin bloquear el titular.
 */
export function Hero({ mockups }: { mockups: ReactNode }) {
  return (
    <section className="bg-white pt-12 pb-16 text-ink-900 dark:bg-ink-950 dark:text-white md:pt-16 md:pb-24">
      <div className="container-page">
        <FadeIn>
          <div className="flex items-center gap-4 border-b border-ink-200 pb-4 dark:border-white/12">
            <p className="label-line shrink-0">Portafolios públicos</p>
            <span aria-hidden="true" className="h-px flex-1 bg-ink-200 dark:bg-white/12" />
            <p className="label-line shrink-0">Alertas por correo</p>
          </div>

          <div className="mt-10 grid gap-10 md:mt-14 lg:grid-cols-12 lg:gap-12">
            <h1 className="type-display lg:col-span-8">
              Sigue las carteras que mueven el mercado.
            </h1>

            <div className="lg:col-span-4 lg:self-end lg:pb-1">
              <p className="type-body max-w-md">
                Políticos de EE.UU., corredoras chilenas y fondos. Una alerta en tu
                correo cuando algo cambia. Sin órdenes. Sin ruido.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
                <ButtonLink href="/signup" size="lg">
                  Empezar gratis
                </ButtonLink>
                <Link
                  href="/explore"
                  className="group inline-flex items-center gap-2 text-[15px] font-medium text-ink-900 transition-colors hover:text-ink-500 dark:text-white dark:hover:text-neutral-300"
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

              <p className="mt-4 text-[13px] leading-relaxed text-ink-500 dark:text-neutral-400">
                Gratis con carteras de corredoras. Sin tarjeta.
              </p>
            </div>
          </div>

          <Link
            href="/trump-dice"
            className="group mt-12 flex items-center justify-between gap-6 border-y border-ink-200 py-4 transition-colors hover:border-ink-900 dark:border-white/12 dark:hover:border-white/40 md:mt-16"
          >
            <span className="label-line">
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

        <p className="mx-auto mt-10 max-w-2xl text-center text-[12px] leading-relaxed text-ink-500 dark:text-neutral-400">
          Rendimiento pasado no garantiza resultados futuros. Cifras calculadas con
          datos públicos; no es asesoría de inversión.
        </p>
      </div>
    </section>
  );
}
