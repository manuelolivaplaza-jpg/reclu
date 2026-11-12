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

/** Enlace dentro del documento: subrayado visible en claro y en oscuro. */
const LINK =
  "font-medium text-ink-900 underline decoration-ink-300 decoration-1 underline-offset-[3px] transition-colors hover:decoration-ink-900 dark:text-white dark:decoration-white/40 dark:hover:decoration-white print:text-black";

const SECTION = "scroll-mt-24 border-t border-ink-200 pt-7 first:border-t-0 first:pt-0 target:border-ink-900 dark:border-white/12 dark:target:border-white print:border-ink-200";
const H2 = "text-[17px] font-semibold leading-snug tracking-[-0.01em] text-ink-900 md:text-[19px] dark:text-white print:text-black";

export default function TerminosPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <LegalShell kind="terminos" title="Términos y condiciones" updated="Última actualización: 10 de octubre de 2026" toc={TOC}>

          <div className="flex flex-col gap-7 text-[15px] leading-[1.68] text-ink-700 md:text-[16px] dark:text-ink-300 print:text-black">
            <section id="s1" className={SECTION}>
              <h2 className={H2}>1. Naturaleza del servicio</h2>
              <p className="mt-2.5">
                fraccion.si es una plataforma de seguimiento de portafolios de inversión basada en
                información pública. El servicio consiste en monitorear fuentes públicas
                (declaraciones de congresistas, informes de corredoras de bolsa, filings
                regulatorios) y enviar alertas por correo electrónico cuando se detectan cambios.
              </p>
              <p className="mt-2.5 font-medium text-ink-900 dark:text-ink-100">
                fraccion.si NO ejecuta órdenes de compra o venta, NO custodia fondos, NO administra
                inversiones y NO tiene acceso a cuentas de corretaje de los usuarios.
              </p>
            </section>

            <section id="s2" className={SECTION}>
              <h2 className={H2}>2. No constituye asesoría financiera</h2>
              <p className="mt-2.5">
                Toda la información proporcionada (incluidos los resúmenes generados por
                inteligencia artificial) tiene fines exclusivamente informativos y educativos. No
                constituye asesoría de inversión, recomendación de compra o venta de instrumentos
                financieros, ni una oferta de servicios financieros.
              </p>
              <p className="mt-2.5">
                Las rentabilidades pasadas no garantizan resultados futuros. Toda inversión
                implica riesgos, incluyendo la posible pérdida del capital invertido. Consulta
                a un asesor financiero registrado antes de tomar decisiones de inversión.
              </p>
            </section>

            <section id="s3" className={SECTION}>
              <h2 className={H2}>3. Fuentes de información</h2>
              <p className="mt-2.5">
                Los datos provienen de fuentes públicas de terceros (Capitol Trades, Renta 4,
                InfoProbidad, SEC, entre otras). fraccion.si no garantiza la exactitud, integridad
                u oportunidad de dicha información, y no se responsabiliza por errores u
                omisiones en las fuentes originales.
              </p>
            </section>

            <section id="s4" className={SECTION}>
              <h2 className={H2}>4. Cuentas de usuario</h2>
              <p className="mt-2.5">
                Eres responsable de mantener la confidencialidad de tus credenciales y de todas
                las actividades que ocurran bajo tu cuenta. Debes notificarnos inmediatamente
                sobre cualquier uso no autorizado.
              </p>
            </section>

            <section id="s5" className={SECTION}>
              <h2 className={H2}>5. Planes y pagos</h2>
              <p className="mt-2.5">
                El plan gratuito solo incluye las carteras recomendadas de corredoras. El plan Pro se factura
                mensualmente y puede cancelarse en cualquier momento; la cancelación efectúa
                al final del período pagado. No se realizan reembolsos por períodos parciales.
              </p>
            </section>

            <section id="s6" className={SECTION}>
              <h2 className={H2}>6. Limitación de responsabilidad</h2>
              <p className="mt-2.5">
                En la máxima medida permitida por la ley, fraccion.si no será responsable por
                daños indirectos, incidentales o consecuentes derivados del uso del servicio,
                incluyendo pérdidas financieras resultantes de decisiones de inversión.
              </p>
            </section>

            <section id="s7" className={SECTION}>
              <h2 className={H2}>7. Modificaciones</h2>
              <p className="mt-2.5">
                Nos reservamos el derecho de modificar estos términos. Los cambios sustanciales
                serán notificados por correo electrónico con al menos 15 días de anticipación.
              </p>
            </section>

            <section id="s8" className={SECTION}>
              <h2 className={H2}>8. Contacto</h2>
              <p className="mt-2.5">
                Para consultas sobre estos términos:{" "}
                <a href="mailto:hola@fraccion.si" className={LINK}>
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
