"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Estado de la suscripción para Ajustes (mínimo, de acuerdo al diseño):
 * muestra plan activo + próxima fecha de cobro y un botón Cancelar que
 * llama a /api/billing/cancel. Si no hay suscripción activa no renderiza
 * nada (la Card del plan ya cubre el upgrade).
 */

export interface BillingStatusProps {
  plan: "pro" | "elite";
  period: "mensual" | "anual";
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  providerLabel: string;
}

export function BillingStatus({
  plan,
  period,
  status,
  currentPeriodEnd,
  cancelAtPeriodEnd,
  providerLabel,
}: BillingStatusProps) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canceled, setCanceled] = useState(cancelAtPeriodEnd);

  const planName = plan === "elite" ? "Elite" : "Pro";
  const endDate = currentPeriodEnd
    ? new Date(currentPeriodEnd).toLocaleDateString("es-CL", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  async function handleCancel() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/cancel", { method: "POST" });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "No pudimos cancelar. Intenta más tarde.");
      } else {
        setCanceled(true);
        setConfirming(false);
      }
    } catch {
      setError("No pudimos cancelar. Revisa tu conexión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 border-t border-ink-200 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[14px] text-ink-900">
          Suscripción {planName} ·{" "}
          <span className="text-ink-500">
            {period === "anual" ? "anual" : "mensual"} vía {providerLabel}
            {endDate ? ` · renueva el ${endDate}` : ""}
          </span>
        </p>
        {status === "past_due" && (
          <span className="text-[13px] font-medium text-negative">
            Pago rechazado — actualiza tu medio de pago
          </span>
        )}
      </div>

      {canceled ? (
        <p className="text-[13px] text-ink-500">
          Cancelada: mantienes el acceso {planName} hasta {endDate ?? "el fin del período"}.
          Después tu cuenta vuelve al plan gratuito.
        </p>
      ) : (
        <>
          {confirming ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" variant="outline" onClick={handleCancel} loading={loading}>
                Confirmar cancelación
              </Button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="text-[13px] text-ink-500 underline-offset-4 hover:underline"
              >
                Volver
              </button>
              <p className="text-[12px] text-ink-500">
                Sigues con acceso hasta el fin del período pagado.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="w-fit text-[13px] text-ink-500 underline-offset-4 hover:underline"
            >
              Cancelar suscripción
            </button>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="text-[13px] font-medium text-negative">
          {error}
        </p>
      )}
    </div>
  );
}
