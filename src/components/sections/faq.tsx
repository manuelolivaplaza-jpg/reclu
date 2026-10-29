const FAQ_ITEMS = [
  {
    q: "¿reclu.cl ejecuta operaciones por mí?",
    a: "No. reclu.cl es una plataforma de seguimiento y alertas. Nunca ejecutamos órdenes, ni custodiamos tus fondos ni tenemos acceso a tus cuentas de corretaje. Solo monitoreamos información pública y te avisamos por email o Telegram.",
  },
  {
    q: "¿De dónde salen los datos?",
    a: "De fuentes públicas: las divulgaciones periódicas oficiales de la Cámara de Representantes de EE.UU. (House Disclosure), informes del Senado, filings 13F de la SEC, y las carteras recomendadas publicadas por corredoras chilenas como Renta 4 y BTG Pactual, además de fondos como ARK y Global X.",
  },
  {
    q: "¿Qué tan rápido llegan las alertas?",
    a: "En Pro y Elite puedes recibir alertas en tiempo real apenas detectamos un cambio (por email o Telegram). En el plan gratuito las alertas se agrupan en un resumen diario o semanal, como prefieras en Ajustes. Nuevas cuentas tienen 7 días de prueba con beneficios Pro.",
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
    a: "El plan gratuito incluye las carteras recomendadas de corredoras con todas sus acciones y 5 consultas diarias al asistente IA. Seguir portafolios y ver todas las acciones de políticos y fondos requiere Pro o Elite; puedes actualizar en cualquier momento y tus alertas y datos se mantienen intactos.",
  },
];

/**
 * FAQ — cada pregunta es un details con filete superior. Control "+" que rota
 * a "×" al abrir. Sin card contenedora, sin sombra.
 */
export function FAQ() {
  return (
    <section id="faq" className="bg-white py-20 md:py-32">
      <div className="container-page grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
        <div>
          <span className="pub-chip">Preguntas frecuentes</span>
          <h2 className="type-section mt-4 text-ink-900">Preguntas.</h2>
          <p className="mt-4 max-w-sm text-[16px] leading-relaxed text-ink-500">
            Lo esencial sobre datos, alertas y planes. ¿Algo más?{" "}
            <a href="mailto:hola@reclu.cl" className="text-ink-900 underline underline-offset-4">
              hola@reclu.cl
            </a>
          </p>
        </div>
        <div className="flex flex-col gap-3">
          {FAQ_ITEMS.map((item, i) => (
            <details
              key={item.q}
              className="group pub-card overflow-hidden transition-shadow open:shadow-lg"
            >
              <summary className="flex cursor-pointer list-none items-center gap-4 p-4 marker:content-none md:p-5 [&::-webkit-details-marker]:hidden">
                <span className="num flex size-8 shrink-0 items-center justify-center rounded-lg bg-ink-50 text-[13px] text-ink-500 group-open:bg-ink-900 group-open:text-white">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="flex-1 text-[16px] font-medium leading-snug tracking-[-0.01em] text-ink-900 md:text-[17px]">
                  {item.q}
                </span>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-ink-200 text-[18px] leading-none text-ink-900 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="px-4 pb-5 pl-16 text-[15px] leading-[1.65] text-ink-500 md:px-5 md:pl-[4.25rem]">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
