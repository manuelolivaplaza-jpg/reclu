const STEPS = [
  {
    n: "01",
    title: "Elige.",
    body: "Explora políticos de EE.UU., carteras de Renta 4 y tesis temáticas. Sigues hasta dos en el plan gratis.",
  },
  {
    n: "02",
    title: "Vigilamos.",
    body: "Revisamos Capitol Trades, las corredoras y los filings, y normalizamos cada cambio.",
  },
  {
    n: "03",
    title: "Llega a tu correo.",
    body: "Te llega un correo con el movimiento y, en Pro, un resumen. Tú decides qué hacer.",
  },
];

/**
 * Cómo funciona — tres columnas separadas por filetes verticales (desde lg).
 * Sin iconos, sin círculos, sin línea conectora.
 */
export function HowItWorks() {
  return (
    <section id="como-funciona" className="bg-white py-20 md:py-28">
      <div className="container-page">
        <h2 className="type-section text-ink-900">Tres pasos.</h2>

        <div className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-3 lg:gap-0">
          {STEPS.map((step, i) => (
            <div
              key={step.n}
              className={
                "lg:px-10 " +
                (i === 0 ? "lg:pl-0" : "lg:border-l lg:border-ink-200")
              }
            >
              <p className="label-line">{step.n}</p>
              <h3 className="mt-4 text-[26px] font-medium tracking-[-0.03em] text-ink-900 md:text-[28px]">
                {step.title}
              </h3>
              <p className="mt-3 max-w-[34rem] text-[15px] leading-relaxed text-ink-500">
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
