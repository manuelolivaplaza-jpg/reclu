/**
 * GET    /api/chat/ia/conversations          -> lista del usuario
 * GET    /api/chat/ia/conversations?id=<uuid> -> mensajes de una conversación
 * DELETE /api/chat/ia/conversations?id=<uuid> -> borra una conversación
 * Siempre con la sesión del usuario (RLS). Sin service role.
 */
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  deleteConversation,
  listConversations,
  loadConversation,
} from "@/lib/chat-ia/conversations";

const idSchema = z.string().uuid();
const noStore = { "Cache-Control": "no-store" };

async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET(request: Request) {
  const { supabase, user } = await session();
  if (!user) return Response.json({ error: "Inicia sesión." }, { status: 401, headers: noStore });
  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    const parsed = idSchema.safeParse(id);
    if (!parsed.success) return Response.json({ error: "Id inválido." }, { status: 400, headers: noStore });
    const messages = await loadConversation(supabase, user.id, parsed.data);
    return Response.json({ messages }, { headers: noStore });
  }
  return Response.json({ conversations: await listConversations(supabase, user.id) }, { headers: noStore });
}

export async function DELETE(request: Request) {
  const { supabase, user } = await session();
  if (!user) return Response.json({ error: "Inicia sesión." }, { status: 401, headers: noStore });
  const parsed = idSchema.safeParse(new URL(request.url).searchParams.get("id"));
  if (!parsed.success) return Response.json({ error: "Id inválido." }, { status: 400, headers: noStore });
  const ok = await deleteConversation(supabase, user.id, parsed.data);
  return Response.json({ ok }, { status: ok ? 200 : 500, headers: noStore });
}
