/**
 * Emisor del newsletter por Resend.
 *
 * La lista de destinatarios todavía no existe en este repo: F22 la entrega
 * detrás de `NewsletterList`. Acá solo se consume la interfaz, se envía en
 * lotes y cada correo lleva su enlace de baja y las cabeceras
 * `List-Unsubscribe` / `List-Unsubscribe-Post`.
 *
 * Sin remitente configurado, con el flag apagado o sin enlace de baja no se
 * envía nada. Nunca se registran direcciones de correo en los errores.
 */

import { isChannelEnabled } from "./flags";
import type { Draft, Publisher } from "./types";

const DEFAULT_BATCH_SIZE = 20;
const MAX_BATCH_SIZE = 100;
const MIN_BATCH_SIZE = 1;
const DEFAULT_SUBJECT = "fraccion.si — novedades";

/** Datos mínimos de una suscripción. El enlace lo genera F22. */
export interface NewsletterRecipient {
  email: string;
  unsubscribeUrl: string;
}

/** Contrato que implementará F22. */
export interface NewsletterList {
  recipients(): Promise<readonly NewsletterRecipient[]>;
}

export interface ResendEmailMessage {
  from: string;
  to: string;
  subject: string;
  html: string;
  headers?: Record<string, string>;
}

/**
 * Parte de `Resend` que usamos. Se declara estructuralmente para poder
 * inyectar un doble en los tests sin cargar el SDK.
 */
export interface ResendClient {
  emails: {
    send(message: ResendEmailMessage): Promise<{
      data?: { id?: string | null } | null;
      error?: { message?: string } | null;
    }>;
  };
}

export interface NewsletterOptions {
  /** Correos enviados en paralelo por tanda. Entre 1 y 100. */
  batchSize?: number;
  /** Asunto cuando el borrador no trae `payload.subject`. */
  defaultSubject?: string;
}

export function escapeNewsletterHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Cuerpo de texto plano → HTML sobrio, filetes de 1px y sin sombras. */
export function renderNewsletterHtml(body: string, unsubscribeUrl: string): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${escapeNewsletterHtml(
          paragraph,
        ).replace(/\n/g, "<br />")}</p>`,
    )
    .join("\n      ");

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>fraccion.si</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;color:#0a0a0a;font-family:'Instrument Sans',Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
    <p style="margin:0 0 24px;padding-bottom:16px;border-bottom:1px solid #e6e6e6;font-size:12px;letter-spacing:.08em;text-transform:uppercase;">fraccion.si</p>
      ${paragraphs}
    <p style="margin:32px 0 0;padding-top:20px;border-top:1px solid #e6e6e6;font-size:11px;line-height:1.6;color:#6b6b6b;">
      Información pública con fines informativos. No constituye asesoría de inversión.
      <a href="${escapeNewsletterHtml(unsubscribeUrl)}" style="color:#0a0a0a;text-decoration:underline;">Dejar de recibir este newsletter</a>
    </p>
  </div>
</body>
</html>`;
}

function senderFromEnv(): string {
  const from = process.env.NEWSLETTER_FROM?.trim() || process.env.EMAIL_FROM?.trim();
  if (!from) throw new Error("Faltan NEWSLETTER_FROM y EMAIL_FROM.");
  return from;
}

function subjectFor(draft: Draft, fallback: string): string {
  const value = draft.payload?.subject;
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return fallback;
}

function batchSizeFor(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_BATCH_SIZE;
  return Math.min(MAX_BATCH_SIZE, Math.max(MIN_BATCH_SIZE, Math.floor(value)));
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function assertRecipient(recipient: NewsletterRecipient): void {
  if (typeof recipient.email !== "string" || !recipient.email.includes("@")) {
    throw new Error("La lista trae un destinatario inválido.");
  }
  const url = recipient.unsubscribeUrl;
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
    throw new Error("Cada destinatario necesita un enlace de baja válido.");
  }
}

/**
 * Crea el `Publisher` del newsletter. `list` es la pieza que F22 conectará a
 * Supabase; acá no se consulta nada.
 */
export function newsletterPublisher(
  resend: ResendClient,
  list: NewsletterList,
  options: NewsletterOptions = {},
): Publisher {
  const batchSize = batchSizeFor(options.batchSize);
  const defaultSubject = options.defaultSubject ?? DEFAULT_SUBJECT;

  return {
    channel: "newsletter",

    validate(body: string): void {
      if (body.trim().length === 0) throw new Error("El texto está vacío.");
    },

    async send(draft: Draft): Promise<{ externalId: string }> {
      if (!isChannelEnabled("newsletter")) {
        throw new Error("El canal newsletter está apagado.");
      }
      const from = senderFromEnv();
      const subject = subjectFor(draft, defaultSubject);
      const recipients = await list.recipients();

      if (recipients.length === 0) {
        throw new Error("La lista de suscriptores está vacía.");
      }
      for (const recipient of recipients) assertRecipient(recipient);

      const ids: string[] = [];
      for (const batch of chunks(recipients, batchSize)) {
        const sent = await Promise.all(
          batch.map(async (recipient) => {
            const response = await resend.emails.send({
              from,
              to: recipient.email,
              subject,
              html: renderNewsletterHtml(draft.body, recipient.unsubscribeUrl),
              headers: {
                "List-Unsubscribe": `<${recipient.unsubscribeUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              },
            });

            if (response.error) {
              throw new Error(response.error.message || "Resend rechazó el correo.");
            }
            const id = response.data?.id;
            if (typeof id !== "string" || id.length === 0) {
              throw new Error("Resend no devolvió el identificador del correo.");
            }
            return id;
          }),
        );
        ids.push(...sent);
      }

      if (ids.length === 1) return { externalId: ids[0] };
      return { externalId: `batch:${ids.length}:${ids[0]}` };
    },
  };
}
