"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/form-state";
import { approveDraft, editDraft, rejectDraft, sendDraft } from "./actions";

export interface DraftFormsProps {
  draft: {
    id: string;
    channel: string;
    body: string;
    status: string;
  };
}

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
 * Formularios de un borrador. Solo reciben id, canal, cuerpo y estado:
 * ningún secreto ni variable de entorno llega al navegador.
 */
export function DraftForms({ draft }: DraftFormsProps) {
  const [editing, setEditing] = useState(false);
  const [approveState, approveAction, approvePending] = useActionState(
    approveDraft,
    INITIAL,
  );
  const [rejectState, rejectAction, rejectPending] = useActionState(
    rejectDraft,
    INITIAL,
  );
  const [editState, editAction, editPending] = useActionState(
    editDraft,
    INITIAL,
  );
  const [sendState, sendAction, sendPending] = useActionState(
    sendDraft,
    INITIAL,
  );

  const canApprove = draft.status !== "approved" && draft.status !== "sent";
  const canReject = draft.status !== "sent";
  const canSend = draft.status === "approved";
  const canEdit = draft.status !== "sent";

  return (
    <div className="flex flex-col gap-4 border-t border-ink-200 p-4">
      <div className="flex flex-wrap items-start gap-2">
        {canApprove && (
          <form action={approveAction}>
            <input type="hidden" name="id" value={draft.id} />
            <Button type="submit" size="sm" loading={approvePending}>
              Aprobar
            </Button>
          </form>
        )}

        {canSend && (
          <form action={sendAction}>
            <input type="hidden" name="id" value={draft.id} />
            <Button type="submit" size="sm" loading={sendPending}>
              Enviar
            </Button>
          </form>
        )}

        {canEdit && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setEditing((value) => !value)}
          >
            {editing ? "Cerrar edición" : "Editar"}
          </Button>
        )}

        {canReject && (
          <form action={rejectAction} className="flex items-center gap-2">
            <input type="hidden" name="id" value={draft.id} />
            <input
              type="text"
              name="reason"
              maxLength={500}
              placeholder="Motivo (opcional)"
              aria-label={`Motivo del rechazo para el borrador ${draft.id}`}
              className="h-9 w-44 border border-ink-200 bg-white px-3 text-sm outline-none focus:border-ink-900"
            />
            <Button
              type="submit"
              size="sm"
              variant="ghost"
              loading={rejectPending}
            >
              Rechazar
            </Button>
          </form>
        )}
      </div>

      {editing && (
        <form action={editAction} className="flex flex-col gap-2">
          <input type="hidden" name="id" value={draft.id} />
          <label
            htmlFor={`body-${draft.id}`}
            className="text-xs uppercase tracking-[0.08em] text-ink-500"
          >
            Texto del borrador
          </label>
          <textarea
            id={`body-${draft.id}`}
            name="body"
            defaultValue={draft.body}
            rows={6}
            className="w-full border border-ink-200 bg-white p-3 text-sm leading-relaxed outline-none focus:border-ink-900"
          />
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" loading={editPending}>
              Guardar cambios
            </Button>
            <span className="text-xs text-ink-500">
              Al editar, el borrador vuelve a pendiente de aprobación.
            </span>
          </div>
          <Feedback state={editState} />
        </form>
      )}

      <div className="flex flex-col gap-1">
        <Feedback state={approveState} />
        <Feedback state={rejectState} />
        <Feedback state={sendState} />
      </div>
    </div>
  );
}
