/**
 * POST /api/chat/ia — chat IA del panel (D52).
 *
 * Orden de barreras: sesión (401) -> IA configurada (503) -> zod -> ráfaga por usuario ->
 * cupo por plan (check_chat_quota, mismo que /api/chat) -> herramientas con
 * allowlist bajo la sesión/RLS -> filtro de recomendaciones -> SSE.
 *
 * Eventos SSE: tokens en forma OpenRouter (choices[0].delta.content) y
 * eventos `reclu`: meta (conversationId), cards, proposal, disclaimer,
 * replacement. La imagen NO pasa por aquí: el cliente usa /api/holdings/image
 * (consentimiento, magic bytes, 4 MB, sin guardar) y el resultado vuelve como
 * propuesta para confirmar.
 */
import { createClient } from "@/lib/supabase/server";
import { enforceSignedInQuota } from "@/lib/chat-guard";
import { filterChatAdvice } from "@/lib/chat-advice";
import { firstZodMessage } from "@/lib/validation";
import {
  CHAT_IA_SYSTEM_PROMPT,
  chatIaRequestSchema,
  checkBurst,
  looksLikeInjection,
  safeLog,
  wrapUntrusted,
} from "@/lib/chat-ia/security";
import { TOOL_DEFINITIONS, executeTool, type HoldingsProposal, type PortfolioCardData } from "@/lib/chat-ia/tools";
import { chatIaConfig, orComplete, orStream, textAsSse, type OrMessage } from "@/lib/chat-ia/openrouter-tools";
import { ensureConversation, insertMessage } from "@/lib/chat-ia/conversations";

const MAX_TOOL_ROUNDS = 3;
const noStore = { "Cache-Control": "no-store" };

function sse(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

export async function POST(request: Request) {
  // Primero la sesión (401) y después la configuración de IA (503): sin
  // sesión no se revela el estado de la configuración.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Inicia sesión para usar el chat." }, { status: 401, headers: noStore });

  const cfg = chatIaConfig();
  if (!cfg.enabled) {
    return Response.json(
      { error: `La IA no está disponible en este entorno: falta configurar ${cfg.missing.join(" y ")}.` },
      { status: 503, headers: noStore },
    );
  }

  const raw = await request.text();
  if (raw.length > 64_000) return Response.json({ error: "Mensaje demasiado largo." }, { status: 413, headers: noStore });
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400, headers: noStore });
  }
  const parsed = chatIaRequestSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: firstZodMessage(parsed.error) }, { status: 400, headers: noStore });

  const burst = checkBurst(user.id);
  if (!burst.ok) {
    return Response.json(
      { error: "Vas muy rápido. Espera unos segundos." },
      { status: 429, headers: { ...noStore, "Retry-After": String(burst.retryAfterSec) } },
    );
  }

  const quota = await enforceSignedInQuota(user.id);
  if (!quota.ok) return Response.json(quota.body, { status: quota.status, headers: noStore });

  const { messages } = parsed.data;
  const question = messages[messages.length - 1].content;
  const conversationId = await ensureConversation(supabase, user.id, parsed.data.conversationId, question);
  await insertMessage(supabase, user.id, conversationId, "user", question);
  if (looksLikeInjection(question)) safeLog("injection_marker_user", { conv: conversationId ?? "none" });

  // Historial: el texto previo del asistente también se trata como no confiable.
  const convo: OrMessage[] = [
    { role: "system", content: CHAT_IA_SYSTEM_PROMPT },
    ...messages.map((m): OrMessage =>
      m.role === "assistant"
        ? { role: "assistant", content: m.content }
        : { role: "user", content: m.content },
    ),
  ];

  const cards: PortfolioCardData[] = [];
  let proposal: HoldingsProposal | undefined;
  let finalText: string | null = null;
  let usedTools = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const res = await orComplete(cfg, convo, TOOL_DEFINITIONS);
    if (!res.ok) {
      safeLog("upstream_error", { status: res.status });
      return Response.json({ error: "La IA no respondió. Intenta de nuevo." }, { status: 502, headers: noStore });
    }
    if (res.toolCalls.length === 0) {
      finalText = res.content;
      break;
    }
    usedTools = true;
    convo.push({ role: "assistant", content: res.content || null, tool_calls: res.toolCalls });
    for (const call of res.toolCalls) {
      let args: unknown = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        args = null;
      }
      const outcome = await executeTool(supabase, user.id, call.function.name, args);
      safeLog("tool", { name: call.function.name, ok: !(outcome.forModel as { error?: string })?.error });
      if (outcome.cards) cards.push(...outcome.cards);
      if (outcome.proposal) proposal = outcome.proposal;
      convo.push({ role: "tool", tool_call_id: call.id, content: wrapUntrusted(call.function.name, outcome.forModel) });
    }
  }

  let upstream: ReadableStream<Uint8Array> | null;
  if (finalText !== null && (!usedTools || finalText.trim())) {
    upstream = textAsSse(finalText);
  } else {
    upstream = await orStream(cfg, convo);
  }
  if (!upstream) return Response.json({ error: "La IA no respondió. Intenta de nuevo." }, { status: 502, headers: noStore });

  const uniqueCards = [...new Map(cards.map((c) => [c.slug, c])).values()].slice(0, 6);
  const filtered = filterChatAdvice(upstream, {
    route: "/api/chat/ia",
    onComplete: (content) =>
      insertMessage(supabase, user.id, conversationId, "assistant", content, {
        cards: uniqueCards,
        proposal: proposal ?? null,
      }),
  });

  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(enc.encode(sse({ reclu: { type: "meta", conversationId } })));
      if (uniqueCards.length) controller.enqueue(enc.encode(sse({ reclu: { type: "cards", cards: uniqueCards } })));
      if (proposal) controller.enqueue(enc.encode(sse({ reclu: { type: "proposal", proposal } })));
      const reader = filtered.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
      ...quota.headers,
    },
  });
}
