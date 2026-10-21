"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { deleteMyPortfolio } from "@/app/actions/portfolio-consent";
import type { FormState } from "@/lib/form-state";
import { DELETE_CONFIRMATION_WORD } from "@/lib/portfolio-consent";

/**
 * "Borrar mi cartera" (F75). Exige escribir BORRAR; la server action vuelve a
 * validar el texto y llama a la RPC `delete_my_portfolio()`.
 */
export function DeletePortfolioForm() {
  const [confirmation, setConfirmation] = useState("");
  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    deleteMyPortfolio,
    {},
  );
  const valid = confirmation.trim() === DELETE_CONFIRMATION_WORD;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p className="text-[13px] leading-relaxed text-ink-600">
        Se borran tus posiciones, el consentimiento y estos ajustes. El borrado
        es inmediato e irreversible. No se borra tu cuenta, tus portafolios
        seguidos ni tus reglas de alerta.
      </p>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-ink-500">
          Escribe {DELETE_CONFIRMATION_WORD} para confirmar
        </span>
        <input
          type="text"
          name="confirm"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="h-11 max-w-xs border border-ink-200 bg-white px-3 text-[15px] text-ink-900"
        />
      </label>

      {state.error && (
        <p role="alert" className="text-sm font-medium text-negative">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="text-sm font-medium text-positive">
          {state.success}
        </p>
      )}

      <Button
        type="submit"
        variant="outline"
        loading={isPending}
        disabled={!valid}
        className="w-fit"
      >
        Borrar mi cartera
      </Button>
    </form>
  );
}
