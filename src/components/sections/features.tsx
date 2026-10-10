import {
  BellRing,
  Brain,
  Globe2,
  LineChart,
  ShieldCheck,
  Users,
} from "lucide-react";

const FEATURES = [
  {
    icon: BellRing,
    title: "Alertas en tiempo real",
    description:
      "Te avisamos por email en el momento en que un portafolio que sigues cambia: nuevas compras, ventas o ajustes de ponderación.",
  },
  {
    icon: Brain,
    title: "Resúmenes con AI",
    description:
      "Cada alerta incluye un análisis generado por IA que explica qué pasó, por qué podría importar y el contexto histórico.",
  },
  {
    icon: Globe2,
    title: "Fuentes globales y locales",
    description:
      "Políticos de EE.UU., corredoras chilenas como Renta 4, LarrainVial y BTG, filings 13F y declaraciones InfoProbidad.",
  },
  {
    icon: LineChart,
    title: "Compara con tu cartera",
    description:
      "Sube tu portafolio (CSV o manual) y ve al instante cómo se compara con los que sigues.",
  },
  {
    icon: Users,
    title: "Social proof incorporado",
    description:
      "Ve cuántas personas siguen cada portafolio y descubre los más populares de la semana.",
  },
  {
    icon: ShieldCheck,
    title: "Solo notificaciones",
    description:
      "No ejecutamos órdenes ni custodiados fondos. Información pública, transparente y sin conflictos.",
  },
];

export function Features() {
  return (
    <section id="features" className="border-b border-ink-200/60 py-24">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">
            Todo incluido
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            Una plataforma, todas las señales
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-ink-600">
            Diseñada para inversores que quieren estar informados sin pasar horas
            revisando disclosures y sitios de corredoras.
          </p>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-card border border-ink-200 bg-white p-6 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-raised"
            >
              <div className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-100">
                <feature.icon className="size-5" />
              </div>
              <h3 className="mt-5 text-base font-semibold text-ink-900">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
