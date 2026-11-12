import { withSeo } from "@/lib/seo";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { LegalShell, type LegalTocItem } from "@/components/public/legal-shell";
import { AI_DISCLAIMER } from "@/lib/advice-filter";

export const metadata = withSeo("/privacidad", {
  title: "Política de privacidad",
  description: "Cómo fraccion.si maneja tus datos",
});

const TOC: LegalTocItem[] = [
  { id: "s1", label: "Datos que recopilamos" },
  { id: "s2", label: "Cómo usamos tus datos" },
  { id: "s3", label: "Proveedores de servicio" },
  { id: "s4", label: "Analítica y cookies" },
  { id: "s5", label: "Retención y eliminación" },
  { id: "s6", label: "Mi portafolio" },
  { id: "s7", label: "IA" },
  { id: "s8", label: "Tus derechos" },
  { id: "s9", label: "Seguridad" },
];

/** Enlace dentro del documento: subrayado visible en claro y en oscuro. */
const LINK =
  "font-medium text-ink-900 underline decoration-ink-300 decoration-1 underline-offset-[3px] transition-colors hover:decoration-ink-900 dark:text-white dark:decoration-white/40 dark:hover:decoration-white print:text-black";

const SECTION = "scroll-mt-24 border-t border-ink-200 pt-7 first:border-t-0 first:pt-0 target:border-ink-900 dark:border-white/12 dark:target:border-white print:border-ink-200";
const H2 = "text-[17px] font-semibold leading-snug tracking-[-0.01em] text-ink-900 md:text-[19px] dark:text-white print:text-black";
const STRONG = "font-semibold text-ink-900 dark:text-white";
const LIST = "mt-3 list-disc space-y-1.5 pl-5 marker:text-ink-400 dark:marker:text-ink-500";

export default function PrivacidadPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <LegalShell kind="privacidad" title="Política de privacidad" updated="Última actualización: 20 de octubre de 2026" toc={TOC}>

          <div className="flex flex-col gap-7 text-[15px] leading-[1.68] text-ink-700 md:text-[16px] dark:text-ink-300 print:text-black">
            <section id="s1" className={SECTION}>
              <h2 className={H2}>Datos que recopilamos</h2>
              <ul className={LIST}>
                <li><strong className={STRONG}>Cuenta:</strong> correo electrónico y nombre (proporcionados al registrarte, vía email o Google OAuth).</li>
                <li><strong className={STRONG}>Preferencias:</strong> portafolios que sigues, frecuencia de alertas, plan de suscripción.</li>
                <li><strong className={STRONG}>Tu cartera:</strong> si decides subir tu portafolio (CSV o manual) para comparación, se guarda asociada a tu cuenta.</li>
                <li><strong className={STRONG}>Uso técnico:</strong> registros básicos de servidor (IP, timestamp) para seguridad y diagnóstico.</li>
              </ul>
            </section>

            <section id="s2" className={SECTION}>
              <h2 className={H2}>Cómo usamos tus datos</h2>
              <ul className={LIST}>
                <li>Enviarte las alertas de los portafolios que sigues.</li>
                <li>Generar resúmenes AI relevantes para tus intereses.</li>
                <li>Operar, mantener y mejorar el servicio.</li>
                <li>Prevenir fraude y abuso.</li>
              </ul>
              <p className="mt-2.5 font-medium text-ink-900 dark:text-ink-100">
                Nunca vendemos ni compartimos tus datos personales con terceros para fines
                publicitarios.
              </p>
            </section>

            <section id="s3" className={SECTION}>
              <h2 className={H2}>Proveedores de servicio</h2>
              <p className="mt-2.5">
                Usamos proveedores que procesan datos en nuestro nombre:{" "}
                <strong className={STRONG}>Supabase</strong> (base de datos y autenticación,
                datos alojados en la nube),{" "}
                <strong className={STRONG}>Resend</strong> (envío de emails transaccionales),{" "}
                <strong className={STRONG}>OpenRouter</strong> (generación de resúmenes AI:
                solo se envían datos de mercado públicos, nunca datos personales) y{" "}
                <strong className={STRONG}>Vercel</strong> (hosting).
              </p>
            </section>

            <section id="s4" className={SECTION}>
              <h2 className={H2}>Analítica y cookies</h2>
              <p className="mt-2.5">
                Usamos <strong className={STRONG}>analítica sin cookies</strong> para
                medir visitas y eventos de uso (registro, seguir portafolios, apertura del
                asistente). La herramienta de medición (Plausible) no guarda cookies ni
                identificadores persistentes, no comparte datos con redes publicitarias y
                respeta Do Not Track. Puedes ver más en{" "}
                <a
                  href="https://plausible.io/data-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={LINK}
                >
                  su política de datos
                  <span className="ml-0.5 inline-block text-[0.85em]" aria-hidden>↗</span>
                  <span className="sr-only"> (abre en una pestaña nueva)</span>
                </a>
                .
              </p>
            </section>

            <section id="s5" className={SECTION}>
              <h2 className={H2}>Retención y eliminación</h2>
              <p className="mt-2.5">
                Conservamos tus datos mientras tu cuenta esté activa. Puedes eliminar tu
                cartera personal en cualquier momento desde la app. Para eliminar tu cuenta
                completamente, escríbenos a{" "}
                <a href="mailto:privacidad@fraccion.si" className={LINK}>
                  privacidad@fraccion.si
                </a>{" "}
                y procesaremos la solicitud dentro de 30 días.
              </p>
            </section>

            <section id="s6" className={SECTION}>
              <h2 className={H2}>Mi portafolio</h2>
              <p className="mt-3">
                Si decides usar <strong className={STRONG}>Mi portafolio</strong>,
                guardamos los símbolos, cantidades, precio promedio, pesos y moneda que
                cargues, junto con tu consentimiento y tus preferencias de alerta. Son
                datos financieros y los tratamos como sensibles.
              </p>
              <ul className={LIST}>
                <li>
                  <strong className={STRONG}>Finalidad limitada:</strong> cruzar tus
                  posiciones con noticias y datos públicos para enviarte avisos
                  informativos. No se usan para publicidad ni se venden.
                </li>
                <li>
                  <strong className={STRONG}>Consentimiento explícito:</strong> el
                  consentimiento es obligatorio, el checkbox parte sin marcar y puedes
                  retirarlo cuando quieras desde Ajustes. Sin consentimiento no tratamos
                  tu cartera para alertas automáticas.
                </li>
                <li>
                  <strong className={STRONG}>Acceso restringido:</strong> solo tu
                  cuenta puede leer o escribir tus posiciones mediante row-level
                  security. No existen vistas públicas de tu cartera.
                </li>
                <li>
                  <strong className={STRONG}>Derecho a borrar:</strong> el botón
                  «Borrar mi cartera» de Ajustes elimina tus posiciones, tu consentimiento
                  y tus preferencias de forma inmediata e irreversible.
                </li>
                <li>
                  <strong className={STRONG}>Cartolas:</strong> cuando la carga de
                  cartolas esté disponible, el archivo se procesará en memoria y no se
                  guardará. Nunca pedimos la clave de tu corredora.
                </li>
              </ul>
            </section>

            <section id="s7" className={SECTION}>
              <h2 className={H2}>IA</h2>
              <p className="mt-3">{AI_DISCLAIMER}</p>
              <p className="mt-3">
                Para generar un resumen o responder una consulta enviamos a la IA solo
                información de mercado pública y, cuando corresponde, los símbolos y
                pesos en porcentaje de tu cartera.{" "}
                <strong className={STRONG}>
                  Nunca enviamos montos invertidos, cantidades, tu nombre, tu correo ni
                  ningún dato que te identifique.
                </strong>
              </p>
              <p className="mt-2.5">
                El proveedor de IA es <strong className={STRONG}>OpenRouter</strong>,
                que opera con servidores fuera de Chile, y el modelo de lenguaje se
                configura en el servidor. Al otorgar el consentimiento de Mi portafolio
                aceptas esta transferencia internacional para la finalidad descrita. No
                usamos modelos gratuitos que permitan entrenar con datos de usuarios.
              </p>
            </section>

            <section id="s8" className={SECTION}>
              <h2 className={H2}>Tus derechos</h2>
              <p className="mt-2.5">
                Conforme a la Ley 19.628 sobre protección de la vida privada (Chile), tienes
                derecho a acceder, rectificar, cancelar u oponerte al tratamiento de tus datos.
                Ejerce estos derechos escribiéndonos a{" "}
                <a href="mailto:privacidad@fraccion.si" className={LINK}>
                  privacidad@fraccion.si
                </a>
                .
              </p>
            </section>

            <section id="s9" className={SECTION}>
              <h2 className={H2}>Seguridad</h2>
              <p className="mt-2.5">
                Implementamos medidas de seguridad estándar de la industria: conexiones cifradas
                (TLS), contraseñas hasheadas, row-level security en la base de datos, y acceso
                mínimo necesario por parte del personal.
              </p>
            </section>
          </div>
        </LegalShell>
      </main>
      <SiteFooter />
    </>
  );
}
