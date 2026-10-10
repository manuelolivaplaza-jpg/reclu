import { Check, Sparkles } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
  "Alertas en tiempo real (sin batch)",
  "Portafolios premium (Claude Portfolio y más)",
  "Soporte prioritario",
  "Acceso anticipado a nuevas fuentes",
];

export function Pricing() {
  return (
    <section id="precios" className="border-b border-ink-200/60 bg-surface py-24">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">
            Precios
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            Empieza gratis. Crece cuando quieras.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-ink-600">
            Sin sorpresas. Cancela cuando quieras.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-4xl gap-6 lg:grid-cols-2">
          {/* Free plan */}
          <div className="relative rounded-card border border-ink-200 bg-white p-8 shadow-card">
            <h3 className="text-lg font-semibold text-ink-900">Gratis</h3>
            <p className="mt-1.5 text-sm text-ink-600">Para probar y seguir lo esencial.</p>
            <div className="mt-6 flex items-baseline gap-1.5">
              <span className="text-4xl font-semibold tracking-tight text-ink-900">$0</span>
              <span className="text-sm text-ink-500">/mes para siempre</span>
            </div>
            <ButtonLink href="/signup" variant="outline" size="lg" className="mt-6 w-full">
              Crear cuenta gratis
            </ButtonLink>
            <ul className="mt-8 flex flex-col gap-3.5">
              {FREE_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-3 text-sm text-ink-700">
                  <Check className="mt-0.5 size-4 shrink-0 text-ink-400" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          {/* Pro plan */}
          <div
            className={cn(
              "relative rounded-card border-2 border-brand-500 bg-white p-8 shadow-raised",
            )}
          >
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
              <Badge variant="brand" className="gap-1.5 shadow-subtle">
                <Sparkles className="size-3" />
                Más popular
              </Badge>
            </div>
            <h3 className="text-lg font-semibold text-ink-900">Pro</h3>
            <p className="mt-1.5 text-sm text-ink-600">
              Para quienes siguen todo y quieren el análisis completo.
            </p>
            <div className="mt-6 flex items-baseline gap-1.5">
              <span className="text-4xl font-semibold tracking-tight text-ink-900">$9.990</span>
              <span className="text-sm text-ink-500">CLP /mes</span>
            </div>
            <ButtonLink href="/signup?plan=pro" size="lg" className="mt-6 w-full">
              Suscribirse a Pro
            </ButtonLink>
            <ul className="mt-8 flex flex-col gap-3.5">
              {PRO_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-3 text-sm text-ink-700">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand-600" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-10 text-center text-sm text-ink-500">
          ¿Necesitas más?{" "}
          <a href="mailto:hola@reclu.cl" className="font-medium text-brand-600 hover:underline">
            Escríbenos
          </a>{" "}
          para planes familiares e institucionales.
        </p>
      </div>
    </section>
  );
}
