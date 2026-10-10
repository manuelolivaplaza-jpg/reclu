import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { SiteFooter } from "@/components/site-footer";

export const metadata = {
  title: "Crear cuenta",
  description: "Crea tu cuenta gratuita en reclu.cl",
};

export default function SignupPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex flex-1 items-center justify-center bg-glow px-4 py-16">
        <Suspense fallback={<div className="h-96 w-full max-w-md animate-pulse rounded-card bg-ink-100" />}>
          <AuthForm mode="signup" />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
