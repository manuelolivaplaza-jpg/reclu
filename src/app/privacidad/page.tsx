import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { LegalShell, type LegalTocItem } from "@/components/public/legal-shell";
import { DraftLegalNotice } from "@/components/legal/draft-legal-notice";
import { AI_DISCLAIMER } from "@/lib/advice-filter";

export const metadata = {
  title: "Política de privacidad",
  description: "Cómo reclu.cl maneja tus datos",
};

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

export default function PrivacidadPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <LegalShell kind="privacidad" title="Política de privacidad" updated="Última actualización: 20 de octubre de 2026" toc={TOC}>

          <div className="legal-doc flex flex-col gap-4 text-ink-700">
            <section id="s1">
              <h2 className="text-lg font-semibold text-ink-900">Datos que recopilamos</h2>
              <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 leading-relaxed">
                <li><strong className="text-ink-900">Cuenta:</strong> correo electrónico y nombre (proporcionados al registrarte, vía email o Google OAuth).</li>
                <li><strong className="text-ink-900">Preferencias:</strong> portafolios que sigues, frecuencia de alertas, plan de suscripción.</li>
                <li><strong className="text-ink-900">Tu cartera:</strong> si decides subir tu portafolio (CSV o manual) para comparación — se guarda asociada a tu cuenta.</li>
                <li><strong className="text-ink-900">Uso técnico:</strong> registros básicos de servidor (IP, timestamp) para seguridad y diagnóstico.</li>
              </ul>
            </section>

            <section id="s2">
              <h2 className="text-lg font-semibold text-ink-900">Cómo usamos tus datos</h2>
              <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 leading-relaxed">
                <li>Enviarte las alertas de los portafolios que sigues.</li>
                <li>Generar resúmenes AI relevantes para tus intereses.</li>
                <li>Operar, mantener y mejorar el servicio.</li>
                <li>Prevenir fraude y abuso.</li>
              </ul>
              <p className="mt-2 leading-relaxed font-medium text-ink-900">
                Nunca vendemos ni compartimos tus datos personales con terceros para fines
                publicitarios.
              </p>
            </section>

            <section id="s3">
              <h2 className="text-lg font-semibold text-ink-900">Proveedores de servicio</h2>
              <p className="mt-2 leading-relaxed">
                Usamos proveedores que procesan datos en nuestro nombre:{" "}
                <strong className="text-ink-900">Supabase</strong> (base de datos y autenticación,
                datos alojados en la nube),{" "}
                <strong className="text-ink-900">Resend</strong> (envío de emails transaccionales),{" "}
                <strong className="text-ink-900">OpenRouter</strong> (generación de resúmenes AI —
                solo se envían datos de mercado públicos, nunca datos personales) y{" "}
                <strong className="text-ink-900">Vercel</strong> (hosting).
              </p>
            </section>

            <section id="s4">
              <h2 className="text-lg font-semibold text-ink-900">Analítica y cookies</h2>
              <p className="mt-2 leading-relaxed">
                Usamos <strong className="text-ink-900">analítica sin cookies</strong> para
                medir visitas y eventos de uso (registro, seguir portafolios, apertura del
                asistente). La herramienta de medición (Plausible) no guarda cookies ni
                identificadores persistentes, no comparte datos con redes publicitarias y
                respeta Do Not Track. Puedes ver más en{" "}
                <a
                  href="https://plausible.io/data-policy"
                  className="font-medium text-ink-900 underline-offset-4 hover:underline"
                >
                  su política de datos
                </a>
                .
              </p>
            </section>

            <section id="s5">
              <h2 className="text-lg font-semibold text-ink-900">Retención y eliminación</h2>
              <p className="mt-2 leading-relaxed">
                Conservamos tus datos mientras tu cuenta esté activa. Puedes eliminar tu
                cartera personal en cualquier momento desde la app. Para eliminar tu cuenta
                completamente, escríbenos a{" "}
                <a href="mailto:privacidad@reclu.cl" className="font-medium text-ink-900 underline-offset-4 hover:underline">
                  privacidad@reclu.cl
                </a>{" "}
                y procesaremos la solicitud dentro de 30 días.
              </p>
            </section>

            <section id="s6">
              <h2 className="text-lg font-semibold text-ink-900">Mi portafolio</h2>
              <DraftLegalNotice scope="Describe el tratamiento de tenencias personales y el derecho de supresión." />
              <p className="mt-3 leading-relaxed">
                Si decides usar <strong className="text-ink-900">Mi portafolio</strong>,
                guardamos los símbolos, cantidades, precio promedio, pesos y moneda que
                cargues, junto con tu consentimiento y tus preferencias de alerta. Son
                datos financieros y los tratamos como sensibles.
              </p>
              <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 leading-relaxed">
                <li>
                  <strong className="text-ink-900">Finalidad limitada:</strong> cruzar tus
                  posiciones con noticias y datos públicos para enviarte avisos
                  informativos. No se usan para publicidad ni se venden.
                </li>
                <li>
                  <strong className="text-ink-900">Consentimiento explícito:</strong> el
                  consentimiento es obligatorio, el checkbox parte sin marcar y puedes
                  retirarlo cuando quieras desde Ajustes. Sin consentimiento no tratamos
                  tu cartera para alertas automáticas.
                </li>
                <li>
                  <strong className="text-ink-900">Acceso restringido:</strong> solo tu
                  cuenta puede leer o escribir tus posiciones mediante row-level
                  security. No existen vistas públicas de tu cartera.
                </li>
                <li>
                  <strong className="text-ink-900">Derecho a borrar:</strong> el botón
                  «Borrar mi cartera» de Ajustes elimina tus posiciones, tu consentimiento
                  y tus preferencias de forma inmediata e irreversible.
                </li>
                <li>
                  <strong className="text-ink-900">Cartolas:</strong> cuando la carga de
                  cartolas esté disponible, el archivo se procesará en memoria y no se
                  guardará. Nunca pedimos la clave de tu corredora.
                </li>
              </ul>
            </section>

            <section id="s7">
              <h2 className="text-lg font-semibold text-ink-900">IA</h2>
              <DraftLegalNotice scope="Describe la transferencia internacional a OpenRouter y el alcance del análisis con IA." />
              <p className="mt-3 leading-relaxed">{AI_DISCLAIMER}</p>
              <p className="mt-3 leading-relaxed">
                Para generar un resumen o responder una consulta enviamos a la IA solo
                información de mercado pública y, cuando corresponde, los símbolos y
                pesos en porcentaje de tu cartera.{" "}
                <strong className="text-ink-900">
                  Nunca enviamos montos invertidos, cantidades, tu nombre, tu correo ni
                  ningún dato que te identifique.
                </strong>
              </p>
              <p className="mt-2 leading-relaxed">
                El proveedor de IA es <strong className="text-ink-900">OpenRouter</strong>,
                que opera con servidores fuera de Chile, y el modelo de lenguaje se
                configura en el servidor. Al otorgar el consentimiento de Mi portafolio
                aceptas esta transferencia internacional para la finalidad descrita. No
                usamos modelos gratuitos que permitan entrenar con datos de usuarios.
              </p>
            </section>

            <section id="s8">
              <h2 className="text-lg font-semibold text-ink-900">Tus derechos</h2>
              <p className="mt-2 leading-relaxed">
                Conforme a la Ley 19.628 sobre protección de la vida privada (Chile), tienes
                derecho a acceder, rectificar, cancelar u oponerte al tratamiento de tus datos.
                Ejerce estos derechos escribiéndonos a{" "}
                <a href="mailto:privacidad@reclu.cl" className="font-medium text-ink-900 underline-offset-4 hover:underline">
                  privacidad@reclu.cl
                </a>.
              </p>
            </section>

            <section id="s9">
              <h2 className="text-lg font-semibold text-ink-900">Seguridad</h2>
              <p className="mt-2 leading-relaxed">
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
