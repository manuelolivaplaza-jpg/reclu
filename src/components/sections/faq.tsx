const FAQ_ITEMS = [
  {
    q: "¿reclu.cl ejecuta operaciones por mí?",
    a: "No. reclu.cl es una plataforma de seguimiento y alertas. Nunca ejecutamos órdenes, ni custodiados tus fondos ni tenemos acceso a tus cuentas de corretaje. Solo monitoreamos información pública y te avisamos por email.",
  },
  {
    q: "¿De dónde salen los datos?",
    a: "De fuentes públicas: Capitol Trades y disclosures oficiales para políticos de EE.UU., informes públicos de corredoras chilenas como Renta 4, LarrainVial y BTG Pactual, filings 13F de la SEC, y datos abiertos de InfoProbidad en Chile.",
  },
  {
    q: "¿Qué tan rápido llegan las alertas?",
    a: "En el plan Pro, las alertas se envían en tiempo real cuando detectamos un cambio. En el plan gratuito, las alertas se agrupan en un resumen diario.",
  },
  {
    q: "¿Los resúmenes AI son consejos de inversión?",
    a: "No. Los resúmenes generados por IA son análisis informativos basados en datos públicos. No constituyen asesoría de inversión ni una recomendación de compra o venta. Toda inversión implica riesgo.",
  },
  {
    q: "¿Puedo comparar con mi propia cartera?",
    a: "Sí. Puedes subir tu portafolio con un archivo CSV o ingresarlo manualmente, y reclu.cl te muestra cómo se compara con los portafolios que sigues.",
  },
  {
    q: "¿Qué pasa si supero el límite del plan gratuito?",
    a: "El plan gratuito permite seguir hasta 2 portafolios. Si quieres seguir más, puedes actualizar a Pro en cualquier momento — tus alertas y datos se mantienen intactos.",
  },
];

/**
 * FAQ — cada pregunta es un details con filete superior. Control "+" que rota
 * a "×" al abrir. Sin card contenedora, sin sombra.
 */
export function FAQ() {
  return (
    <section id="faq" className="bg-white py-28 md:py-36">
      <div className="container-page">
        <h2 className="type-section text-ink-900">Preguntas.</h2>

        <div className="mt-16 max-w-[46rem] md:mt-20">
          {FAQ_ITEMS.map((item) => (
            <details key={item.q} className="group border-t border-ink-200 py-7 md:py-8">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-8 marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="text-[22px] font-medium leading-[1.2] tracking-[-0.03em] text-ink-900 underline decoration-transparent underline-offset-[0.22em] [text-decoration-thickness:1px] transition-[text-decoration-color] duration-200 group-hover:decoration-ink-900 md:text-[26px]">
                  {item.q}
                </span>
                <span className="mt-1 shrink-0 text-[22px] leading-none text-ink-900 transition-transform duration-200 group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-4 max-w-[40rem] text-[16px] leading-[1.65] text-ink-500">
                {item.a}
              </p>
            </details>
          ))}
          <div className="border-t border-ink-200" />
        </div>
      </div>
    </section>
  );
}
