"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/form-state";
import { approvePortfolio, rejectPortfolio, verifyCreator } from "./actions";

const INITIAL: FormState = {};

function Feedback({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-sm font-medium text-ink-900">
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return <p className="text-sm text-ink-500">{state.success}</p>;
  }
  return null;
}

/**
 * Moderación de una cartera: aprobar o rechazar. Solo recibe el id; ningún
 * secreto ni dato de sesión llega al navegador.
 */
export function PortfolioModerationForms({ id }: { id: string }) {
  const [approveState, approveAction, approvePending] = useActionState(
    approvePortfolio,
    INITIAL,
  );
  const [rejectState, rejectAction, rejectPending] = useActionState(
    rejectPortfolio,
    INITIAL,
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <form action={approveAction}>
          <input type="hidden" name="id" value={id} />
          <Button type="submit" size="sm" loading={approvePending}>
            Aprobar
          </Button>
        </form>
        <form action={rejectAction}>
          <input type="hidden" name="id" value={id} />
          <Button type="submit" size="sm" variant="outline" loading={rejectPending}>
            Rechazar
          </Button>
        </form>
      </div>
      <Feedback state={approveState} />
      <Feedback state={rejectState} />
    </div>
  );
}

/** Verificación de un perfil de creador. Habilita su lectura pública. */
export function VerifyCreatorForm({
  id,
  alias,
}: {
  id: string;
  alias: string;
}) {
  const [state, action, pending] = useActionState(verifyCreator, INITIAL);

  return (
    <div className="flex flex-col gap-2">
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          loading={pending}
          aria-label={`Verificar al creador ${alias}`}
        >
          Verificar
        </Button>
      </form>
      <Feedback state={state} />
    </div>
  );
}
