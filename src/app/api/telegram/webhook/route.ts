import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-admin";

const START_RE = /^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{6,64}))?$/;

function unauthorized() {
  return NextResponse.json({ ok: false }, { status: 401 });
}

async function reply(chatId: number | string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch(() => undefined);
}

/** Telegram solo habla por POST. El secreto va en X-Telegram-Bot-Api-Secret-Token. */
export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const header = request.headers.get("x-telegram-bot-api-secret-token");
  if (!secret || header !== secret) return unauthorized();

  const update = await request.json().catch(() => null);
  const text = typeof update?.message?.text === "string" ? update.message.text.trim() : "";
  const chatId = update?.message?.chat?.id;
  if (text.length === 0 || (typeof chatId !== "number" && typeof chatId !== "string")) {
    return NextResponse.json({ ok: true });
  }

  const match = text.match(START_RE);
  if (!match) return NextResponse.json({ ok: true });

  const code = match[1];
  if (!code) {
    await reply(chatId, "Abre el enlace desde Ajustes en reclu.cl para vincular este chat.");
    return NextResponse.json({ ok: true, linked: false });
  }

  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ ok: false }, { status: 503 });

  const { data, error } = await supabase.rpc("link_telegram_chat", {
    p_code: code,
    p_chat_id: String(chatId),
  });

  if (error || data !== true) {
    await reply(chatId, "Ese código no es válido. Genera otro enlace en Ajustes.");
    return NextResponse.json({ ok: true, linked: false });
  }

  await reply(chatId, "Listo. Este chat recibirá tus alertas de reclu.");
  return NextResponse.json({ ok: true, linked: true });
}
