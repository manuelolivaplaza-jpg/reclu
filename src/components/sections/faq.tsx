import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

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

export function FAQ() {
  return (
    <section id="faq" className="border-b border-ink-200/60 py-24">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">
            FAQ
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            Preguntas frecuentes
          </h2>
        </div>

        <div className="mx-auto mt-12 max-w-3xl">
          <div className="divide-y divide-ink-200 rounded-card border border-ink-200 bg-white shadow-card">
            {FAQ_ITEMS.map((item) => (
              <details key={item.q} className="group px-6 py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-ink-900 marker:content-none [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-ink-300 text-ink-500 transition-transform group-open:rotate-45 group-open:border-brand-500 group-open:text-brand-600">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                      <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </span>
                </summary>
                <p className="mt-3 pr-10 text-sm leading-relaxed text-ink-600">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Final CTA band. */
export function FinalCTA() {
  return (
    <section className="py-24">
      <div className="container-page">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 via-brand-600 to-brand-800 px-8 py-16 text-center shadow-pop sm:px-16">
          {/* Subtle grid overlay */}
          <div
            className="absolute inset-0 opacity-10 [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:48px_48px]"
            aria-hidden
          />
          <div className="relative">
            <h2 className="mx-auto max-w-xl text-3xl font-semibold tracking-tight text-balance text-white sm:text-4xl">
              Deja de revisar disclosures. Empieza a recibir alertas.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-lg text-brand-100">
              Únete y sigue tus primeros portafolios en menos de un minuto.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <ButtonLink
                href="/signup"
                size="lg"
                className="w-full bg-white text-brand-700 hover:bg-brand-50 sm:w-auto"
              >
                Comenzar gratis
                <ArrowRight className="size-4" />
              </ButtonLink>
              <ButtonLink
                href="/explore"
                size="lg"
                className="w-full border-white/30 bg-transparent text-white hover:bg-white/10 sm:w-auto"
              >
                Ver portafolios
              </ButtonLink>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
