"use client";

/**
 * ChatShell: chat con IA del panel.
 *
 * Una sola zona con scroll (el hilo). La altura se calcula con las variables
 * del armazón (`--app-topbar-h`, `--app-tabbar-h`) y el padding real de
 * `main`, para que la página no gane un segundo scroll. El composer queda
 * pegado al borde inferior del panel: sobre el teclado en móvil.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, PanelLeft, Paperclip, X } from "lucide-react";
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
  /** Una respuesta de red se puede reintentar; un archivo ilegible, no. */
  retryable?: boolean;
}

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

/** Consultas que el asistente puede resolver con sus herramientas reales. */
const SUGGESTIONS = [
  "¿Qué carteras rinden más en el último año?",
  "Muéstrame el 13F de Berkshire Hathaway",
  "Compara el Pelosi Tracker con el S&P 500 Top 10",
];

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

const uid = () => Math.random().toString(36).slice(2);

export function detectedToProposal(positions: DetectedPosition[]): HoldingsProposal {
  if (positions.every((p) => p.quantity !== null && p.quantity > 0)) {
    return toProposal(
      positions.map((p) => ({ symbol: p.symbol, quantity: p.quantity as number })),
    );
  }
  return toProposal(toWeightRows(positions).map((r) => ({ symbol: r.symbol, weight: r.weight })));
}

export function ChatShell({ firstName }: { firstName?: string | null }) {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [historyState, setHistoryState] = useState<"loading" | "ready" | "error">("loading");
  const [drawer, setDrawer] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [live, setLive] = useState("");

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeDrawerRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const stickRef = useRef(true);
  /** Identifica la ejecución vigente: una respuesta abortada no toca su estado. */
  const runIdRef = useRef(0);

  const refreshConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/ia/conversations", { cache: "no-store" });
      if (!res.ok) throw new Error("No se pudo leer el historial.");
      const data = (await res.json()) as { conversations?: Conversation[] };
      setConversations(data.conversations ?? []);
      setHistoryState("ready");
    } catch {
      // Si ya había una lista en pantalla, se conserva: un fallo al refrescar
      // no debe borrar el historial que la persona está usando.
      setHistoryState((prev) => (prev === "ready" ? "ready" : "error"));
    }
  }, []);

  // Reintento explícito: el estado "loading" se activa desde un evento, no
  // dentro del efecto de montaje (ahí el estado inicial ya es "loading").
  const retryConversations = useCallback(() => {
    setHistoryState("loading");
    void refreshConversations();
  }, [refreshConversations]);

  // Carga inicial del historial: un fetch async, sin cascada de renders.
  // La regla no distingue el setState posterior al await; se documenta y exime.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshConversations();
  }, [refreshConversations]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Autoajuste del textarea: crece hasta 160px y luego hace scroll interno.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  // Solo se sigue el hilo si la persona ya estaba abajo. Durante el stream se
  // salta sin animación para no encolar decenas de scrolls suaves.
  useEffect(() => {
    if (!stickRef.current) return;
    const el = listRef.current;
    if (!el) return;
    const last = messages[messages.length - 1];
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: !last?.pending && !reduce ? "smooth" : "auto",
    });
  }, [messages]);

  // Si el composer crece (o el teclado cambia el alto), el fondo del hilo se
  // mantiene pegado abajo mientras la persona siga abajo.
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (stickRef.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawer(false);
    menuButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!drawer) return;
    closeDrawerRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer();
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusables = drawerRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawer, closeDrawer]);

  const patchLast = useCallback((fn: (message: UiMessage) => UiMessage) => {
    setMessages((prev) =>
      prev.length ? [...prev.slice(0, -1), fn(prev[prev.length - 1])] : prev,
    );
  }, []);

  async function run(thread: UiMessage[]) {
    if (busyRef.current) return;
    busyRef.current = true;
    const runId = ++runIdRef.current;
    setBusy(true);
    setNotice(null);
    stickRef.current = true;
    setMessages([...thread, { id: uid(), role: "assistant", content: "", pending: true }]);
    setLive("Consulta enviada. Fraccion está respondiendo.");

    const controller = new AbortController();
    abortRef.current = controller;
    let produced = false;
    let answer = "";

    try {
      const res = await fetch("/api/chat/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: thread
            .slice(-20)
            .map((message) => ({ role: message.role, content: message.content.slice(0, 2000) })),
          ...(conversationId ? { conversationId } : {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const detail = (await res.json().catch(() => ({}))) as { error?: string };
        patchLast((message) => ({
          ...message,
          pending: false,
          error: true,
          retryable: true,
          content: detail.error ?? "No pudimos responder. Intenta de nuevo.",
        }));
        setLive("No se pudo completar la respuesta. Puedes reintentar.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (controller.signal.aborted) return;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;

          let event: {
            choices?: Array<{ delta?: { content?: string } }>;
            reclu?: {
              type: string;
              text?: string;
              conversationId?: string | null;
              cards?: PortfolioCardData[];
              proposal?: HoldingsProposal;
            };
          };
          try {
            event = JSON.parse(payload);
          } catch {
            continue;
          }

          const delta = event.choices?.[0]?.delta?.content;
          if (delta) {
            produced = true;
            answer += delta;
            patchLast((message) => ({ ...message, pending: false, content: message.content + delta }));
          }

          const extra = event.reclu;
          if (!extra) continue;
          if (extra.type === "meta" && extra.conversationId) setConversationId(extra.conversationId);
          if (extra.type === "cards" && extra.cards?.length) {
            produced = true;
            patchLast((message) => ({ ...message, cards: extra.cards }));
          }
          if (extra.type === "proposal" && extra.proposal) {
            produced = true;
            patchLast((message) => ({ ...message, proposal: extra.proposal }));
          }
          if (extra.type === "replacement" && typeof extra.text === "string") {
            produced = true;
            answer = extra.text;
            patchLast((message) => ({ ...message, pending: false, content: extra.text ?? "" }));
          }
        }
      }

      patchLast((message) => {
        if (produced || message.cards?.length || message.proposal) {
          return { ...message, pending: false };
        }
        return {
          ...message,
          pending: false,
          error: true,
          retryable: true,
          content: "La respuesta llegó vacía. Vuelve a intentarlo.",
        };
      });
      const cleanAnswer = answer.trim();
      setLive(
        produced
          ? cleanAnswer
            ? `Respuesta lista: ${cleanAnswer.slice(0, 180)}${cleanAnswer.length > 180 ? "…" : ""}`
            : "Respuesta lista."
          : "La respuesta llegó vacía. Puedes reintentar.",
      );
      void refreshConversations();
    } catch {
      if (controller.signal.aborted) return;
      patchLast((message) => ({
        ...message,
        pending: false,
        error: true,
        retryable: true,
        content: "Se cortó la conexión con el servidor. Revisa tu red y reintenta.",
      }));
      setLive("Se cortó la conexión. Puedes reintentar.");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (runIdRef.current !== runId) return;
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || busyRef.current) return;

    const thread: UiMessage[] = [
      ...messages.filter(
        (message) => !message.pending && !message.error && message.content.trim().length > 0,
      ),
      { id: uid(), role: "user", content },
    ];

    setInput("");
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
    await run(thread);
  }

  function retry() {
    if (busyRef.current) return;
    const lastUser = [...messages].reverse().find((message) => message.role === "user");
    if (!lastUser) return;
    const cut = messages.indexOf(lastUser);
    const thread = messages
      .slice(0, cut + 1)
      .filter((message) => !message.pending && !message.error && message.content.trim().length > 0);
    void run(thread);
  }

  async function onImage(file: File) {
    if (busyRef.current) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      setNotice("Sube una imagen PNG, JPG o WebP.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setNotice("La imagen supera 4 MB. Sube una captura más liviana.");
      return;
    }

    setNotice(null);
    busyRef.current = true;
    const runId = ++runIdRef.current;
    setBusy(true);
    stickRef.current = true;
    setLive("Leyendo la captura. Esto puede tardar unos segundos.");
    setMessages((prev) => [
      ...prev.filter((message) => !message.pending),
      { id: uid(), role: "user", content: "Captura de mi portafolio para revisar" },
      { id: uid(), role: "assistant", content: "", pending: true },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/holdings/image", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => ({}))) as {
        positions?: DetectedPosition[];
        error?: string;
        discarded?: number;
      };

      if (controller.signal.aborted) return;
      const positions = data.positions ?? [];
      if (!res.ok || !positions.length) {
        patchLast((message) => ({
          ...message,
          pending: false,
          error: true,
          retryable: false,
          content: data.error ?? "No pudimos leer la captura. Revisa que se vean los símbolos y las cantidades.",
        }));
        setLive("No pudimos leer la captura.");
        return;
      }

      const proposal = detectedToProposal(positions);
      patchLast((message) => ({
        ...message,
        pending: false,
        content: `Leí ${proposal.rows.length} ${proposal.rows.length === 1 ? "posición" : "posiciones"} en tu captura${data.discarded ? ` (descarté ${data.discarded} filas que no pude validar)` : ""}. Revísalas y confirma para guardarlas. La imagen no se guardó.`,
        proposal,
      }));
      setLive("Captura leída. Revisa la propuesta y confirma.");
    } catch {
      if (controller.signal.aborted) return;
      patchLast((message) => ({
        ...message,
        pending: false,
        error: true,
        retryable: false,
        content: "No pudimos subir la captura. Revisa tu conexión y vuelve a adjuntarla.",
      }));
      setLive("No pudimos subir la captura.");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (runIdRef.current === runId) {
        busyRef.current = false;
        setBusy(false);
      }
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function openConversation(id: string) {
    runIdRef.current += 1;
    abortRef.current?.abort();
    busyRef.current = false;
    setBusy(false);
    setDrawer(false);
    setNotice(null);

    try {
      const res = await fetch(`/api/chat/ia/conversations?id=${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("No se pudo abrir la consulta.");
      const data = (await res.json()) as {
        messages?: Array<{
          role: "user" | "assistant";
          content: string;
          meta?: { cards?: PortfolioCardData[] } | null;
        }>;
      };
      const rows = (data.messages ?? []).filter((row) => row.content.trim().length > 0);
      setConversationId(id);
      stickRef.current = true;
      setMessages(
        rows.map((row) => ({
          id: uid(),
          role: row.role,
          content: row.content,
          cards: row.meta?.cards ?? undefined,
        })),
      );
      setLive(
        `Consulta abierta con ${rows.length} ${rows.length === 1 ? "mensaje" : "mensajes"}.`,
      );
    } catch {
      setNotice("No pudimos abrir esa consulta. Intenta de nuevo.");
    } finally {
      requestAnimationFrame(() => listRef.current?.focus({ preventScroll: true }));
    }
  }

  function newChat() {
    runIdRef.current += 1;
    abortRef.current?.abort();
    busyRef.current = false;
    setBusy(false);
    setDrawer(false);
    setConversationId(undefined);
    setMessages([]);
    stickRef.current = true;
    setNotice(null);
    setLive("Consulta nueva.");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const history = (
    <nav
      aria-label="Conversaciones"
      className="flex h-full w-full flex-col border-app-border bg-app-card md:w-64 md:shrink-0 md:border-r"
    >
      <div className="border-b border-app-border p-3">
        <button
          type="button"
          onClick={newChat}
          className="flex h-10 w-full items-center justify-center rounded-full bg-ink-900 px-4 text-[13px] font-medium text-white transition-colors hover:bg-black"
        >
          Nueva consulta
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <p className="label-line px-2 pb-2 pt-3">Recientes</p>

        {historyState === "loading" ? (
          <p className="px-2 py-2 text-[13px] leading-snug text-ink-500">Cargando historial…</p>
        ) : historyState === "error" ? (
          <div className="px-2 py-2">
            <p className="text-[13px] leading-snug text-ink-500">No pudimos cargar tu historial.</p>
            <button
              type="button"
              onClick={retryConversations}
              className="mt-2 text-[13px] font-medium text-ink-900 underline underline-offset-4 transition-opacity hover:opacity-60"
            >
              Reintentar
            </button>
          </div>
        ) : conversations.length ? (
          <ul>
            {conversations.map((conversation) => {
              const active = conversation.id === conversationId;
              return (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => void openConversation(conversation.id)}
                    aria-current={active ? "true" : undefined}
                    title={conversation.title}
                    className={`block w-full truncate border-l-2 py-2 pl-2.5 pr-2 text-left text-[13px] leading-snug transition-colors ${
                      active
                        ? "border-ink-900 font-medium text-ink-900"
                        : "border-transparent text-ink-500 hover:text-ink-900"
                    }`}
                  >
                    {conversation.title}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-2 py-2 text-[13px] leading-relaxed text-ink-500">
            Aún no tienes consultas guardadas. Cada consulta queda aquí para que la retomes.
          </p>
        )}
      </div>
    </nav>
  );

  // La altura replica el esqueleto de `loading.tsx` (misma cuenta) para que no
  // haya salto al hidratar. El `-mb-3` devuelve los 8px que el panel ocupa de
  // más respecto del padding de `main`, y deja 4px de holgura: la página no
  // gana scroll propio y el composer queda justo sobre la tab bar.
  return (
    <div className="-mb-3 flex h-[calc(100dvh-var(--app-topbar-h)-var(--app-tabbar-h)-1.75rem)] min-h-0 overflow-hidden border border-app-border bg-app-card text-ink-900 lg:mb-0 lg:h-[calc(100dvh-var(--app-topbar-h)-5.25rem)]">
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {live}
      </div>

      <aside className="hidden md:block md:shrink-0">{history}</aside>

      {drawer ? (
        <div
          ref={drawerRef}
          id="chat-historial"
          role="dialog"
          aria-modal="true"
          aria-labelledby="chat-historial-title"
          className="fixed inset-0 z-50 md:hidden"
        >
          <button
            type="button"
            tabIndex={-1}
            aria-label="Cerrar el historial de conversaciones"
            onClick={closeDrawer}
            className="absolute inset-0 h-full w-full cursor-default bg-ink-900/30"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-app-border bg-app-card">
            <div className="flex items-center justify-between border-b border-app-border px-3 py-2">
              <h2 id="chat-historial-title" className="text-[13px] font-medium text-ink-900">
                Historial
              </h2>
              <button
                ref={closeDrawerRef}
                type="button"
                aria-label="Cerrar historial"
                onClick={closeDrawer}
                className="grid h-10 w-10 place-items-center text-ink-500 transition-colors hover:text-ink-900"
              >
                <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 flex-1">{history}</div>
          </div>
        </div>
      ) : null}

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-2 border-b border-app-border bg-app-card px-3 py-2.5 md:px-5">
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setDrawer(true)}
            aria-label="Abrir historial de conversaciones"
            aria-expanded={drawer}
            aria-controls={drawer ? "chat-historial" : undefined}
            className="grid h-10 w-10 shrink-0 place-items-center text-ink-500 transition-colors hover:text-ink-900 md:hidden"
          >
            <PanelLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-medium leading-tight tracking-[-0.01em] text-ink-900">
              Fraccion IA
            </h1>
            <p className="truncate text-[12px] leading-tight text-ink-500">
              Carteras públicas. Sin asesoría de inversión.
            </p>
          </div>

          {messages.length > 0 ? (
            <button
              type="button"
              onClick={newChat}
              aria-label="Empezar una consulta nueva"
              className="ml-1 inline-flex h-9 shrink-0 items-center px-2 text-[13px] text-ink-500 transition-colors hover:text-ink-900 md:hidden"
            >
              Nueva
            </button>
          ) : null}
        </header>

        <div
          ref={listRef}
          role="log"
          aria-label="Conversación"
          aria-live="off"
          tabIndex={0}
          onScroll={() => {
            const el = listRef.current;
            if (!el) return;
            stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
          }}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 focus-visible:outline-1 focus-visible:outline-offset-[-1px] focus-visible:outline-ink-900 md:px-8"
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-6">
            {messages.length === 0 ? (
              <div className="pt-4 md:pt-10">
                <p className="label-line">Asistente de carteras</p>
                <h2 className="mt-3 max-w-2xl text-[26px] font-medium leading-[1.12] tracking-[-0.03em] text-ink-900 md:text-[32px]">
                  Hola{firstName ? `, ${firstName}` : ""}. ¿Qué cartera quieres revisar?
                </h2>
                <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-500">
                  Respondo solo con información pública de Fraccion: rendimientos, posiciones
                  declaradas y comparaciones entre carteras. No entrego recomendaciones ni ejecuto
                  órdenes.
                </p>
                <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-ink-500">
                  También puedes adjuntar una captura de tu cartera con el botón de adjuntar: leo
                  las posiciones y te propongo una lista para revisar antes de guardar.
                </p>

                <div className="mt-7 grid gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => void send(suggestion)}
                      className="group flex min-h-11 w-full items-start justify-between gap-3 border border-app-border bg-app-card px-3.5 py-3 text-left transition-colors hover:border-ink-900"
                    >
                      <span className="text-[14px] leading-snug text-ink-700 transition-colors group-hover:text-ink-900">
                        {suggestion}
                      </span>
                      <span aria-hidden="true" className="text-ink-400 transition-colors group-hover:text-ink-900">
                        →
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {messages.map((message, index) => {
              const isLast = index === messages.length - 1;

              if (message.role === "user") {
                return (
                  <div
                    key={message.id}
                    className="ml-auto max-w-[85%] whitespace-pre-wrap break-words bg-ink-900 px-4 py-2.5 text-[15px] leading-relaxed text-white"
                  >
                    {message.content}
                  </div>
                );
              }

              return (
                <div key={message.id} className="flex flex-col gap-3">
                  {message.pending && !message.content ? (
                    <div className="flex items-center gap-1 py-2" aria-hidden="true">
                      {[0, 1, 2].map((dot) => (
                        <span
                          key={dot}
                          className="h-1 w-1 animate-pulse bg-ink-500"
                          style={{ animationDelay: `${dot * 160}ms` }}
                        />
                      ))}
                    </div>
                  ) : message.error ? (
                    <div className="border-l-2 border-ink-900 pl-3">
                      <p className="break-words text-[15px] leading-relaxed text-ink-900">
                        {message.content}
                      </p>
                      {isLast && message.retryable ? (
                        <button
                          type="button"
                          onClick={retry}
                          disabled={busy}
                          className="mt-2 inline-flex h-9 items-center text-[13px] font-medium text-ink-900 underline underline-offset-4 transition-opacity hover:opacity-60 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Reintentar
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <p className="max-w-none whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink-900">
                      {message.content}
                    </p>
                  )}

                  {message.cards?.length ? <PortfolioCardRail cards={message.cards} /> : null}
                  {message.proposal ? <HoldingsProposalCard proposal={message.proposal} /> : null}
                  {!message.pending && !message.error && message.content ? (
                    <p className="label-line max-w-2xl">{AI_DISCLAIMER}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send(input);
          }}
          className="shrink-0 border-t border-app-border bg-app-card px-3 pb-3 pt-2.5 md:px-5"
        >
          {notice ? (
            <p
              role="status"
              className="mx-auto mb-2 max-w-3xl border-l-2 border-ink-900 pl-2 text-[12px] leading-snug text-ink-700"
            >
              {notice}
            </p>
          ) : null}

          <div className="mx-auto max-w-3xl">
            <label htmlFor="chat-composer" className="sr-only">
              Mensaje para Fraccion IA
            </label>

            <div className="flex items-end gap-1 border border-app-border bg-app-card p-1.5 transition-colors focus-within:border-ink-900">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void onImage(file);
                }}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                aria-label="Adjuntar una captura de tu cartera (PNG, JPG o WebP, hasta 4 MB)"
                className="grid h-10 w-10 shrink-0 place-items-center text-ink-500 transition-colors hover:text-ink-900 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Paperclip className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              </button>

              <textarea
                id="chat-composer"
                ref={inputRef}
                value={input}
                maxLength={2000}
                rows={1}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key !== "Enter" ||
                    event.shiftKey ||
                    event.nativeEvent.isComposing ||
                    busy
                  ) {
                    return;
                  }
                  event.preventDefault();
                  void send(input);
                }}
                placeholder="Pregunta por una cartera. Enter envía; Shift + Enter salta de línea."
                aria-describedby="chat-composer-hint"
                className="max-h-40 min-h-[38px] min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-1.5 py-2 text-[16px] leading-relaxed text-ink-900 placeholder:text-ink-500 focus-visible:outline-none sm:text-[15px]"
              />

              <button
                type="submit"
                disabled={busy || !input.trim()}
                aria-busy={busy}
                aria-label={busy ? "Esperando la respuesta de Fraccion" : "Enviar mensaje"}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-ink-900 px-4 text-[14px] font-medium text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="hidden sm:inline">Enviar</span>
                <ArrowUp className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              </button>
            </div>

            <p id="chat-composer-hint" className="mt-1.5 text-[11px] leading-snug text-ink-500">
              {busy
                ? "Fraccion está respondiendo. Espera para enviar otra consulta."
                : "Enter envía · Shift + Enter agrega un salto de línea. Solo información pública; no es asesoría."}
            </p>
          </div>
        </form>
      </section>
    </div>
  );
}
