import { FadeIn, StaggerList, StaggerItem } from "@/components/ui/reveal";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    n: "01",
    title: "Elige.",
    chip: "Explorar",
    body: "Explora políticos de EE.UU., carteras de corredoras chilenas y tesis temáticas. Las carteras de corredoras son gratis; seguir portafolios es parte de Pro y Elite.",
  },
  {
    n: "02",
    title: "Vigilamos.",
    chip: "Fuentes públicas",
    body: "Revisamos las divulgaciones de la Cámara de Representantes de EE.UU., los filings 13F de la SEC y las carteras públicas de corredoras chilenas como Renta 4 y BTG Pactual. Normalizamos cada cambio.",
  },
  {
    n: "03",
    title: "Llega a tu correo.",
    chip: "Alertas",
    body: "Te llega un correo con el movimiento y, en Pro, un resumen. Tú decides qué hacer.",
  },
];

/**
 * Ilustraciones SVG propias de cada paso (decorativas, sin datos reales).
 * Monocromo estricto: filetes de 1px y tinta. El verde y el rojo quedan
 * reservados a las cifras de rendimiento, así que aquí no aparece ninguno.
 */
function StepArt({ step }: { step: string }) {
  if (step === "01") {
    return (
      <svg viewBox="0 0 220 96" className="h-auto w-full max-w-[360px]" aria-hidden="true" focusable="false">
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(${i * 74} ${i === 1 ? 0 : 10})`}>
            <rect
              width="66"
              height="80"
              strokeWidth="1"
              className={
                i === 1
                  ? "fill-ink-900 stroke-ink-900 dark:fill-white dark:stroke-white"
                  : "fill-transparent stroke-ink-300 dark:stroke-white/25"
              }
            />
            <rect
              x="10"
              y="12"
              width="8"
              height="8"
              className={i === 1 ? "fill-white dark:fill-ink-900" : "fill-ink-300 dark:fill-white/30"}
            />
            <rect
              x="10"
              y="32"
              width="42"
              height="4"
              className={i === 1 ? "fill-white/70 dark:fill-ink-900/70" : "fill-ink-300 dark:fill-white/25"}
            />
            <path
              d={i === 1 ? "M10,66 L22,60 L34,62 L46,52 L56,48" : "M10,64 L22,62 L34,58 L46,60 L56,54"}
              fill="none"
              strokeWidth="1.5"
              className={i === 1 ? "stroke-white dark:stroke-ink-900" : "stroke-ink-900 dark:stroke-white"}
            />
          </g>
        ))}
      </svg>
    );
  }
  if (step === "02") {
    return (
      <svg viewBox="0 0 220 96" className="h-auto w-full max-w-[360px]" aria-hidden="true" focusable="false">
        {["SEC", "Cámara EE.UU.", "Renta 4"].map((s, i) => (
          <g key={s} transform={`translate(0 ${8 + i * 28})`}>
            <rect
              width="74"
              height="22"
              strokeWidth="1"
              className="fill-transparent stroke-ink-300 dark:stroke-white/25"
            />
            <text x="37" y="15" textAnchor="middle" fontSize="10" className="fill-ink-700 dark:fill-ink-300">
              {s}
            </text>
          </g>
        ))}
        {[0, 1, 2].map((i) => (
          <path
            key={i}
            d={`M78,${19 + i * 28} C110,${19 + i * 28} 110,48 140,48`}
            fill="none"
            strokeWidth="1"
            strokeDasharray="2 3"
            className="stroke-ink-400 dark:stroke-white/25"
          />
        ))}

        <rect x="140" y="26" width="80" height="44" className="fill-ink-900 dark:fill-white" />
        <text x="180" y="45" textAnchor="middle" fontSize="11" fontWeight="600" className="fill-white dark:fill-ink-900">
          fraccion
        </text>
        <text
          x="180"
          y="59"
          textAnchor="middle"
          fontSize="9"
          opacity="0.6"
          className="fill-white dark:fill-ink-900"
        >
          normaliza
        </text>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 220 96" className="h-auto w-full max-w-[360px]" aria-hidden="true" focusable="false">
      <rect x="20" y="8" width="180" height="80" strokeWidth="1" className="fill-transparent stroke-ink-300 dark:stroke-white/25" />
      <rect x="36" y="22" width="10" height="10" className="fill-ink-900 dark:fill-white" />
      <rect x="54" y="24" width="64" height="5" className="fill-ink-900 dark:fill-white" />
      <rect x="54" y="35" width="96" height="3" className="fill-ink-300 dark:fill-white/25" />
      <line x1="20" y1="52" x2="200" y2="52" strokeWidth="1" className="stroke-ink-200 dark:stroke-white/15" />
      <rect x="36" y="62" width="46" height="16" strokeWidth="1" className="fill-transparent stroke-ink-900 dark:stroke-white" />
      <text x="59" y="73" textAnchor="middle" fontSize="9" fontWeight="600" className="fill-ink-900 dark:fill-white">
        Alerta
      </text>
      <rect x="90" y="62" width="46" height="16" className="fill-ink-50 dark:fill-white/10" />
      <text x="113" y="73" textAnchor="middle" fontSize="9" className="fill-ink-700 dark:fill-ink-300">
        NVDA
      </text>
    </svg>
  );
}

/** Cómo funciona: tres columnas con filetes de 1px, ilustración propia y número. */
export function HowItWorks() {
  return (
    <section
      id="como-funciona"
      aria-labelledby="como-funciona-title"
      className="pub-canvas section-y border-t border-ink-300 dark:border-white/12"
    >
      <div className="container-page">
        <FadeIn>
          <p className="label-line">Cómo funciona</p>
          <h2 id="como-funciona-title" className="type-section mt-4 text-ink-900 dark:text-white">
            Tres pasos.
          </h2>
        </FadeIn>

        <StaggerList className="mt-12 grid grid-cols-1 gap-10 md:mt-16 md:gap-12 lg:grid-cols-3 lg:gap-0">
          {STEPS.map((step, i) => (
            <StaggerItem
              key={step.n}
              className={cn(
                "min-w-0 border-t border-ink-300 pt-8 dark:border-white/12 lg:border-t-0 lg:pt-0",
                i > 0 && "lg:border-l lg:pl-10",
                i < STEPS.length - 1 && "lg:pr-10",
              )}
            >
              <div className="flex items-baseline gap-4">
                <span className="num text-[13px] leading-none text-ink-500 dark:text-ink-400">{step.n}</span>
                <span className="label-line">{step.chip}</span>
              </div>

              <div className="mt-8">
                <StepArt step={step.n} />
              </div>

              <h3 className="mt-8 text-[28px] font-medium leading-[1.05] tracking-[-0.03em] text-ink-900 dark:text-white">
                {step.title}
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-600 dark:text-ink-400">{step.body}</p>
            </StaggerItem>
          ))}
        </StaggerList>
      </div>
    </section>
  );
}
