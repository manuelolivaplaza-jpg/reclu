"use client";

/**
 * ChatShell — chat IA del panel (D52). Mobile-first: historial en un cajón,
 * composer fijo abajo, tarjetas en carrusel horizontal en el celular.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AI_DISCLAIMER } from "@/lib/ai-disclaimer";
import type { HoldingsProposal, PortfolioCardData } from "@/lib/chat-ia/tools";
import { toProposal } from "@/lib/chat-ia/tools";
import { toWeightRows, type DetectedPosition } from "@/lib/portfolio-image-rows";
import { PortfolioCardRail } from "@/components/chat/portfolio-card-widget";
import { HoldingsProposalCard } from "@/components/chat/holdings-proposal-card";

interface UiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  cards?: PortfolioCardData[];
  proposal?: HoldingsProposal | null;
  pending?: boolean;
  error?: boolean;
}

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

const SUGGESTIONS = [
  "¿Cuál es el portafolio con mayor rendimiento en un año?",
  "Muéstrame el portafolio de Nancy Pelosi",
  "Compara Berkshire Hathaway con ARK Innovation",
  "¿Qué fondos 13F tienen más peso en Nvidia?",
  "Resume mi portafolio",
];

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

const uid = () => Math.random().toString(36).slice(2);

export function detectedToProposal(positions: DetectedPosition[]): HoldingsProposal {
  if (positions.every((p) => p.quantity !== null && p.quantity > 0)) {
    return toProposal(positions.map((p) => ({ symbol: p.symbol, quantity: p.quantity as number })));
  }
  return toProposal(toWeightRows(positions).map((r) => ({ symbol: r.symbol, weight: r.weight })));
}

export function ChatShell({ firstName }: { firstName?: string | null }) {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [drawer, setDrawer] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refreshConversations = useCallback(async () => {
    const res = await fetch("/api/chat/ia/conversations", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setConversations(((await res.json()) as { conversations: Conversation[] }).conversations ?? []);
  }, []);

  useEffect(() => {
    void refreshConversations();
  }, [refreshConversations]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const patchLast = (fn: (m: UiMessage) => UiMessage) =>
    setMessages((prev) => (prev.length ? [...prev.slice(0, -1), fn(prev[prev.length - 1])] : prev));

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    setNotice(null);
    setInput("");
    const history = [...messages.filter((m) => !m.pending && !m.error && m.content), { id: uid(), role: "user" as const, content }];
    setMessages([...history, { id: uid(), role: "assistant", content: "", pending: true }]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.slice(-20).map((m) => ({ role: m.role, content: m.content.slice(0, 2000) })),
          ...(conversationId ? { conversationId } : {}),
        }),
      });
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        patchLast((m) => ({ ...m, pending: false, error: true, content: err.error ?? "No pudimos responder. Intenta de nuevo." }));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const payload = t.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          let evt: {
            choices?: Array<{ delta?: { content?: string } }>;
            reclu?: { type: string; text?: string; conversationId?: string | null; cards?: PortfolioCardData[]; proposal?: HoldingsProposal };
          };
          try {
            evt = JSON.parse(payload);
          } catch {
            continue;
          }
          const delta = evt.choices?.[0]?.delta?.content;
          if (delta) patchLast((m) => ({ ...m, pending: false, content: m.content + delta }));
          const r = evt.reclu;
          if (!r) continue;
          if (r.type === "meta" && r.conversationId) setConversationId(r.conversationId);
          if (r.type === "cards" && r.cards) patchLast((m) => ({ ...m, cards: r.cards }));
          if (r.type === "proposal" && r.proposal) patchLast((m) => ({ ...m, proposal: r.proposal }));
          if (r.type === "replacement" && r.text) patchLast((m) => ({ ...m, pending: false, content: r.text ?? "" }));
        }
      }
      patchLast((m) => ({ ...m, pending: false }));
      void refreshConversations();
    } catch {
      patchLast((m) => ({ ...m, pending: false, error: true, content: "Se cortó la conexión. Intenta de nuevo." }));
    } finally {
      setBusy(false);
    }
  }

  async function onImage(file: File) {
    if (!IMAGE_TYPES.includes(file.type)) return setNotice("Sube una imagen PNG, JPG o WebP.");
    if (file.size > MAX_IMAGE_BYTES) return setNotice("La imagen supera 4 MB.");
    setNotice(null);
    setBusy(true);
    setMessages((prev) => [
      ...prev,
      { id: uid(), role: "user", content: "📎 Captura de mi portafolio para agregar" },
      { id: uid(), role: "assistant", content: "", pending: true },
    ]);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/holdings/image", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { positions?: DetectedPosition[]; error?: string; discarded?: number };
      if (!res.ok || !data.positions?.length) {
        patchLast((m) => ({ ...m, pending: false, error: true, content: data.error ?? "No pudimos leer la captura." }));
        return;
      }
      const proposal = detectedToProposal(data.positions);
      patchLast((m) => ({
        ...m,
        pending: false,
        content: `Leí ${proposal.rows.length} posiciones en tu captura${data.discarded ? ` (descarté ${data.discarded} filas que no pude validar)` : ""}. Revísalas y confirma para agregarlas. La imagen no se guardó.`,
        proposal,
      }));
    } catch {
      patchLast((m) => ({ ...m, pending: false, error: true, content: "No pudimos subir la captura." }));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function openConversation(id: string) {
    setDrawer(false);
    const res = await fetch(`/api/chat/ia/conversations?id=${encodeURIComponent(id)}`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const { messages: rows } = (await res.json()) as {
      messages: Array<{ role: "user" | "assistant"; content: string; meta?: { cards?: PortfolioCardData[] } | null }>;
    };
    setConversationId(id);
    // Las propuestas antiguas no se reabren: confirmar exige una propuesta nueva.
    setMessages(rows.map((r) => ({ id: uid(), role: r.role, content: r.content, cards: r.meta?.cards ?? undefined })));
  }

  function newChat() {
    setDrawer(false);
    setConversationId(undefined);
    setMessages([]);
  }

  const history = (
    <nav aria-label="Conversaciones" className="flex h-full flex-col gap-1 p-3">
      <button type="button" onClick={newChat} className="mb-2 rounded-xl bg-white/10 px-3 py-2 text-left text-sm font-medium text-white hover:bg-white/15">
        + Nueva conversación
      </button>
      <div className="flex-1 space-y-0.5 overflow-y-auto">
        {conversations.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => openConversation(c.id)}
            className={`block w-full truncate rounded-lg px-3 py-2 text-left text-sm ${c.id === conversationId ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white"}`}
          >
            {c.title}
          </button>
        ))}
        {!conversations.length && <p className="px-3 text-xs text-zinc-500">Tus conversaciones aparecerán aquí.</p>}
      </div>
    </nav>
  );

  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-0 overflow-hidden rounded-none bg-zinc-950 text-zinc-100 md:h-[calc(100dvh-6rem)] md:rounded-3xl md:border md:border-white/10">
      <aside className="hidden w-64 shrink-0 border-r border-white/10 md:block">{history}</aside>
      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-72 bg-zinc-950">{history}</div>
        </div>
      )}

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <button type="button" className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 md:hidden" aria-label="Historial" onClick={() => setDrawer(true)}>
            ☰
          </button>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-sky-500 text-xs font-bold text-black">R</span>
          <div>
            <h1 className="text-sm font-semibold">Fraccion IA</h1>
            <p className="text-[11px] text-zinc-500">Datos públicos de portafolios · no es asesoría</p>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-5">
            {messages.length === 0 && (
              <div className="pt-6 md:pt-16">
                <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
                  Hola{firstName ? `, ${firstName}` : ""}. ¿Qué quieres saber?
                </h2>
                <p className="mt-2 text-sm text-zinc-400">
                  Pregunta por rendimientos, compara portafolios o sube una captura de tu corredora para agregarla a Mi portafolio.
                </p>
                <div className="mt-6 grid gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" onClick={() => send(s)} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-sm text-zinc-200 transition hover:border-emerald-400/40 hover:bg-white/[0.06]">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-emerald-500/15 px-4 py-2.5 text-sm text-white">
                  {m.content}
                </div>
              ) : (
                <div key={m.id} className="flex flex-col gap-3">
                  {m.pending && !m.content ? (
                    <div className="flex gap-1 py-2" aria-label="Escribiendo">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="h-2 w-2 animate-pulse rounded-full bg-zinc-500" style={{ animationDelay: `${i * 150}ms` }} />
                      ))}
                    </div>
                  ) : (
                    <p className={`whitespace-pre-wrap text-[15px] leading-relaxed ${m.error ? "text-red-300" : "text-zinc-100"}`}>{m.content}</p>
                  )}
                  {m.cards && <PortfolioCardRail cards={m.cards} />}
                  {m.proposal && <HoldingsProposalCard proposal={m.proposal} />}
                  {!m.pending && !m.error && m.content && <p className="text-[11px] leading-snug text-zinc-500">{AI_DISCLAIMER}</p>}
                </div>
              ),
            )}
            <div ref={endRef} />
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="border-t border-white/10 bg-zinc-950/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur"
        >
          {notice && <p className="mx-auto mb-2 max-w-3xl text-xs text-amber-300">{notice}</p>}
          <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-2 focus-within:border-emerald-400/50">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && onImage(e.target.files[0])} />
            <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} aria-label="Subir captura de portafolio" className="rounded-xl p-2 text-zinc-400 hover:bg-white/5 hover:text-white disabled:opacity-40">
              📎
            </button>
            <textarea
              value={input}
              maxLength={2000}
              rows={1}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              placeholder="Pregúntale a Fraccion…"
              className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-1 py-2 text-[15px] text-white outline-none placeholder:text-zinc-500"
            />
            <button type="submit" disabled={busy || !input.trim()} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-40">
              Enviar
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
