"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  grantPortfolioConsent,
  withdrawPortfolioConsent,
} from "@/app/actions/portfolio-consent";
import type { FormState } from "@/lib/form-state";
import {
  formatConsentDate,
  portfolioConsentParagraphs,
  portfolioConsentStatus,
} from "@/lib/portfolio-consent";

/**
 * Consentimiento explícito de Mi portafolio (F75B). El checkbox parte sin
 * marcar; el texto es el de la §2.5 del informe legal. Si la versión aceptada
 * quedó atrás, se pide aceptar de nuevo. Retirarlo borra la cartera.
 */
export function PortfolioConsent({
  consentAt,
  consentVersion,
  model,
}: {
  consentAt: string | null;
  consentVersion: string | null;
  model: string;
}) {
  const [checked, setChecked] = useState(false);
  const [grantState, grantAction, grantPending] = useActionState<FormState, FormData>(
    grantPortfolioConsent,
    {},
  );
  const [withdrawState, withdrawAction, withdrawPending] = useActionState<
    FormState,
    FormData
  >(withdrawPortfolioConsent, {});

  const paragraphs = portfolioConsentParagraphs(model);
  const status = portfolioConsentStatus(consentAt, consentVersion);
  const grantedAt = formatConsentDate(consentAt);

  return (
    <div className="flex flex-col gap-5">
      {status === "current" ? (
        <>
          <div className="border border-ink-200 p-4">
            <p className="text-[15px] text-ink-900">Consentimiento otorgado.</p>
            <p className="mt-1 text-[13px] text-ink-500">
              {grantedAt
                ? `Registrado el ${grantedAt}.`
                : "Registrado en tu cuenta."}{" "}
              Texto aceptado: {consentVersion ?? "versión vigente"}. Puedes
              retirarlo cuando quieras.
            </p>
          </div>

          <p className="text-[13px] leading-relaxed text-ink-500">
            Al retirar el consentimiento{" "}
            <strong className="font-medium text-ink-900">se borra tu cartera</strong>{" "}
            de forma inmediata e irreversible: posiciones, cantidades, costos y
            estos ajustes. No se borra tu cuenta, los portafolios que sigues ni
            tus reglas de alerta.
          </p>

          {withdrawState.error && (
            <p role="alert" className="text-sm font-medium text-negative">
              {withdrawState.error}
            </p>
          )}
          {withdrawState.success && (
            <p role="status" className="text-sm font-medium text-positive">
              {withdrawState.success}
            </p>
          )}
          <form
            action={withdrawAction}
            onSubmit={(event) => {
              const confirmed = window.confirm(
                "Al retirar el consentimiento se borra tu cartera de forma inmediata e irreversible. ¿Continuar?",
              );
              if (!confirmed) event.preventDefault();
            }}
          >
            <Button type="submit" variant="outline" loading={withdrawPending}>
              Retirar consentimiento y borrar mi cartera
            </Button>
          </form>
        </>
      ) : (
        <form action={grantAction} className="flex flex-col gap-5">
          {status === "outdated" && (
            <p
              role="status"
              className="border border-ink-200 p-4 text-[13px] leading-relaxed text-ink-900"
            >
              Actualizamos el texto de consentimiento. Para volver a guardar o
              importar tu cartera, acepta la versión vigente.
            </p>
          )}

          <div className="flex flex-col gap-3 text-[13px] leading-relaxed text-ink-600">
            {paragraphs.map((paragraph) => (
              <p key={paragraph.slice(0, 32)}>{paragraph}</p>
            ))}
            <p>
              Más detalle en la{" "}
              <Link
                href="/privacidad"
                className="font-medium text-ink-900 underline underline-offset-4"
              >
                política de privacidad
              </Link>
              .
            </p>
          </div>

          <label className="flex cursor-pointer items-start gap-3 border border-ink-200 p-4">
            <input
              type="checkbox"
              name="consent"
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-ink-900"
            />
            <span className="text-[14px] leading-relaxed text-ink-900">
              He leído y acepto el consentimiento de la versión vigente,
              incluida la transferencia internacional a OpenRouter y al
              proveedor del modelo. Entiendo que puedo retirarlo y que al
              hacerlo se borra mi cartera.
            </span>
          </label>

          {grantState.error && (
            <p role="alert" className="text-sm font-medium text-negative">
              {grantState.error}
            </p>
          )}
          {grantState.success && (
            <p role="status" className="text-sm font-medium text-positive">
              {grantState.success}
            </p>
          )}

          <Button
            type="submit"
            loading={grantPending}
            disabled={!checked}
            className="w-fit"
          >
            Otorgar consentimiento
          </Button>
          {!checked && (
            <p className="text-[13px] text-ink-500">
              Marca la casilla para habilitar el botón. Sin consentimiento no
              tratamos tu cartera.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
