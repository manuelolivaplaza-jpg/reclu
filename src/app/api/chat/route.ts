/**
 * POST /api/chat — conversational assistant for reclu.cl.
 * Body: { messages: { role: "user" | "assistant", content: string }[] }
 * Streams the model reply as Server-Sent Events (OpenRouter chat completions).
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.0-flash-001";

const SYSTEM_PROMPT = `Eres el asistente de reclu.cl, experto en inversiones y en los portafolios de la plataforma: políticos del Congreso de EE.UU., hedge funds 13F (como Warren Buffett y Michael Burry), ETFs de ARK y corredoras chilenas como Renta 4.

Respondes en español de Chile, con tono profesional y conciso, en un máximo de 3 párrafos.

Entregas información con fines informativos. Nunca das consejos de inversión personalizados. Si la pregunta roza la asesoría —qué comprar, vender o cuánto poner en un instrumento— declínalo con elegancia y recuerda que reclu.cl muestra datos públicos para que cada persona decida por su cuenta.`;

type ChatRole = "user" | "assistant";

interface ChatMessage {
  role: ChatRole;
  content: string;
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as { role?: unknown; content?: unknown };
  return (
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    message.content.trim().length > 0
  );
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return Response.json(
      {
        error:
          "Falta OPENROUTER_API_KEY. Configura esa variable en el servidor para usar el asistente.",
      },
      { status: 500 },
    );
  }

  let body: { messages?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json(
      { error: "messages es requerido y no puede venir vacío." },
      { status: 400 },
    );
  }

  if (!body.messages.every(isChatMessage)) {
    return Response.json(
      { error: "Cada mensaje debe tener role (user o assistant) y content de texto." },
      { status: 400 },
    );
  }

  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;

  let upstream: Response;
  try {
    upstream = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...body.messages],
        max_tokens: 700,
        temperature: 0.3,
        stream: true,
      }),
    });
  } catch {
    return Response.json(
      { error: "No se pudo contactar a OpenRouter." },
      { status: 502 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    return Response.json(
      { error: "OpenRouter no devolvió una respuesta válida." },
      { status: 502 },
    );
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
