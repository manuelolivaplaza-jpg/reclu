import Link from "next/link";
import { FadeIn } from "@/components/ui/motion";
import { PhoneMockups, PhoneMockupsSkeleton } from "./phone-mockups";
import type { HeroCard } from "@/lib/hero-portfolios";

/**
 * Hero — titular enorme y centrado, con los mockups de teléfono debajo.
 *
 * Copy: se mantiene el titular vigente ("Sigue las carteras que mueven el
 * mercado."), que ya está revisado desde el punto de vista legal: no
 * promete rentabilidad ni invita a copiar carteras ajenas.
 */

export function Hero({ cards, loading = false }: { cards: HeroCard[]; loading?: boolean }) {
  // D60: el fallback de Suspense queda en el HTML junto al hero real; solo uno lleva h1.
  const Title = loading ? "p" : "h1";
  return (
    <section className="bg-white pt-16 pb-20 md:pt-24 md:pb-28">
      <div className="container-page">
        <FadeIn>
          <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
            <Title className="text-5xl font-semibold tracking-tight text-neutral-950 md:text-7xl">
              Sigue las carteras que mueven el mercado.
            </Title>

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
              Gratis con carteras de corredoras. Sin tarjeta.
            </p>

            <Link
              href="/trump-dice"
              className="mt-8 inline-flex items-center gap-3 rounded-full border border-neutral-200 bg-white py-1.5 pl-1.5 pr-4 text-[14px] text-neutral-700 shadow-sm transition hover:border-neutral-300 hover:text-neutral-950"
            >
              <span className="rounded-full bg-neutral-950 px-2.5 py-1 text-[12px] font-medium text-white">Nuevo</span>
              Trump dice: cada mención y su retorno vs el S&amp;P 500
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </FadeIn>

        {loading ? <PhoneMockupsSkeleton /> : <PhoneMockups cards={cards} />}

        <p className="mx-auto mt-10 max-w-2xl text-center text-[12px] leading-relaxed text-neutral-500">
          Rendimiento pasado no garantiza resultados futuros. Cifras calculadas con
          datos públicos; no es asesoría de inversión.
        </p>
      </div>
    </section>
  );
}
