import { JsonLd } from "@/components/json-ld";
import { faqSchema } from "@/lib/seo";
import { aiEnabled } from "@/lib/ai-flags";
import { PLANS, TRIAL_DAYS } from "@/lib/plans";

interface FaqItem {
  q: string;
  a: string;
  /** Pregunta sobre IA: solo se publica si aiEnabled(). */
  requiresAi?: boolean;
  /** Respuesta alternativa cuando la IA está apagada. */
  aWithoutAi?: string;
}

/**
 * Límites y prueba desde `PLANS` (fuente única): ni "5 consultas" ni "7 días"
 * se escriben a mano. La FAQ no cita precios: viven en Pricing y /planes.
 */
const FREE_CHATS = PLANS.free.chatQuota.limit;

const ALL_FAQ_ITEMS: FaqItem[] = [
  {
    q: "¿fraccion.si ejecuta operaciones por mí?",
    a: "No. fraccion.si es una plataforma de seguimiento y alertas. Nunca ejecutamos órdenes, ni custodiamos tus fondos ni tenemos acceso a tus cuentas de corretaje. Solo monitoreamos información pública y te avisamos por email o Telegram.",
  },
  {
    q: "¿De dónde salen los datos?",
    a: "De fuentes públicas: las divulgaciones periódicas oficiales de la Cámara de Representantes de EE.UU. (House Disclosure), informes del Senado, filings 13F de la SEC, y las carteras recomendadas publicadas por corredoras chilenas como Renta 4 y BTG Pactual, además de fondos como ARK y Global X.",
  },
  {
    q: "¿Qué tan rápido llegan las alertas?",
    a: `En Pro y Elite puedes recibir alertas en tiempo real apenas detectamos un cambio (por email o Telegram). En el plan gratuito las alertas se agrupan en un resumen diario o semanal, como prefieras en Ajustes. Nuevas cuentas tienen ${TRIAL_DAYS} días de prueba con beneficios Pro.`,
  },
  {
    q: "¿Los resúmenes AI son consejos de inversión?",
    a: "No. Los resúmenes generados por IA son análisis informativos basados en datos públicos. No constituyen asesoría de inversión ni una recomendación de compra o venta. Toda inversión implica riesgo.",
    requiresAi: true,
  },
  {
    q: "¿Puedo comparar con mi propia cartera?",
    a: "Sí. Puedes subir tu portafolio con un archivo CSV o ingresarlo manualmente, y fraccion.si te muestra cómo se compara con los portafolios que sigues.",
  },
  {
    q: "¿Qué pasa si supero el límite del plan gratuito?",
    a: `El plan gratuito incluye las carteras recomendadas de corredoras con todas sus acciones y ${FREE_CHATS} consultas diarias al asistente IA. Seguir portafolios y ver todas las acciones de políticos y fondos requiere Pro o Elite; puedes actualizar en cualquier momento y tus alertas y datos se mantienen intactos.`,
    aWithoutAi: `El plan gratuito incluye las carteras recomendadas de corredoras con todas sus acciones. Seguir portafolios y ver todas las acciones de políticos y fondos requiere Pro o Elite; puedes actualizar en cualquier momento y tus alertas y datos se mantienen intactos.`,
  },
];

/**
 * Lista efectiva de preguntas: sin clave de OpenRouter se omiten las que
 * hablan de IA y se usa la variante de respuesta sin asistente. El mismo
 * arreglo alimenta el JSON-LD, para no publicar preguntas que no se muestran.
 */
function visibleFaqItems(): { q: string; a: string }[] {
  const aiOn = aiEnabled();
  return ALL_FAQ_ITEMS.filter((item) => aiOn || !item.requiresAi).map(({ q, a, aWithoutAi }) => ({
    q,
    a: aiOn ? a : (aWithoutAi ?? a),
  }));
}

/**
 * FAQ — acordeón de filetes de 1px, sin card ni sombra. El indicador es un
 * signo tipográfico sobrio que pasa de "+" a "−" al abrir.
 */
export function FAQ() {
  const FAQ_ITEMS = visibleFaqItems();
  return (
    <section id="faq" className="pub-canvas section-y border-t border-ink-300 dark:border-white/12">
      <JsonLd data={faqSchema(FAQ_ITEMS)} />
      <div className="container-page grid gap-12 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:gap-20">
        <div>
          <p className="label-line">Preguntas frecuentes</p>
          <h2 className="type-section mt-4 text-ink-900 dark:text-white">Preguntas.</h2>
          <p className="type-body mt-4 max-w-[38ch]">
            Lo esencial sobre datos, alertas y planes. ¿Algo más?{" "}
            <a
              href="mailto:hola@fraccion.si"
              className="text-ink-900 underline decoration-ink-300 underline-offset-4 transition-colors hover:decoration-ink-900 dark:text-white dark:decoration-white/30 dark:hover:decoration-white"
            >
              hola@fraccion.si
            </a>
          </p>
        </div>

        <div className="border-t border-ink-300 dark:border-white/12">
          {FAQ_ITEMS.map((item, i) => (
            <details key={item.q} className="group border-b border-ink-300 dark:border-white/12">
              <summary className="flex cursor-pointer list-none items-baseline gap-4 py-[1.35rem] marker:content-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ink-900 dark:focus-visible:outline-white md:gap-6 [&::-webkit-details-marker]:hidden">
                <span aria-hidden className="num w-6 shrink-0 text-[13px] leading-none text-ink-500 dark:text-neutral-400">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="flex-1 text-[22px] font-medium leading-[1.15] tracking-[-0.03em] text-ink-900 md:text-[24px] dark:text-white">
                  {item.q}
                </span>
                <span
                  aria-hidden
                  className="flex size-6 shrink-0 items-center justify-center text-[22px] font-light leading-none text-ink-900 dark:text-white"
                >
                  <span className="group-open:hidden">+</span>
                  <span className="hidden group-open:inline">−</span>
                </span>
              </summary>
              <p className="type-body max-w-[40rem] pb-6 pl-10 pr-2 md:pl-12">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
