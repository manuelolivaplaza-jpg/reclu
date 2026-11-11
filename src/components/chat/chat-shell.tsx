"use client";

/**
 * ChatShell: chat IA del panel (D52). Mobile-first: historial en un cajón,
 * composer anclado abajo, tarjetas en carrusel horizontal en el celular.
 * Estética editorial: blanco, negro, filetes de 1px, sin sombras.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowUpRight, PanelLeft, Paperclip, Plus, X } from "lucide-react";
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

  useEffect(() => {
    if (!drawer) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawer(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawer]);

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
      { id: uid(), role: "user", content: "Captura de mi portafolio para agregar" },
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
    <nav aria-label="Conversaciones" className="flex h-full w-full flex-col border-ink-200 bg-ink-50/40 md:w-64 md:shrink-0 md:border-r">
      <div className="p-3">
        <button
          type="button"
          onClick={newChat}
          className="flex h-10 w-full items-center justify-center gap-1.5 rounded-full bg-ink-900 px-4 text-sm font-medium text-white transition-colors hover:bg-black"
        >
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Nueva consulta
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <p className="px-2 pb-1.5 pt-2 text-[11px] font-medium uppercase tracking-[0.16em] text-ink-400">Recientes</p>
        {conversations.length ? (
          <ul className="space-y-1">
            {conversations.map((c) => {
              const active = c.id === conversationId;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => void openConversation(c.id)}
                    aria-current={active ? "true" : undefined}
                    className={`block w-full truncate border px-2.5 py-2 text-left text-[13px] transition-colors ${
                      active
                        ? "border-ink-200 bg-white font-medium text-ink-900"
                        : "border-transparent text-ink-500 hover:bg-white/70 hover:text-ink-900"
                    }`}
                  >
                    {c.title}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-2 py-6 text-xs leading-relaxed text-ink-400">
            Aún no tienes consultas guardadas. Empieza con una pregunta sobre una cartera pública.
          </p>
        )}
      </div>
    </nav>
  );

  return (
    <div className="flex h-[calc(100dvh-var(--app-topbar-h)-var(--app-tabbar-h)-1.75rem)] min-h-0 overflow-hidden border border-ink-200 bg-white text-ink-900 lg:h-[calc(100dvh-var(--app-topbar-h)-5.25rem)]">
      <aside className="hidden md:block">{history}</aside>

      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Historial de conversaciones">
          <button
            type="button"
            aria-label="Cerrar historial"
            className="absolute inset-0 bg-ink-900/25"
            onClick={() => setDrawer(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-64 max-w-[85vw] flex-col border-r border-ink-200 bg-ink-50">
            <div className="flex items-center justify-between border-b border-ink-200 px-3 py-2">
              <span className="text-[13px] font-medium text-ink-900">Historial</span>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setDrawer(false)}
                className="grid h-10 w-10 place-items-center rounded-full text-ink-500 transition-colors hover:bg-white hover:text-ink-900"
              >
                <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 flex-1">{history}</div>
          </div>
        </div>
      )}

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-2.5 border-b border-ink-200 bg-white px-3 py-2.5 md:px-5">
          <button
            type="button"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-900 md:hidden"
            aria-label="Abrir historial"
            onClick={() => setDrawer(true)}
          >
            <PanelLeft className="h-[18px] w-[18px]" strokeWidth={1.5} aria-hidden="true" />
          </button>
          <span
            aria-hidden="true"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink-900 text-[13px] font-medium text-white"
          >
            F
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-medium leading-tight tracking-tight text-ink-900">Fraccion IA</h1>
            <p className="truncate text-[11px] leading-tight text-ink-500">Consulta carteras públicas · sin asesoría de inversión</p>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={newChat}
              className="ml-auto inline-flex h-9 shrink-0 items-center rounded-full border border-ink-200 px-3.5 text-xs font-medium text-ink-700 transition-colors hover:border-ink-900 hover:text-ink-900 md:hidden"
            >
              Nueva
            </button>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 md:px-8" role="log" aria-live="polite">
          <div className="mx-auto flex max-w-3xl flex-col gap-6">
            {messages.length === 0 && (
              <div className="pt-6 md:pt-14">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-400">Asistente de carteras</p>
                <h2 className="mt-3 max-w-2xl text-[26px] font-medium leading-[1.15] tracking-tight text-ink-900 md:text-4xl">
                  Hola{firstName ? `, ${firstName}` : ""}. ¿Qué cartera quieres revisar?
                </h2>
                <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-500">
                  Pregunta por rendimientos, compara portafolios o sube una captura de tu corredora para agregarla a Mi portafolio. Respondo
                  solo con información pública y no entrego asesoría de inversión.
                </p>
                <div className="mt-7 grid gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="group flex items-start justify-between gap-3 border border-ink-200 bg-white p-3.5 text-left transition-colors hover:border-ink-900"
                    >
                      <span className="text-sm leading-snug text-ink-700 transition-colors group-hover:text-ink-900">{s}</span>
                      <ArrowUpRight
                        className="mt-0.5 h-4 w-4 shrink-0 text-ink-400 transition-colors group-hover:text-ink-900"
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) =>
              m.role === "user" ? (
                <div
                  key={m.id}
                  className="ml-auto max-w-[85%] whitespace-pre-wrap break-words bg-ink-900 px-4 py-2.5 text-[15px] leading-relaxed text-white"
                >
                  {m.content}
                </div>
              ) : (
                <div key={m.id} className="flex flex-col gap-3">
                  {m.pending && !m.content ? (
                    <div className="flex items-center gap-1.5 py-2" aria-label="Escribiendo" role="status">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="h-1 w-1 animate-pulse rounded-full bg-ink-400"
                          style={{ animationDelay: `${i * 160}ms` }}
                        />
                      ))}
                    </div>
                  ) : (
                    <p
                      className={`max-w-none whitespace-pre-wrap break-words text-[15px] leading-relaxed ${
                        m.error ? "text-negative" : "text-ink-900"
                      }`}
                    >
                      {m.content}
                    </p>
                  )}
                  {m.cards && <PortfolioCardRail cards={m.cards} />}
                  {m.proposal && <HoldingsProposalCard proposal={m.proposal} />}
                  {!m.pending && !m.error && m.content && <p className="text-[11px] leading-snug text-ink-400">{AI_DISCLAIMER}</p>}
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
          className="shrink-0 border-t border-ink-200 bg-white px-3 pb-3 pt-3 md:px-5"
        >
          {notice && <p className="mx-auto mb-2 max-w-3xl text-xs text-negative">{notice}</p>}
          <div className="mx-auto max-w-3xl">
            <div className="flex items-end gap-1.5 border border-ink-200 bg-white p-1.5 transition-colors focus-within:border-ink-900">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onImage(e.target.files[0])}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                aria-label="Adjuntar captura de portafolio"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900 disabled:opacity-35"
              >
                <Paperclip className="h-[18px] w-[18px]" strokeWidth={1.5} aria-hidden="true" />
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
                aria-label="Mensaje para Fraccion IA"
                className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-1 py-2.5 text-[15px] leading-relaxed text-ink-900 outline-none placeholder:text-ink-400"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                aria-label="Enviar mensaje"
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-ink-900 px-4 text-sm font-medium text-white transition-colors hover:bg-black disabled:opacity-35"
              >
                <span className="hidden sm:inline">Enviar</span>
                <ArrowUp className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
            <p className="mt-2 hidden text-[11px] leading-snug text-ink-400 sm:block">
              Enter envía · Shift + Enter agrega un salto de línea
            </p>
          </div>
        </form>
      </section>
    </div>
  );
}
