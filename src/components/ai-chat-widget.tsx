"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X, ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ChatGateModal, type GateReason } from "./chat-gate-modal";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "¿Qué es el Pelosi Tracker?",
  "¿Cómo funciona el seguimiento 13F?",
  "¿Qué carteras siguen las corredoras chilenas?",
  "Explícame los ETFs de ARK",
];

// Cuota anónima: 2 preguntas antes de pedir registro. Persistida en localStorage.
const ANON_FREE_QUESTIONS = 2;
const ANON_KEY = "reclu_anon_questions";

function readAnonCount(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(ANON_KEY);
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}

function bumpAnonCount(): number {
  const next = readAnonCount() + 1;
  try {
    window.localStorage.setItem(ANON_KEY, String(next));
  } catch {
    /* storage bloqueado */
  }
  return next;
}

export function AiChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [reply, setReply] = useState("");
  const replyRef = useRef("");
  replyRef.current = reply;
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<{ id: string; plan: string } | null>(null);
  const [gate, setGate] = useState<{ open: boolean; reason: GateReason }>({
    open: false,
    reason: "register",
  });
  const [lowQuota, setLowQuota] = useState(false);
  const [loadedHistory, setLoadedHistory] = useState(false);

  // Auto-scroll al fondo cuando llegan mensajes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Foco automático al abrir
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 350);
  }, [open]);

  // Cerrar con Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Detectar sesión y cargar historial guardado
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    supabase.auth.getUser().then(async ({ data }) => {
      if (cancelled || !data.user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("plan")
        .eq("id", data.user.id)
        .maybeSingle();
      if (cancelled) return;
      setUser({ id: data.user.id, plan: profile?.plan ?? "free" });
      // Cargar últimas 50 mensajes del historial
      const { data: history } = await supabase
        .from("chat_messages")
        .select("role, content")
        .eq("user_id", data.user.id)
        .order("created_at", { ascending: true })
        .limit(50);
      if (!cancelled && history && history.length > 0) {
        setMessages(
          history.map((h: { role: string; content: string }) => ({
            role: h.role === "assistant" ? "assistant" : "user",
            content: h.content,
          })),
        );
      }
      setLoadedHistory(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function send(text: string) {
    const question = text.trim();
    if (!question || loading) return;

    // --- Gate anónimo: tras 2 preguntas, pedir registro ---
    if (!user) {
      const count = readAnonCount();
      if (count >= ANON_FREE_QUESTIONS) {
        setGate({ open: true, reason: "register" });
        return;
      }
    }

    const userMsg: ChatMessage = { role: "user", content: question };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setReply("");
    if (!user) bumpAnonCount();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });

      // 429 = límite alcanzado (registrado). Pop-up de upgrade o de renovación.
      if (res.status === 429) {
        setGate({ open: true, reason: "limit" });
        setLoading(false);
        return;
      }

      if (!res.ok || !res.body) {
        let errMsg = "No pude conectar con el asistente. Intenta de nuevo en un momento.";
        try {
          const data = await res.json();
          if (data.error) errMsg = data.error;
        } catch {
          /* respuesta sin body JSON */
        }
        setMessages([...nextMessages, { role: "assistant", content: errMsg }]);
        setLoading(false);
        return;
      }

      // Cuota: free recibe el número restante; Pro recibe solo el aviso sutil.
      const remaining = res.headers.get("X-Chat-Remaining");
      const quedanPocas = res.headers.get("X-Chat-Quedan-Pocas") === "true";
      setLowQuota(quedanPocas || (remaining !== null && remaining !== "limited" && Number(remaining) <= 2));

      // El backend stremea SSE de OpenRouter: leer chunk a chunk.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });

        // Cada evento SSE con data: [DONE] termina el stream.
        for (const rawLine of acc.split("\n")) {
          const line = rawLine.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") {
            acc = "";
            break;
          }
          try {
            const parsed = JSON.parse(payload);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) setReply((prev) => prev + delta);
          } catch {
            /* línea parcial, esperar más chunks */
          }
        }
        // Limpiar las líneas ya procesadas para no duplicar.
        acc = acc.split("\n").pop() ?? "";
      }

      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return [...prev.slice(0, -1), { role: "assistant", content: replyRef.current || last.content }];
        }
        return [...prev, { role: "assistant", content: replyRef.current || "Sin respuesta." }];
      });
    } catch {
      setMessages([
        ...nextMessages,
        { role: "assistant", content: "Error de red. Revisa tu conexión e inténtalo otra vez." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Fondo oscurecido cuando el chat está abierto */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-40 bg-ink-900/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Botón flotante */}
      <AnimatePresence>
        {!open && (
          <motion.button
            type="button"
            onClick={() => setOpen(true)}
            className="fixed right-5 bottom-5 z-50 flex h-12 items-center gap-2 rounded-full bg-ink-900 pr-4 pl-3.5 text-[14px] font-medium text-white"
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            aria-label="Abrir asistente IA"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 2v3M12 19v3M2 12h3M19 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            Pregúntale a reclu
          </motion.button>
        )}
      </AnimatePresence>

      {/* Panel del chat */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="relative fixed inset-0 z-50 flex flex-col bg-background sm:inset-auto sm:right-5 sm:bottom-5 sm:h-[560px] sm:w-[400px] sm:border sm:border-ink-200"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 350, damping: 32 }}
            role="dialog"
            aria-label="Asistente IA de reclu"
          >
            <ChatGateModal
              open={gate.open}
              reason={gate.reason}
              onClose={() => setGate((g) => ({ ...g, open: false }))}
            />
            {/* Aviso MUY sutil solo para Pro cerca del límite (nunca el número) */}
            {lowQuota && user?.plan === "pro" && !gate.open && (
              <p className="border-b border-ink-200 px-5 py-2 text-[12px] text-ink-500">
                Te quedan pocas consultas esta semana. Se renuevan automáticamente.
              </p>
            )}
            {/* Header */}
            <div className="flex items-center justify-between border-b border-ink-200 px-5 py-4">
              <div>
                <p className="text-[17px] font-medium tracking-[-0.03em] text-ink-900">
                  Asistente reclu
                </p>
                <p className="text-[12px] text-ink-500">
                  Información con fines informativos. No es asesoría de inversión.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-ink-500 transition-opacity hover:opacity-60"
                aria-label="Cerrar asistente"
              >
                <X size={18} strokeWidth={1.8} />
              </button>
            </div>

            {/* Mensajes */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5">
              {messages.length === 0 ? (
                <div className="space-y-4">
                  <p className="text-[15px] leading-relaxed text-ink-500">
                    Pregúntame sobre los portafolios que seguimos, cómo funcionan las alertas,
                    los 13F de los fondos o cualquier duda de inversión.
                  </p>
                  <div className="space-y-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => send(s)}
                        className="block w-full border border-ink-200 px-4 py-2.5 text-left text-[14px] text-ink-900 transition-colors hover:bg-ink-50"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  {messages.map((m, i) => (
                    <div key={i} className={m.role === "user" ? "text-right" : ""}>
                      {m.role === "user" ? (
                        <p className="inline-block max-w-[85%] bg-ink-900 px-4 py-2.5 text-left text-[14px] leading-relaxed text-white">
                          {m.content}
                        </p>
                      ) : (
                        <div className="max-w-[92%] border-l-2 border-ink-900 pl-3.5">
                          <p className="text-[14px] leading-relaxed whitespace-pre-wrap text-ink-900">
                            {m.content}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                  {loading && (
                    <div className="flex items-center gap-1.5 text-ink-500">
                      {!reply && (
                        <>
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-400 [animation-delay:-0.3s]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-400 [animation-delay:-0.15s]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-400" />
                        </>
                      )}
                    </div>
                  )}
                  {loading && reply && (
                    <div>
                      <div className="max-w-[92%] border-l-2 border-ink-900 pl-3.5">
                        <p className="text-[14px] leading-relaxed whitespace-pre-wrap text-ink-900">
                          {reply}
                          <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-ink-900" />
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Input */}
            <form
              className="flex items-center gap-2 border-t border-ink-200 px-4 py-3"
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Escribe tu pregunta…"
                className="flex-1 bg-transparent text-[14px] text-ink-900 outline-none placeholder:text-ink-400"
                aria-label="Mensaje para el asistente"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-900 text-white transition-opacity disabled:opacity-30"
                aria-label="Enviar mensaje"
              >
                <ArrowUp size={15} strokeWidth={2.2} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
