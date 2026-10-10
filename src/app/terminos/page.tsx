import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata = {
  title: "Términos y condiciones",
  description: "Términos de uso de reclu.cl",
};

export default function TerminosPage() {
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

          <h1 className="mt-8 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            Términos y condiciones
          </h1>
          <p className="mt-2 text-sm text-ink-500">Última actualización: 10 de octubre de 2026</p>

          <div className="prose-reclu mt-10 flex flex-col gap-6 text-ink-700">
            <section>
              <h2 className="text-lg font-semibold text-ink-900">1. Naturaleza del servicio</h2>
              <p className="mt-2 leading-relaxed">
                reclu.cl es una plataforma de seguimiento de portafolios de inversión basada en
                información pública. El servicio consiste en monitorear fuentes públicas
                (declaraciones de congresistas, informes de corredoras de bolsa, filings
                regulatorios) y enviar alertas por correo electrónico cuando se detectan cambios.
              </p>
              <p className="mt-2 leading-relaxed font-medium text-ink-900">
                reclu.cl NO ejecuta órdenes de compra o venta, NO custodia fondos, NO administra
                inversiones y NO tiene acceso a cuentas de corretaje de los usuarios.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-ink-900">2. No constituye asesoría financiera</h2>
              <p className="mt-2 leading-relaxed">
                Toda la información proporcionada —incluyendo resúmenes generados por inteligencia
                artificial— tiene fines exclusivamente informativos y educativos. No constituye
                asesoría de inversión, recomendación de compra o venta de instrumentos financieros,
                ni una oferta de servicios financieros.
              </p>
              <p className="mt-2 leading-relaxed">
                Las rentabilidades pasadas no garantizan resultados futuros. Toda inversión
                implica riesgos, incluyendo la posible pérdida del capital invertido. Consulta
                a un asesor financiero registrado antes de tomar decisiones de inversión.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-ink-900">3. Fuentes de información</h2>
              <p className="mt-2 leading-relaxed">
                Los datos provienen de fuentes públicas de terceros (Capitol Trades, Renta 4,
                InfoProbidad, SEC, entre otras). reclu.cl no garantiza la exactitud, integridad
                u oportunidad de dicha información, y no se responsabiliza por errores u
                omisiones en las fuentes originales.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-ink-900">4. Cuentas de usuario</h2>
              <p className="mt-2 leading-relaxed">
                Eres responsable de mantener la confidencialidad de tus credenciales y de todas
                las actividades que ocurran bajo tu cuenta. Debes notificarnos inmediatamente
                sobre cualquier uso no autorizado.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-ink-900">5. Planes y pagos</h2>
              <p className="mt-2 leading-relaxed">
                El plan gratuito permite seguir hasta 2 portafolios. El plan Pro se factura
                mensualmente y puede cancelarse en cualquier momento; la cancelación efectúa
                al final del período pagado. No se realizan reembolsos por períodos parciales.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-ink-900">6. Limitación de responsabilidad</h2>
              <p className="mt-2 leading-relaxed">
                En la máxima medida permitida por la ley, reclu.cl no será responsable por
                daños indirectos, incidentales o consecuentes derivados del uso del servicio,
                incluyendo pérdidas financieras resultantes de decisiones de inversión.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-ink-900">7. Modificaciones</h2>
              <p className="mt-2 leading-relaxed">
                Nos reservamos el derecho de modificar estos términos. Los cambios sustanciales
                serán notificados por correo electrónico con al menos 15 días de anticipación.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-ink-900">8. Contacto</h2>
              <p className="mt-2 leading-relaxed">
                Para consultas sobre estos términos:{" "}
                <a href="mailto:hola@reclu.cl" className="font-medium text-ink-900 underline-offset-4 hover:underline">
                  hola@reclu.cl
                </a>
              </p>
            </section>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
