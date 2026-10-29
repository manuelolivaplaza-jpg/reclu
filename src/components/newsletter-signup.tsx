"use client";

/**
 * Formulario de suscripción al newsletter semanal.
 *
 * Doble opt-in: acá solo se registra el correo; la suscripción se activa
 * cuando la persona abre el enlace del correo de confirmación. El texto de
 * consentimiento dice para qué se usa el correo y enlaza la política de
 * privacidad (Ley 19.628). Sin casilla marcada no se envía nada.
 */

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

const CONSENT_LABEL =
  "Acepto recibir el newsletter semanal de fraccion.si en este correo. " +
  "Se usa solo para enviarme ese resumen y puedo darme de baja en cualquier momento.";

type State = "idle" | "sending" | "sent" | "error";

export function NewsletterSignup({ source = "footer" }: { source?: string }) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "sending") return;

    if (!consent) {
      setError("Marca la casilla para aceptar el consentimiento.");
      setState("error");
      return;
    }

    setState("sending");
    setError(null);

    try {
      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, consent: true, source }),
      });
      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!response.ok || !data?.ok) {
        setError(data?.error ?? "No pudimos registrar tu correo. Intenta de nuevo.");
        setState("error");
        return;
      }

      setState("sent");
      setEmail("");
      setConsent(false);
    } catch {
      setError("No pudimos conectar. Revisa tu conexión e intenta de nuevo.");
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.08em] text-white/45">
          Newsletter semanal
        </p>
        <p className="flex items-start gap-2 text-sm leading-relaxed text-white/70">
          <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
          Revisa tu correo y confirma la suscripción. Si no llega, revisa spam.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-3" noValidate>
      <div>
        <p className="text-xs uppercase tracking-[0.08em] text-white/45">
          Newsletter semanal
        </p>
        <p className="mt-2 text-sm leading-relaxed text-white/62">
          Los cinco movimientos de la semana, con su fuente. Un correo, los viernes.
        </p>
      </div>

      <div className="flex">
        <label htmlFor="newsletter-email" className="sr-only">
          Correo electrónico
        </label>
        <input
          id="newsletter-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          maxLength={320}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="tu@correo.cl"
          disabled={state === "sending"}
          className="h-11 min-w-0 flex-1 rounded-none border border-white/20 bg-transparent px-3 text-[15px] text-white placeholder:text-white/35 focus:border-white focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={state === "sending"}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-white px-5 text-sm font-medium text-ink-900 transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
        >
          {state === "sending" ? "Enviando" : "Suscribirme"}
          {state !== "sending" && <ArrowRight className="size-4" aria-hidden />}
        </button>
      </div>

      <label className="flex items-start gap-2 text-[12px] leading-relaxed text-white/55">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          disabled={state === "sending"}
          className="mt-0.5 size-3.5 shrink-0 accent-white"
          required
        />
        <span>
          {CONSENT_LABEL}{" "}
          <Link
            href="/privacidad"
            className="text-white/80 underline underline-offset-2 hover:text-white"
          >
            Política de privacidad
          </Link>
          .
        </span>
      </label>

      {state === "error" && error && (
        <p role="alert" className="text-xs font-medium text-white">
          {error}
        </p>
      )}
    </form>
  );
}
