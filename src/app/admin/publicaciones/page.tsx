import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import { SiteHeader } from "@/components/site-header";
import { isChannelEnabled, publishMode } from "@/lib/publish/flags";
import type { Channel, Draft, DraftStatus } from "@/lib/publish/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { DraftForms } from "./draft-forms";

export const metadata: Metadata = {
  title: "Publicaciones",
  robots: { index: false, follow: false },
};

// Lee la sesión y los borradores por request; nunca se prerenderiza.
export const instant = false;

const CHANNEL_LABEL: Record<Channel, string> = {
  x: "X",
  telegram: "Telegram",
  newsletter: "Correo newsletter",
};

const STATUS_LABEL: Record<DraftStatus, string> = {
  draft: "Pendientes",
  approved: "Aprobados",
  rejected: "Rechazados",
  sent: "Enviados",
  failed: "Con error",
};

const STATUS_ORDER: readonly DraftStatus[] = [
  "draft",
  "approved",
  "rejected",
  "failed",
  "sent",
];

function flagLabel(channel: Channel): string {
  return isChannelEnabled(channel)
    ? `${CHANNEL_LABEL[channel]}: ENCENDIDO`
    : `${CHANNEL_LABEL[channel]}: APAGADO`;
}

function subjectOf(draft: Draft): string {
  const subject = draft.payload?.subject;
  if (typeof subject === "string" && subject.trim().length > 0) {
    return subject.trim();
  }
  return "fraccion.si — novedades";
}

function DraftPreview({ draft }: { draft: Draft }) {
  if (draft.channel === "x") {
    return (
      <div className="border border-ink-200 bg-white p-4">
        <p className="text-xs uppercase tracking-[0.08em] text-ink-500">
          Tarjeta X
        </p>
        <div className="mt-3 flex gap-3">
          <div className="size-9 shrink-0 rounded-full bg-ink-900" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-900">
              fraccion.si <span className="font-normal text-ink-500">@reclu_cl</span>
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-900">
              {draft.body}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (draft.channel === "telegram") {
    return (
      <div className="border border-ink-200 bg-white p-4">
        <p className="text-xs uppercase tracking-[0.08em] text-ink-500">
          Mensaje Telegram
        </p>
        <div className="mt-3 max-w-xl border border-ink-200 bg-ink-50 p-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-900">
            {draft.body}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-ink-200 bg-white p-4">
      <p className="text-xs uppercase tracking-[0.08em] text-ink-500">
        Correo newsletter
      </p>
      <div className="mt-3 max-w-xl border border-ink-200">
        <div className="border-b border-ink-200 p-3">
          <p className="text-xs text-ink-500">Asunto</p>
          <p className="text-sm font-medium text-ink-900">{subjectOf(draft)}</p>
        </div>
        <div className="p-3">
          <p className="text-xs uppercase tracking-[0.08em] text-ink-500">
            fraccion.si
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-900">
            {draft.body}
          </p>
          <p className="mt-3 border-t border-ink-200 pt-2 text-[11px] leading-relaxed text-ink-500">
            Información pública con fines informativos. No constituye asesoría de
            inversión. Dejar de recibir este newsletter.
          </p>
        </div>
      </div>
    </div>
  );
}

function DraftCard({ draft }: { draft: Draft }) {
  return (
    <article className="border border-ink-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-2 p-4">
        <div>
          <p className="text-xs uppercase tracking-[0.08em] text-ink-500">
            {CHANNEL_LABEL[draft.channel]}
          </p>
          <p className="mt-1 font-mono text-xs text-ink-500">{draft.id}</p>
        </div>
        <div className="text-right text-xs text-ink-500">
          <p>{new Date(draft.created_at).toLocaleString("es-CL")}</p>
          {draft.external_id && <p>ID externo: {draft.external_id}</p>}
          {draft.error && <p className="mt-1 text-ink-900">Error: {draft.error}</p>}
        </div>
      </div>

      <div className="px-4 pb-4">
        <DraftPreview draft={draft} />
        {draft.preview_url && (
          <Link
            href={draft.preview_url}
            className="mt-2 inline-block text-xs text-ink-500 underline underline-offset-2 hover:text-ink-900"
          >
            Ver enlace del borrador
          </Link>
        )}
      </div>

      <DraftForms
        draft={{
          id: draft.id,
          channel: draft.channel,
          body: draft.body,
          status: draft.status,
        }}
      />
    </article>
  );
}

export default async function PublicacionesPage() {
  await connection();
  await requireAdmin();

  const supabase = createAdminClient();

  let drafts: Draft[] = [];
  let loadError: string | null = null;

  if (!supabase) {
    loadError =
      "Supabase no está configurado. Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.";
  } else {
    const { data, error } = await supabase
      .from("publish_drafts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      loadError = `No se pudieron leer los borradores: ${error.message}`;
    } else {
      drafts = (data ?? []) as Draft[];
    }
  }

  const grouped = new Map<DraftStatus, Draft[]>(
    STATUS_ORDER.map((status) => [status, []]),
  );
  for (const draft of drafts) {
    grouped.get(draft.status)?.push(draft);
  }

  const mode = publishMode();

  return (
    <>
      <SiteHeader />
      <main id="main" className="container-page flex-1 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink-200 pb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-ink-500">
              Administración
            </p>
            <h1 className="mt-2 text-3xl font-medium tracking-tight text-ink-900">
              Publicaciones
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-500">
              Revisa los borradores generados desde alertas públicas. Aprobar no
              envía: el envío exige además el modo live y el flag del canal.
            </p>
          </div>
          <dl className="flex flex-wrap gap-3 text-xs">
            <div className="border border-ink-200 px-3 py-2">
              <dt className="uppercase tracking-[0.08em] text-ink-500">Modo</dt>
              <dd className="mt-1 font-medium text-ink-900">{mode}</dd>
            </div>
            {(["x", "telegram", "newsletter"] as const).map((channel) => (
              <div key={channel} className="border border-ink-200 px-3 py-2">
                <dt className="uppercase tracking-[0.08em] text-ink-500">
                  Canal
                </dt>
                <dd className="mt-1 font-medium text-ink-900">
                  {flagLabel(channel)}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {loadError && (
          <p role="alert" className="mt-6 border border-ink-200 p-4 text-sm text-ink-900">
            {loadError}
          </p>
        )}

        {!loadError && drafts.length === 0 && (
          <p className="mt-6 text-sm text-ink-500">
            No hay borradores todavía. Se generan desde{" "}
            <span className="font-mono text-xs">POST /api/publish/draft</span>.
          </p>
        )}

        <div className="mt-10 flex flex-col gap-12">
          {STATUS_ORDER.map((status) => {
            const items = grouped.get(status) ?? [];
            if (items.length === 0) return null;
            return (
              <section key={status} aria-labelledby={`status-${status}`}>
                <div className="flex items-baseline justify-between gap-3 border-b border-ink-200 pb-2">
                  <h2
                    id={`status-${status}`}
                    className="text-lg font-medium text-ink-900"
                  >
                    {STATUS_LABEL[status]}
                  </h2>
                  <span className="text-xs text-ink-500">{items.length}</span>
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  {items.map((draft) => (
                    <DraftCard key={draft.id} draft={draft} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </>
  );
}
