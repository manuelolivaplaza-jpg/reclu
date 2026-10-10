import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { PortfolioRow } from "@/components/portfolio-row";
import { HERO_PORTFOLIOS } from "./portfolio-data";

/**
 * Hero — titular enorme, negro, alineado a la izquierda. Sin fondo decorativo.
 * Debajo, una muestra de tres filas tipográficas de portafolios.
 */
export function Hero() {
  return (
    <section className="bg-white pt-[4.5rem] pb-16 md:pt-[7.5rem] md:pb-20">
      <div className="container-page">
        {/* H1 */}
        <h1 className="type-display max-w-[16ch] text-ink-900">
          Sigue las carteras que mueven el mercado.
        </h1>

        {/* Sub */}
        <p className="type-body mt-6 max-w-[36rem]">
          Políticos de EE.UU., corredoras chilenas y fondos. Una alerta en tu correo
          cuando algo cambia. Sin órdenes. Sin ruido.
        </p>

        {/* Acciones */}
        <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-8">
          <ButtonLink href="/signup" size="lg">
            Empezar
          </ButtonLink>
          <Link
            href="/explore"
            className="text-[15px] text-ink-900 underline-offset-4 hover:underline"
          >
            Ver portafolios →
          </Link>
        </div>

        <p className="mt-4 text-[13px] text-ink-500">
          Gratis en 2 portafolios. Sin tarjeta.
        </p>
      </div>

      {/* Muestra de tres filas */}
      <div className="container-page mt-[4.5rem]">
        {HERO_PORTFOLIOS.map((p, i) => (
          <PortfolioRow
            key={p.slug}
            portfolio={p}
            isLast={i === HERO_PORTFOLIOS.length - 1}
          />
        ))}
      </div>
    </section>
  );
}
