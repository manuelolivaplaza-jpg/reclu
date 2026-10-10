import Link from "next/link";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata = {
  title: "Disclaimer de inversión",
  description: "Información importante sobre el uso de reclu.cl",
};

export default function DisclaimerPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="container-page max-w-3xl py-16">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900"
          >
            <ArrowLeft className="size-4" />
            Volver al inicio
          </Link>

          <div className="mt-8 flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-warning-bg text-warning">
              <ShieldAlert className="size-6" />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
              Disclaimer
            </h1>
          </div>

          <div className="mt-10 flex flex-col gap-6 text-ink-700">
            <p className="rounded-card border border-warning/30 bg-warning-bg p-5 leading-relaxed text-ink-800">
              <strong className="font-semibold">Información pública, no es consejo de inversión.</strong>{" "}
              Todo el contenido de reclu.cl —incluidos los resúmenes generados por inteligencia
              artificial— tiene fines exclusivamente informativos.
            </p>

            <section>
              <h2 className="text-lg font-semibold text-ink-900">Qué NO hace reclu.cl</h2>
              <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 leading-relaxed">
                <li>No ejecuta órdenes de compra ni venta por ti.</li>
                <li>No custodia ni administra tu dinero.</li>
                <li>No tiene acceso a tus cuentas de corretaje.</li>
                <li>No emite recomendaciones personalizadas de inversión.</li>
                <li>No garantiza la exactitud de los datos de terceros.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-ink-900">Riesgos</h2>
              <p className="mt-2 leading-relaxed">
                Las inversiones en instrumentos financieros implican riesgos, incluida la
                pérdida total del capital invertido. Los precios pueden fluctuar
                significativamente. Rentabilidades pasadas —de portafolios de políticos,
                corredoras o fondos— <strong className="text-ink-900">no garantizan ni predicen
                resultados futuros</strong>.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-ink-900">Resúmenes generados por IA</h2>
              <p className="mt-2 leading-relaxed">
                Los resúmenes AI son generados automáticamente por modelos de lenguaje a partir
                de datos públicos. Pueden contener imprecisiones, interpretaciones erróneas o
                información desactualizada. Deben tratarse como material de lectura inicial,
                no como análisis definitivo.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-ink-900">Regulación</h2>
              <p className="mt-2 leading-relaxed">
                reclu.cl no está registrada como corredora de bolsa ni asesora financiera ante
                la Comisión para el Mercado Financiero (CMF) de Chile, la SEC de EE.UU., ni
                ningún otro regulador. El servicio es puramente informativo.
              </p>
            </section>

            <p className="mt-4 border-t border-ink-200 pt-6 text-sm leading-relaxed text-ink-500">
              Al utilizar reclu.cl reconoces haber leído y entendido este disclaimer. Si no
              estás de acuerdo, no utilices el servicio.
            </p>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
