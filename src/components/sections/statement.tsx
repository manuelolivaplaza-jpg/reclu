/**
 * Statement — banda a sangre completa en negro con una sola frase blanca.
 * El momento SpaceX. Absorbe el mensaje de "solo notificaciones" y "fuentes".
 */
export function Statement() {
  return (
    <section className="bg-ink-900 text-white">
      <div className="container-page py-[clamp(7.5rem,16vw,12rem)]">
        <h2
          className="type-section max-w-[16ch] text-white"
          style={{ fontSize: "clamp(2.6rem, 5.5vw, 5rem)", letterSpacing: "-0.045em" }}
        >
          No invertimos por ti. Te avisamos cuando ellos se mueven.
        </h2>
        <p className="mt-10 max-w-[40rem] text-[15px] leading-relaxed text-white/62 md:mt-12">
          Cuatro fuentes públicas. Un correo cuando hay un cambio. Tu plata sigue en
          tu corredora.
        </p>
      </div>
    </section>
  );
}
