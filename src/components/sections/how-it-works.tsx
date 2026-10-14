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
    <section id="como-funciona" className="bg-white py-28 md:py-36">
      <div className="container-page">
        <h2 className="type-section text-ink-900">Tres pasos.</h2>

        <div className="mt-16 grid grid-cols-1 border-t border-ink-200 md:mt-20 lg:mt-24 lg:grid-cols-3">
          {STEPS.map((step, i) => (
            <div
              key={step.n}
              className={
                "border-b border-ink-200 py-10 lg:py-14 lg:pr-12 " +
                (i === 0 ? "lg:pl-0" : "lg:border-l lg:pl-12")
              }
            >
              <p className="label-line">{step.n}</p>
              <h3 className="mt-5 text-[26px] font-medium tracking-[-0.03em] text-ink-900 md:text-[28px]">
                {step.title}
              </h3>
              <p className="mt-4 max-w-[34rem] text-[15px] leading-[1.6] text-ink-500">
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
