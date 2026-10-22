import Link from "next/link";
import { FadeIn } from "@/components/ui/motion";
import { PhoneMockups } from "./phone-mockups";
import type { HeroCard } from "@/lib/hero-portfolios";

/**
 * Hero — titular enorme y centrado, con los mockups de teléfono debajo.
 *
 * Copy: se mantiene el titular vigente ("Sigue las carteras que mueven el
 * mercado."), que ya está revisado desde el punto de vista legal: no
 * promete rentabilidad ni invita a copiar carteras ajenas.
 */

function BrandMark() {
  return (
    <span className="inline-flex size-11 items-center justify-center rounded-xl bg-neutral-950">
      <svg
        viewBox="0 0 24 24"
        className="size-6 text-white"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        role="img"
        aria-label="reclu"
      >
        <path d="M4 16l5-5 4 4 7-8" />
        <path d="M15 7h5v5" />
      </svg>
    </span>
  );
}

export function Hero({ cards }: { cards: HeroCard[] }) {
  return (
    <section className="bg-white pt-16 pb-20 md:pt-24 md:pb-28">
      <div className="container-page">
        <FadeIn>
          <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
            <BrandMark />

            <h1 className="mt-8 text-5xl font-semibold tracking-tight text-neutral-950 md:text-7xl">
              Sigue las carteras que mueven el mercado.
            </h1>

            <p className="mt-6 max-w-xl text-lg text-neutral-500">
              Políticos de EE.UU., corredoras chilenas y fondos. Una alerta en
              tu correo cuando algo cambia. Sin órdenes. Sin ruido.
            </p>

            <Link
              href="/explore"
              className="mt-10 inline-flex items-center gap-2 rounded-full bg-neutral-950 px-5 py-2.5 text-[15px] font-medium text-white transition-colors duration-150 hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-neutral-950"
            >
              Explorar portafolios
              <span aria-hidden="true">→</span>
            </Link>

            <p className="mt-5 text-[13px] text-neutral-500">
              Gratis en 2 portafolios. Sin tarjeta.
            </p>
          </div>
        </FadeIn>

        <PhoneMockups cards={cards} />
      </div>
    </section>
  );
}
