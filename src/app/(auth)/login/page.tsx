import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export const metadata = {
  title: "Entrar",
  description: "Accede a tu dashboard de reclu.cl",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <Suspense fallback={<div className="h-96 w-full max-w-sm animate-pulse bg-ink-100" />}>
          <AuthForm mode="login" />
        </Suspense>
      </main>
      <p className="pb-10 text-center text-xs leading-relaxed text-ink-500">
        Información pública, no es asesoría de inversión.
      </p>
    </div>
  );
}
