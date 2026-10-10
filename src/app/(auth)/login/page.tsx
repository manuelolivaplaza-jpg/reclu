import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { SiteFooter } from "@/components/site-footer";

export const metadata = {
  title: "Iniciar sesión",
  description: "Accede a tu dashboard de reclu.cl",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex flex-1 items-center justify-center bg-glow px-4 py-16">
        <Suspense fallback={<div className="h-96 w-full max-w-md animate-pulse rounded-card bg-ink-100" />}>
          <AuthForm mode="login" />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
