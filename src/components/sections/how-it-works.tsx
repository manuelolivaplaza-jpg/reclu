import { Radio, Search, MailCheck } from "lucide-react";

const STEPS = [
  {
    step: "01",
    icon: Search,
    title: "Elige tus portafolios",
    description:
      "Explora el catálogo: políticos de EE.UU., carteras chilenas de Renta 4, tesis de IA y más. Sigue los que te interesen con un clic.",
  },
  {
    step: "02",
    icon: Radio,
    title: "Monitoreamos por ti",
    description:
      "Nuestros pipelines revisan las fuentes periódicamente, detectan cambios y normalizan los datos automáticamente.",
  },
  {
    step: "03",
    icon: MailCheck,
    title: "Recibe alertas claras",
    description:
      "Cuando algo cambia, llega a tu correo un resumen conciso con análisis AI — sin jerga, sin ruido, sin que tengas que revisar nada.",
  },
];

export function HowItWorks() {
  return (
    <section id="como-funciona" className="border-b border-ink-200/60 bg-surface py-24">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">
            Cómo funciona
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            Tres pasos y listo
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-ink-600">
            Sin configuraciones complicadas. Elige, sigue y recibe.
          </p>
        </div>

        <div className="relative mt-16">
          {/* Connecting line */}
          <div
            className="absolute top-[2.25rem] right-[12%] left-[12%] hidden h-px bg-gradient-to-r from-brand-200 via-brand-300 to-brand-200 lg:block"
            aria-hidden
          />
          <ol className="grid gap-10 lg:grid-cols-3">
            {STEPS.map((item) => (
              <li key={item.step} className="relative flex flex-col items-center text-center">
                <div className="relative z-10 flex size-18 items-center justify-center rounded-2xl border border-ink-200 bg-white p-4 shadow-card">
                  <item.icon className="size-7 text-brand-600" />
                  <span className="absolute -top-2.5 -right-2.5 flex size-7 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white shadow-subtle">
                    {item.step}
                  </span>
                </div>
                <h3 className="mt-6 text-lg font-semibold text-ink-900">{item.title}</h3>
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-600">
                  {item.description}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
