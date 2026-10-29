import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/public/auth-shell";

export const metadata = {
  title: "Crear cuenta",
  description: "Crea tu cuenta gratuita en reclu.cl",
};

export default function SignupPage() {
  return (
    <AuthShell>
      <Suspense fallback={<div className="pub-card h-[28rem] w-full max-w-md animate-pulse" />}>
        <AuthForm mode="signup" />
      </Suspense>
    </AuthShell>
  );
}
