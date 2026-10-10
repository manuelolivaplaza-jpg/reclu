/**
 * Statement — banda a sangre completa en negro con una sola frase blanca.
 * El momento SpaceX. Absorbe el mensaje de "solo notificaciones" y "fuentes".
 */
export function Statement() {
  return (
    <section className="bg-ink-900 text-white">
      <div className="container-page py-[clamp(6rem,14vw,10rem)]">
        <h2 className="type-section max-w-[16ch] text-white">
          No invertimos por ti. Te avisamos cuando ellos se mueven.
        </h2>
        <p className="mt-6 max-w-[42rem] text-[15px] leading-relaxed text-white/62">
          Cuatro fuentes públicas. Un correo cuando hay un cambio. Tu plata sigue en
          tu corredora.
        </p>
      </div>
    </section>
  );
}
