"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

/**
 * Páginas de resultado del checkout (éxito / error).
 *
 * Con el proveedor mock (desarrollo), la página de éxito dispara la
 * notificación simulada a /api/billing/webhook/mock — el mismo camino que
 * recorrería el webhook real del proveedor. Se llama una sola vez por id.
 */

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
    <div className="flex max-w-xl flex-col gap-8">
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-[13px] text-ink-500 hover:text-ink-900"
        >
          <ArrowLeft className="size-3.5" strokeWidth={1.5} />
          Volver al dashboard
        </Link>
        <h1 className="mt-3 text-[28px] font-medium tracking-[-0.035em] text-ink-900 sm:text-[36px]">
          Listo. Plan {planName} activo.
        </h1>
        <p className="mt-1.5 text-[15px] text-ink-500">
          Ya puedes seguir portafolios premium, recibir alertas en tiempo real y usar
          los resúmenes AI completos.
        </p>
      </div>

      {mockPaymentId && (
        <p className="border border-ink-200 p-4 text-[13px] text-ink-500">
          Modo prueba: el pago se simuló y confirmó{" "}
          {confirmed ? (
            <span className="text-ink-900">correctamente</span>
          ) : (
            <span>…si no ves tu plan activo, escribe a hola@reclu.cl</span>
          )}
          . No se realizó ningún cobro real.
        </p>
      )}

      <ul className="flex flex-col border-t border-ink-200">
        {[
          "Acceso completo al catálogo premium",
          "Alertas en tiempo real con resúmenes AI",
          "Sin permanencia: cancela cuando quieras desde Ajustes",
        ].map((line) => (
          <li
            key={line}
            className="flex items-start gap-2.5 border-b border-ink-200 py-3 text-[14px] text-ink-900"
          >
            <Check className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-4">
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
    <div className="flex max-w-xl flex-col gap-8">
      <div>
        <Link
          href="/upgrade"
          className="inline-flex items-center gap-1.5 text-[13px] text-ink-500 hover:text-ink-900"
        >
          <ArrowLeft className="size-3.5" strokeWidth={1.5} />
          Volver a intentar
        </Link>
        <h1 className="mt-3 text-[28px] font-medium tracking-[-0.035em] text-ink-900 sm:text-[36px]">
          El pago no se concretó.
        </h1>
        <p className="mt-1.5 text-[15px] text-ink-500">
          No se realizó ningún cobro. Puedes reintentarlo ahora o escribirnos a
          hola@reclu.cl si el problema persiste.
        </p>
      </div>

      <div className="flex flex-wrap gap-4">
        <ButtonLink href="/upgrade?plan=pro">Volver al checkout</ButtonLink>
        <ButtonLink href="/dashboard" variant="outline">
          Ir al dashboard
        </ButtonLink>
      </div>
    </div>
  );
}
