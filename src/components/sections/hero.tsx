import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { ShowcaseList } from "./showcase-list";
import { HERO_PORTFOLIOS } from "./portfolio-data";

/**
 * Hero — titular enorme, negro, alineado a la izquierda. Sin fondo decorativo.
 * Debajo, una muestra de tres filas tipográficas de portafolios.
 */
const textLink =
  "text-[15px] text-ink-900 underline decoration-transparent underline-offset-[0.35em] [text-decoration-thickness:1px] transition-[text-decoration-color] duration-200 hover:decoration-ink-900";

export function Hero() {
  return (
    <section className="bg-white pt-24 pb-24 md:pt-36 md:pb-32 lg:pt-40">
      <div className="container-page">
        <h1
          className="type-display max-w-[16ch] text-ink-900"
          style={{
            fontSize: "clamp(3.25rem, 8vw, 7.25rem)",
            letterSpacing: "-0.052em",
            lineHeight: 0.9,
          }}
        >
          Sigue las carteras que mueven el mercado.
        </h1>

        <p className="type-body mt-8 max-w-[36rem] md:mt-10">
          Políticos de EE.UU., corredoras chilenas y fondos. Una alerta en tu correo
          cuando algo cambia. Sin órdenes. Sin ruido.
        </p>

        <div className="mt-10 flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-10 md:mt-12">
          <ButtonLink href="/signup" size="lg">
            Empezar
          </ButtonLink>
          <Link href="/explore" className={textLink}>
            Ver portafolios →
          </Link>
        </div>

        <p className="mt-6 text-[13px] text-ink-500">
          Gratis en 2 portafolios. Sin tarjeta.
        </p>
      </div>

      <div className="container-page mt-20 md:mt-28">
        <ShowcaseList portfolios={HERO_PORTFOLIOS} />
      </div>
    </section>
  );
}
