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
    <section id="precios" className="bg-white py-20 md:py-28">
      <div className="container-page">
        <h2 className="type-section text-ink-900">Empieza en cero.</h2>

        <div className="mt-12 grid max-w-[880px] grid-cols-1 gap-px border border-ink-200 bg-ink-200 md:grid-cols-2">
          {/* Gratis */}
          <div className="flex flex-col bg-white p-8 md:p-10">
            <p className="label-line">Gratis</p>
            <p className="type-section mt-4 text-ink-900">$0</p>
            <p className="label-line mt-1">Para siempre</p>

            <ul className="mt-8 flex flex-1 flex-col">
              {FREE_FEATURES.map((f) => (
                <li
                  key={f}
                  className="border-b border-ink-200 py-3 text-[15px] text-ink-900 last:border-b-0"
                >
                  {f}
                </li>
              ))}
            </ul>

            <ButtonLink href="/signup" variant="outline" className="mt-8 w-full">
              Crear cuenta
            </ButtonLink>
          </div>

          {/* Pro */}
          <div className="flex flex-col bg-ink-900 p-8 text-white md:p-10">
            <p className="text-[13px] text-white/60">Pro</p>
            <p className="type-section mt-4 text-white">$9.990</p>
            <p className="mt-1 text-[13px] text-white/60">CLP / mes</p>

            <ul className="mt-8 flex flex-1 flex-col">
              {PRO_FEATURES.map((f) => (
                <li
                  key={f}
                  className="border-b py-3 text-[15px] text-white last:border-b-0"
                  style={{ borderColor: "rgba(255,255,255,0.16)" }}
                >
                  {f}
                </li>
              ))}
            </ul>

            <ButtonLink
              href="/signup?plan=pro"
              className="mt-8 w-full bg-white text-ink-900 hover:opacity-90"
            >
              Pasar a Pro
            </ButtonLink>
          </div>
        </div>

        <p className="mt-8 text-[13px] text-ink-500">
          Planes para equipos:{" "}
          <a href="mailto:hola@reclu.cl" className="text-ink-900 underline-offset-4 hover:underline">
            hola@reclu.cl
          </a>
        </p>
      </div>
    </section>
  );
}
