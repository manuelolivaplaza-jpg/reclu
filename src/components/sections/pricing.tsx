import { ButtonLink } from "@/components/ui/button";

const FREE_FEATURES = [
  "Seguir hasta 2 portafolios",
  "Alertas por email cuando hay cambios",
  "Dashboard personal",
  "Comparación con tu cartera",
  "Historial de alertas",
];

const PRO_FEATURES = [
  "Portafolios ilimitados",
  "Resúmenes AI completos en cada alerta",
  "Alertas en tiempo real",
  "Portafolios premium",
  "Soporte prioritario",
  "Acceso anticipado a nuevas fuentes",
];

/**
 * Precios — dos columnas. Gratis en blanco, Pro en negativo (fondo negro).
 * Gap de 1px sobre #e6e6e6 = el filete entre columnas. Radio 0.
 */
export function Pricing() {
  return (
    <section id="precios" className="bg-white py-28 md:py-36">
      <div className="container-page">
        <h2 className="type-section text-ink-900">Empieza en cero.</h2>

        <div className="mt-16 grid max-w-[880px] grid-cols-1 gap-px border border-ink-200 bg-ink-200 md:mt-20 md:grid-cols-2">
          {/* Gratis */}
          <div className="flex flex-col bg-white p-8 md:p-12">
            <p className="label-line">Gratis</p>
            <p className="type-section num mt-5 text-ink-900">$0</p>
            <p className="label-line mt-3">Para siempre</p>

            <ul className="mt-10 flex flex-1 flex-col border-t border-ink-200">
              {FREE_FEATURES.map((f) => (
                <li
                  key={f}
                  className="border-b border-ink-200 py-3.5 text-[15px] leading-snug text-ink-900 last:border-b-0"
                >
                  {f}
                </li>
              ))}
            </ul>

            <ButtonLink href="/signup" variant="outline" className="mt-10 w-full">
              Crear cuenta
            </ButtonLink>
          </div>

          {/* Pro */}
          <div className="flex flex-col bg-ink-900 p-8 text-white md:p-12">
            <p className="text-[13px] text-white/60">Pro</p>
            <p className="type-section num mt-5 text-white">$9.990</p>
            <p className="mt-3 text-[13px] text-white/60">CLP / mes</p>

            <ul
              className="mt-10 flex flex-1 flex-col border-t"
              style={{ borderColor: "rgba(255,255,255,0.16)" }}
            >
              {PRO_FEATURES.map((f) => (
                <li
                  key={f}
                  className="border-b py-3.5 text-[15px] leading-snug text-white last:border-b-0"
                  style={{ borderColor: "rgba(255,255,255,0.16)" }}
                >
                  {f}
                </li>
              ))}
            </ul>

            <ButtonLink
              href="/signup?plan=pro"
              className="mt-10 w-full bg-white text-ink-900 hover:opacity-90"
            >
              Pasar a Pro
            </ButtonLink>
          </div>
        </div>

        <p className="mt-10 text-[13px] text-ink-500">
          Planes para equipos:{" "}
          <a
            href="mailto:hola@reclu.cl"
            className="text-ink-900 underline decoration-transparent underline-offset-[0.25em] [text-decoration-thickness:1px] transition-[text-decoration-color] duration-200 hover:decoration-ink-900"
          >
            hola@reclu.cl
          </a>
        </p>
      </div>
    </section>
  );
}
