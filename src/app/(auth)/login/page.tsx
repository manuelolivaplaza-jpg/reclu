import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/public/auth-shell";

export const metadata = {
  title: "Entrar",
  description: "Accede a tu dashboard de reclu.cl",
};

export default function LoginPage() {
  return (
    <AuthShell>
      <Suspense fallback={<div className="pub-card h-[28rem] w-full max-w-md animate-pulse" />}>
        <AuthForm mode="login" />
      </Suspense>
    </AuthShell>
  );
}
