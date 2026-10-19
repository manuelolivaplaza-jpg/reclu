/**
 * Contrato del núcleo de publicación.
 *
 * Todo sale como borrador. Un `Publisher` no se llama solo: `publishDraft`
 * decide si corresponde enviar. El cuerpo lo redacta otra capa; este módulo
 * no arma recomendaciones ni ejecuta órdenes (Ley 21.521).
 *
 * TODO(F16): la pantalla que muestre el borrador debe usar
 * `src/components/legal/legal-notice.tsx`. Acá no hay UI.
 */

export type Channel = "x" | "telegram" | "newsletter";

export type DraftStatus = "draft" | "approved" | "rejected" | "sent" | "failed";

/** Fila de `publish_drafts`. Sin correo, nombre ni otros datos de contacto. */
export interface Draft {
  id: string;
  channel: Channel;
  body: string;
  payload: Record<string, unknown>;
  source_alert_id: string | null;
  status: DraftStatus;
  preview_url: string | null;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
  sent_at: string | null;
  external_id: string | null;
  error: string | null;
}

/**
 * Adaptador de un canal. `validate` lanza si el cuerpo no sirve.
 * `send` solo debe correr cuando `publishDraft` ya autorizó el envío.
 */
export interface Publisher {
  channel: Channel;
  validate(body: string): void;
  send(draft: Draft): Promise<{ externalId: string }>;
}

/** Resultado de intentar publicar. El caso omitido siempre trae `reason`. */
export type PublishResult =
  | { skipped: true; reason: string }
  | { skipped: false; rejected: true; reason: string }
  | { skipped: false; externalId: string }
  | { skipped: false; error: string };

/** Registro en memoria del proceso. No es la fila de la base. */
export interface PublishRecord {
  draftId: string;
  channel: Channel;
  at: string;
  result: PublishResult;
}
