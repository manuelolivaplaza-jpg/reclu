import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata = {
  title: "Política de privacidad",
  description: "Cómo reclu.cl maneja tus datos",
};

export default function PrivacidadPage() {
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
            Política de privacidad
          </h1>
          <p className="mt-2 text-sm text-ink-500">Última actualización: 10 de octubre de 2026</p>

          <div className="mt-10 flex flex-col gap-6 text-ink-700">
            <section>
              <h2 className="text-lg font-semibold text-ink-900">Datos que recopilamos</h2>
              <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 leading-relaxed">
                <li><strong className="text-ink-900">Cuenta:</strong> correo electrónico y nombre (proporcionados al registrarte, vía email o Google OAuth).</li>
                <li><strong className="text-ink-900">Preferencias:</strong> portafolios que sigues, frecuencia de alertas, plan de suscripción.</li>
                <li><strong className="text-ink-900">Tu cartera:</strong> si decides subir tu portafolio (CSV o manual) para comparación — se guarda asociada a tu cuenta.</li>
                <li><strong className="text-ink-900">Uso técnico:</strong> registros básicos de servidor (IP, timestamp) para seguridad y diagnóstico.</li>
              </ul>
            </section>

            <section>
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

            <section>
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

            <section>
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

            <section>
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

            <section>
              <h2 className="text-lg font-semibold text-ink-900">Seguridad</h2>
              <p className="mt-2 leading-relaxed">
                Implementamos medidas de seguridad estándar de la industria: conexiones cifradas
                (TLS), contraseñas hasheadas, row-level security en la base de datos, y acceso
                mínimo necesario por parte del personal.
              </p>
            </section>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
