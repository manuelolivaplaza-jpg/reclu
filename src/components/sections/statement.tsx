import { FadeIn } from "@/components/ui/reveal";

/**
 * Statement — banda a sangre negra (SpaceX): una sola frase blanca, sin caja
 * ni adornos. Absorbe el mensaje de "solo notificaciones" y "fuentes".
 * En modo oscuro la banda se separa del lienzo con filetes de 1px.
 */
export function Statement() {
  return (
    <section
      aria-labelledby="statement-title"
      className="border-y border-ink-900 bg-ink-900 text-white dark:border-white/12"
    >
      <div className="container-page py-[clamp(6rem,13vw,10rem)]">
        <FadeIn>
          <p className="text-[13px] leading-[1.35] tracking-[0.01em] text-white/60">
            Lo que no hacemos
          </p>
          <h2 id="statement-title" className="type-section mt-4 max-w-[20ch] text-white">
            No invertimos por ti. Te avisamos cuando ellos se mueven.
          </h2>
        </FadeIn>
        <FadeIn delay={0.1}>
          <p className="mt-8 max-w-[42rem] text-[15px] leading-relaxed text-white/70 md:mt-10">
            Divulgaciones de la Cámara de Representantes de EE.UU., filings 13F y
            carteras de corredoras chilenas. Un correo cuando hay un cambio. Tu plata
            sigue en tu corredora.
          </p>
        </FadeIn>
      </div>
    </section>
  );
}
