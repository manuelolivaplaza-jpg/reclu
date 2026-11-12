import { withSeo } from "@/lib/seo";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { LegalShell, type LegalTocItem } from "@/components/public/legal-shell";
import { AI_DISCLAIMER } from "@/lib/advice-filter";

export const metadata = withSeo("/disclaimer", {
  title: "Disclaimer de inversión",
  description: "Información importante sobre el uso de fraccion.si",
});

const TOC: LegalTocItem[] = [
  { id: "s1", label: "Qué NO hace fraccion.si" },
  { id: "s2", label: "Riesgos" },
  { id: "s3", label: "Resúmenes generados por IA" },
  { id: "s4", label: "Mi portafolio" },
  { id: "s5", label: "IA" },
  { id: "s6", label: "Regulación" },
];

const SECTION = "scroll-mt-24 border-t border-ink-200 pt-7 first:border-t-0 first:pt-0 target:border-ink-900 dark:border-white/12 dark:target:border-white print:border-ink-200";
const H2 = "text-[17px] font-semibold leading-snug tracking-[-0.01em] text-ink-900 md:text-[19px] dark:text-white print:text-black";
const STRONG = "font-semibold text-ink-900 dark:text-white";
const LIST = "mt-3 list-disc space-y-1.5 pl-5 marker:text-ink-400 dark:marker:text-ink-500";

export default function DisclaimerPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <LegalShell kind="disclaimer" title="Disclaimer" toc={TOC}>

          <div className="flex flex-col gap-7 text-[15px] leading-[1.68] text-ink-700 md:text-[16px] dark:text-ink-300 print:text-black">
            <p className="border border-ink-900 p-5 text-[15px] leading-[1.68] text-ink-800 md:text-[16px] dark:border-white/60 dark:text-ink-200 print:break-inside-avoid print:border-ink-900 print:text-black">
              <strong className={STRONG}>Información pública, no es consejo de inversión.</strong>{" "}
              Todo el contenido de fraccion.si, incluidos los resúmenes generados por inteligencia
              artificial, tiene fines exclusivamente informativos.
            </p>

            <section id="s1" className={SECTION}>
              <h2 className={H2}>Qué NO hace fraccion.si</h2>
              <ul className={LIST}>
                <li>No ejecuta órdenes de compra ni venta por ti.</li>
                <li>No custodia ni administra tu dinero.</li>
                <li>No tiene acceso a tus cuentas de corretaje.</li>
                <li>No emite recomendaciones personalizadas de inversión.</li>
                <li>No garantiza la exactitud de los datos de terceros.</li>
              </ul>
            </section>

            <section id="s2" className={SECTION}>
              <h2 className={H2}>Riesgos</h2>
              <p className="mt-2.5">
                Las inversiones en instrumentos financieros implican riesgos, incluida la
                pérdida total del capital invertido. Los precios pueden fluctuar
                significativamente. Rentabilidades pasadas (de portafolios de políticos,
                corredoras o fondos) <strong className={STRONG}>no garantizan ni predicen
                resultados futuros</strong>.
              </p>
            </section>

            <section id="s3" className={SECTION}>
              <h2 className={H2}>Resúmenes generados por IA</h2>
              <p className="mt-2.5">
                Los resúmenes AI son generados automáticamente por modelos de lenguaje a partir
                de datos públicos. Pueden contener imprecisiones, interpretaciones erróneas o
                información desactualizada. Deben tratarse como material de lectura inicial,
                no como análisis definitivo.
              </p>
            </section>

            <section id="s4" className={SECTION}>
              <h2 className={H2}>Mi portafolio</h2>
              <p className="mt-3">
                «Mi portafolio» permite guardar tus propias posiciones para cruzar la
                información pública con tus símbolos y mostrarte qué noticias podrían
                afectarte. Es una herramienta descriptiva:{" "}
                <strong className={STRONG}>
                  no evalúa si una posición es adecuada para ti, no propone pesos
                  objetivo y no emite recomendaciones de compra, venta o mantención.
                </strong>{" "}
                Puedes desactivar las alertas, retirar el consentimiento y borrar tu
                cartera en cualquier momento desde Ajustes.
              </p>
            </section>

            <section id="s5" className={SECTION}>
              <h2 className={H2}>IA</h2>
              <p className="mt-3">{AI_DISCLAIMER}</p>
              <p className="mt-3">
                Los análisis con IA describen noticias y datos públicos; no son
                asesoría personalizada ni una recomendación de inversión. El proveedor
                es OpenRouter, con servidores fuera de Chile, y el modelo se configura
                en el servidor. Nunca enviamos montos invertidos, cantidades, tu nombre,
                tu correo ni tu identidad: solo símbolos y pesos en porcentaje cuando
                corresponde.
              </p>
            </section>

            <section id="s6" className={SECTION}>
              <h2 className={H2}>Regulación</h2>
              <p className="mt-2.5">
                fraccion.si no está registrada como corredora de bolsa ni asesora financiera ante
                la Comisión para el Mercado Financiero (CMF) de Chile, la SEC de EE.UU., ni
                ningún otro regulador. El servicio es puramente informativo.
              </p>
            </section>

            <p className="border-t border-ink-200 pt-6 text-[14px] leading-[1.65] text-ink-500 dark:border-white/12 dark:text-ink-400 print:text-black">
              Al utilizar fraccion.si reconoces haber leído y entendido este disclaimer. Si no
              estás de acuerdo, no utilices el servicio.
            </p>
          </div>
        </LegalShell>
      </main>
      <SiteFooter />
    </>
  );
}
