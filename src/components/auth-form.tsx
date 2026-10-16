"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn, signUp, signInWithGoogle } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogoLockup } from "@/components/logo";
import type { FormState } from "@/lib/form-state";

/** Google "G" glyph — inline SVG so no external dependency. */
function GoogleIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

interface AuthFormProps {
  mode: "login" | "signup";
}

export function AuthForm({ mode }: AuthFormProps) {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const plan = searchParams.get("plan");

  const isLogin = mode === "login";
  const isPaidSignup = !isLogin && (plan === "pro" || plan === "elite");
  const planLabel =
    plan === "elite"
      ? "Plan Elite · $16.990 CLP/mes"
      : "Plan Pro · $12.990 CLP/mes";
  const planBlurb =
    plan === "elite"
      ? "Fondos 13F institucionales, portafolios ilimitados y exportación CSV."
      : "Hasta 15 portafolios, alertas en tiempo real y resúmenes AI.";

  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    isLogin ? signIn : signUp,
    {},
  );
  const error = state.error;
  const success = state.success;

  return (
    <div className="w-full max-w-sm">
      {/* Wordmark centrado en la columna */}
      <div className="flex justify-center">
        <Link href="/">
          <LogoLockup />
        </Link>
      </div>

      <h1 className="mt-10 text-[32px] font-medium tracking-[-0.03em] text-ink-900">
        {isLogin ? "Entrar." : "Crear cuenta."}
      </h1>
      <p className="mt-2 text-[15px] text-ink-500">
        {isLogin
          ? "Accede a tu dashboard y alertas."
          : isPaidSignup
            ? "Crea tu cuenta para activar tu suscripción."
            : "Gratis en 2 portafolios. Sin tarjeta."}
      </p>

      {/* Recuadro del plan seleccionado — filete negro 1px */}
      {isPaidSignup && (
        <div className="mt-6 border border-ink-900 p-4">
          <p className="text-[15px] font-medium text-ink-900">{planLabel}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-500">{planBlurb}</p>
        </div>
      )}

      {/* Google OAuth */}
      <form action={signInWithGoogle} className="mt-8">
        <Button type="submit" variant="outline" className="w-full" size="lg">
          <GoogleIcon />
          Continuar con Google
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-ink-200" />
        <span className="text-[13px] text-ink-500">o con tu correo</span>
        <div className="h-px flex-1 bg-ink-200" />
      </div>

      {/* Email form */}
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
        {!isLogin && (
          <Input
            name="full_name"
            label="Nombre (opcional)"
            placeholder="Tu nombre"
            autoComplete="name"
          />
        )}
        <Input
          name="email"
          type="email"
          label="Correo electrónico"
          placeholder="tu@correo.com"
          required
          autoComplete="email"
        />
        <Input
          name="password"
          type="password"
          label="Contraseña"
          placeholder={isLogin ? "Tu contraseña" : "Mínimo 8 caracteres"}
          required
          minLength={isLogin ? undefined : 8}
          autoComplete={isLogin ? "current-password" : "new-password"}
        />

        {error && <p role="alert" className="text-sm font-medium text-negative">{error}</p>}
        {success && (
          <p role="status" className="text-sm font-medium text-positive">
            {success}
          </p>
        )}

        <Button type="submit" loading={isPending} size="lg" className="mt-2 w-full">
          {isLogin ? "Entrar" : "Crear cuenta"}
        </Button>
      </form>

      <p className="mt-6 text-center text-[15px] text-ink-500">
        {isLogin ? "¿No tienes cuenta? " : "¿Ya tienes cuenta? "}
        <Link
          href={
            isLogin
              ? `/signup${next !== "/dashboard" ? `?next=${next}` : ""}`
              : `/login${next !== "/dashboard" ? `?next=${next}` : ""}`
          }
          className="text-ink-900 underline-offset-4 hover:underline"
        >
          {isLogin ? "Regístrate gratis" : "Entrar"}
        </Link>
      </p>
    </div>
  );
}
