"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, X } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

/**
 * Páginas de resultado del checkout (éxito / error).
 *
 * Con el proveedor mock (desarrollo), la página de éxito dispara la
 * notificación simulada a /api/billing/webhook/mock — el mismo camino que
 * recorrería el webhook real del proveedor. Se llama una sola vez por id.
 */

/** Círculo de estado del resultado (éxito o error). */
function StatusMark({ ok }: { ok: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={
        ok
          ? "inline-flex size-14 items-center justify-center rounded-full bg-positive/10 text-positive"
          : "inline-flex size-14 items-center justify-center rounded-full bg-negative/10 text-negative"
      }
    >
      {ok ? <Check className="size-7" strokeWidth={2} /> : <X className="size-7" strokeWidth={2} />}
    </span>
  );
}

const CARD =
  "mx-auto flex w-full max-w-xl flex-col gap-7 rounded-2xl border border-ink-200 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-8";

export function UpgradeSuccess({
  planName,
  mockPaymentId,
}: {
  planName: string;
  mockPaymentId: string | null;
}) {
  const fired = useRef(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!mockPaymentId || fired.current) return;
    fired.current = true;
    const controller = new AbortController();
    fetch("/api/billing/webhook/mock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mockPaymentId }),
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        setConfirmed(Boolean(data?.planUpdated ?? data?.status === "duplicate"));
      })
      .catch(() => setConfirmed(false));
    return () => controller.abort();
  }, [mockPaymentId]);

  return (
    <div className={CARD}>
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-[13px] text-ink-500 hover:text-ink-900"
        >
          <ArrowLeft className="size-3.5" strokeWidth={1.5} />
          Volver al dashboard
        </Link>
        <div className="mt-6"><StatusMark ok /></div>
        <h1 className="mt-3 text-[26px] font-semibold tracking-tight text-ink-900 sm:text-[32px]">
          Listo. Plan {planName} activo.
        </h1>
        <p className="mt-1.5 text-[15px] text-ink-500">
          Ya puedes seguir portafolios premium y recibir alertas en tiempo real.
        </p>
      </div>

      {mockPaymentId && (
        <p className="rounded-xl bg-ink-50 p-4 text-[13px] text-ink-500">
          Modo prueba: el pago se simuló y confirmó{" "}
          {confirmed ? (
            <span className="text-ink-900">correctamente</span>
          ) : (
            <span>…si no ves tu plan activo, escribe a hola@fraccion.si</span>
          )}
          . No se realizó ningún cobro real.
        </p>
      )}

      <ul className="flex flex-col divide-y divide-ink-100 rounded-xl border border-ink-200 px-4">
        {[
          "Acceso completo al catálogo premium",
          "Alertas en tiempo real apenas se detecta un cambio",
          "Sin permanencia: cancela cuando quieras desde Ajustes",
        ].map((line) => (
          <li
            key={line}
            className="flex items-start gap-2.5 py-3 text-[14px] text-ink-900"
          >
            <Check className="mt-0.5 size-4 shrink-0 text-positive" strokeWidth={2} />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3 sm:flex-row [&>a]:w-full sm:[&>a]:w-auto">
        <ButtonLink href="/dashboard">Ir al dashboard</ButtonLink>
        <ButtonLink href="/explore" variant="outline">
          Explorar catálogo
        </ButtonLink>
      </div>

      <p className="text-[12px] text-ink-500">
        Solo notificaciones sobre información pública. No ejecutamos órdenes ni entregamos
        asesoría de inversión.
      </p>
    </div>
  );
}

export function UpgradeFailure() {
  return (
    <div className={CARD}>
      <div>
        <Link
          href="/upgrade"
          className="inline-flex items-center gap-1.5 text-[13px] text-ink-500 hover:text-ink-900"
        >
          <ArrowLeft className="size-3.5" strokeWidth={1.5} />
          Volver a intentar
        </Link>
        <div className="mt-6"><StatusMark ok={false} /></div>
        <h1 className="mt-3 text-[26px] font-semibold tracking-tight text-ink-900 sm:text-[32px]">
          El pago no se concretó.
        </h1>
        <p className="mt-1.5 text-[15px] text-ink-500">
          No se realizó ningún cobro. Puedes reintentarlo ahora o escribirnos a
          hola@fraccion.si si el problema persiste.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row [&>a]:w-full sm:[&>a]:w-auto">
        <ButtonLink href="/upgrade?plan=pro">Volver al checkout</ButtonLink>
        <ButtonLink href="/dashboard" variant="outline">
          Ir al dashboard
        </ButtonLink>
      </div>
    </div>
  );
}
