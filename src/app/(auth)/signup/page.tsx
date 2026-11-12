import { withSeo } from "@/lib/seo";
import { Suspense } from "react";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { LogoLockup } from "@/components/logo";

export const metadata = withSeo("/signup", {
  title: "Crear cuenta",
  description:
    "Crea tu cuenta gratuita en fraccion.si y revisa las carteras recomendadas de corredoras.",
});

/** Esqueleto del formulario: mismas medidas que la tarjeta real, sin salto. */
function FormFallback() {
  return (
    <div
      className="pub-card w-full max-w-sm p-6 md:p-9"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Cargando formulario de registro…</span>
      <div aria-hidden="true" className="flex animate-pulse flex-col gap-3">
        <div className="h-6 w-24 bg-ink-100" />
        <div className="h-9 w-40 bg-ink-100" />
        <div className="mt-2 h-4 w-full bg-ink-50" />
        <div className="mt-4 h-11 w-full border border-line" />
        <div className="h-11 w-full border border-line" />
        <div className="h-11 w-full border border-line" />
        <div className="h-12 w-full rounded-full bg-ink-100" />
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <div className="pub-canvas flex min-h-[100dvh] flex-col">
      <main
        id="main"
        className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:py-14"
      >
        <div className="w-full max-w-sm">
          <div className="flex justify-center">
            <Link href="/" aria-label="Ir al inicio de Fraccion" className="inline-flex">
              <LogoLockup />
            </Link>
          </div>
          <div className="mt-8">
            <Suspense fallback={<FormFallback />}>
              <AuthForm mode="signup" />
            </Suspense>
          </div>
          <p className="mt-6 text-center text-[13px] leading-relaxed text-ink-500">
            Información pública. No es asesoría de inversión.
          </p>
        </div>
      </main>
    </div>
  );
}
