import { withSeo } from "@/lib/seo";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { LegalShell, type LegalTocItem } from "@/components/public/legal-shell";

export const metadata = withSeo("/terminos", {
  title: "Términos y condiciones",
  description: "Términos de uso de fraccion.si",
});

const TOC: LegalTocItem[] = [
  { id: "s1", label: "Naturaleza del servicio" },
  { id: "s2", label: "No constituye asesoría financiera" },
  { id: "s3", label: "Fuentes de información" },
  { id: "s4", label: "Cuentas de usuario" },
  { id: "s5", label: "Planes y pagos" },
  { id: "s6", label: "Limitación de responsabilidad" },
  { id: "s7", label: "Modificaciones" },
  { id: "s8", label: "Contacto" },
];

export default function TerminosPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <LegalShell kind="terminos" title="Términos y condiciones" updated="Última actualización: 10 de octubre de 2026" toc={TOC}>

          <div className="legal-doc flex flex-col gap-4 text-ink-700">
            <section id="s1">
              <h2 className="text-lg font-semibold text-ink-900">1. Naturaleza del servicio</h2>
              <p className="mt-2 leading-relaxed">
                fraccion.si es una plataforma de seguimiento de portafolios de inversión basada en
                información pública. El servicio consiste en monitorear fuentes públicas
                (declaraciones de congresistas, informes de corredoras de bolsa, filings
                regulatorios) y enviar alertas por correo electrónico cuando se detectan cambios.
              </p>
              <p className="mt-2 leading-relaxed font-medium text-ink-900">
                fraccion.si NO ejecuta órdenes de compra o venta, NO custodia fondos, NO administra
                inversiones y NO tiene acceso a cuentas de corretaje de los usuarios.
              </p>
            </section>

            <section id="s2">
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

            <section id="s3">
              <h2 className="text-lg font-semibold text-ink-900">3. Fuentes de información</h2>
              <p className="mt-2 leading-relaxed">
                Los datos provienen de fuentes públicas de terceros (Capitol Trades, Renta 4,
                InfoProbidad, SEC, entre otras). fraccion.si no garantiza la exactitud, integridad
                u oportunidad de dicha información, y no se responsabiliza por errores u
                omisiones en las fuentes originales.
              </p>
            </section>

            <section id="s4">
              <h2 className="text-lg font-semibold text-ink-900">4. Cuentas de usuario</h2>
              <p className="mt-2 leading-relaxed">
                Eres responsable de mantener la confidencialidad de tus credenciales y de todas
                las actividades que ocurran bajo tu cuenta. Debes notificarnos inmediatamente
                sobre cualquier uso no autorizado.
              </p>
            </section>

            <section id="s5">
              <h2 className="text-lg font-semibold text-ink-900">5. Planes y pagos</h2>
              <p className="mt-2 leading-relaxed">
                El plan gratuito solo incluye las carteras recomendadas de corredoras. El plan Pro se factura
                mensualmente y puede cancelarse en cualquier momento; la cancelación efectúa
                al final del período pagado. No se realizan reembolsos por períodos parciales.
              </p>
            </section>

            <section id="s6">
              <h2 className="text-lg font-semibold text-ink-900">6. Limitación de responsabilidad</h2>
              <p className="mt-2 leading-relaxed">
                En la máxima medida permitida por la ley, fraccion.si no será responsable por
                daños indirectos, incidentales o consecuentes derivados del uso del servicio,
                incluyendo pérdidas financieras resultantes de decisiones de inversión.
              </p>
            </section>

            <section id="s7">
              <h2 className="text-lg font-semibold text-ink-900">7. Modificaciones</h2>
              <p className="mt-2 leading-relaxed">
                Nos reservamos el derecho de modificar estos términos. Los cambios sustanciales
                serán notificados por correo electrónico con al menos 15 días de anticipación.
              </p>
            </section>

            <section id="s8">
              <h2 className="text-lg font-semibold text-ink-900">8. Contacto</h2>
              <p className="mt-2 leading-relaxed">
                Para consultas sobre estos términos:{" "}
                <a href="mailto:hola@fraccion.si" className="font-medium text-ink-900 underline-offset-4 hover:underline">
                  hola@fraccion.si
                </a>
              </p>
            </section>
          </div>
        </LegalShell>
      </main>
      <SiteFooter />
    </>
  );
}
