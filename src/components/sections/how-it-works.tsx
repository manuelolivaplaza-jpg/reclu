import { FadeIn, StaggerList, StaggerItem } from "@/components/ui/reveal";

const STEPS = [
  {
    n: "01",
    title: "Elige.",
    chip: "Explorar",
    body: "Explora políticos de EE.UU., carteras de Renta 4 y tesis temáticas. Las carteras de corredoras son gratis; seguir portafolios es parte de Pro.",
  },
  {
    n: "02",
    title: "Vigilamos.",
    chip: "Fuentes públicas",
    body: "Revisamos Capitol Trades, las corredoras y los filings, y normalizamos cada cambio.",
  },
  {
    n: "03",
    title: "Llega a tu correo.",
    chip: "Alertas",
    body: "Te llega un correo con el movimiento y, en Pro, un resumen. Tú decides qué hacer.",
  },
];

/** Ilustraciones SVG propias de cada paso (decorativas, sin datos reales). */
function StepArt({ step }: { step: string }) {
  if (step === "01") {
    return (
      <svg viewBox="0 0 220 96" className="h-auto w-full" aria-hidden>
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(${i * 74} ${i === 1 ? 0 : 10})`}>
            <rect width="66" height="80" rx="12" fill={i === 1 ? "#0a0a0a" : "#fff"} stroke="#e6e6e6" />
            <circle cx="16" cy="18" r="7" fill={i === 1 ? "#fff" : "#f0f0f0"} />
            <rect x="10" y="34" width="40" height="5" rx="2.5" fill={i === 1 ? "rgba(255,255,255,0.5)" : "#e6e6e6"} />
            <path
              d={i === 1 ? "M10,66 L22,60 L34,62 L46,52 L56,48" : "M10,64 L22,62 L34,58 L46,60 L56,54"}
              fill="none"
              stroke={i === 1 ? "#22c55e" : "#0f7a32"}
              strokeWidth="2"
              strokeLinecap="round"
            />
          </g>
        ))}
      </svg>
    );
  }
  if (step === "02") {
    return (
      <svg viewBox="0 0 220 96" className="h-auto w-full" aria-hidden>
        {["SEC", "Cámara", "Renta 4"].map((s, i) => (
          <g key={s} transform={`translate(0 ${8 + i * 28})`}>
            <rect width="74" height="22" rx="11" fill="#fff" stroke="#e6e6e6" />
            <text x="37" y="15" textAnchor="middle" fontSize="10" fill="#3d3d3d">{s}</text>
            <path d={`M78,11 C110,11 110,${40 - i * 28 + 8} 140,${40 - i * 28 + 8}`} fill="none" stroke="#c4c4c4" strokeDasharray="3 3" />
          </g>
        ))}
        <rect x="140" y="26" width="80" height="44" rx="12" fill="#0a0a0a" />
        <text x="180" y="45" textAnchor="middle" fontSize="11" fill="#fff" fontWeight="600">fraccion</text>
        <text x="180" y="59" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.6)">normaliza</text>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 220 96" className="h-auto w-full" aria-hidden>
      <rect x="20" y="8" width="180" height="80" rx="14" fill="#fff" stroke="#e6e6e6" />
      <circle cx="42" cy="32" r="10" fill="#0a0a0a" />
      <rect x="60" y="24" width="70" height="6" rx="3" fill="#0a0a0a" />
      <rect x="60" y="36" width="100" height="5" rx="2.5" fill="#e6e6e6" />
      <rect x="34" y="56" width="44" height="18" rx="9" fill="rgba(15,122,50,0.1)" />
      <text x="56" y="68" textAnchor="middle" fontSize="9" fill="#0f7a32" fontWeight="600">Compra</text>
      <rect x="84" y="56" width="40" height="18" rx="9" fill="#f6f6f6" />
      <text x="104" y="68" textAnchor="middle" fontSize="9" fill="#3d3d3d">NVDA</text>
      <circle cx="190" cy="14" r="8" fill="#c81e1e" />
      <text x="190" y="17.5" textAnchor="middle" fontSize="9" fill="#fff" fontWeight="700">1</text>
    </svg>
  );
}

/** Cómo funciona: tres tarjetas con ilustración propia y chip de etapa. */
export function HowItWorks() {
  return (
    <section id="como-funciona" className="pub-canvas py-20 md:py-32">
      <div className="container-page">
        <FadeIn>
          <span className="pub-chip">Cómo funciona</span>
          <h2 className="type-section mt-4 text-ink-900">Tres pasos.</h2>
        </FadeIn>

        <StaggerList className="mt-10 grid grid-cols-1 gap-4 md:mt-14 lg:grid-cols-3">
          {STEPS.map((step) => (
            <StaggerItem key={step.n} className="pub-card flex flex-col overflow-hidden">
              <div className="border-b border-ink-200 bg-ink-50/60 p-5">
                <StepArt step={step.n} />
              </div>
              <div className="p-5 md:p-6">
                <div className="flex items-center gap-2">
                  <span className="num flex size-7 items-center justify-center rounded-lg bg-ink-900 text-[12px] text-white">
                    {step.n}
                  </span>
                  <span className="pub-chip">{step.chip}</span>
                </div>
                <h3 className="mt-4 text-[24px] font-medium tracking-[-0.03em] text-ink-900">{step.title}</h3>
                <p className="mt-2 text-[15px] leading-[1.6] text-ink-500">{step.body}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerList>
      </div>
    </section>
  );
}
