/**
 * chat-ia/conversations.ts — historial del chat IA (D52), siempre con el
 * cliente de la sesión (RLS: cada usuario ve solo lo suyo).
 * Requiere la migración 069. Si no está aplicada, el chat funciona igual sin
 * historial (las funciones devuelven null / [] y lo registran sin PII).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { safeLog } from "@/lib/chat-ia/security";

export interface ConversationSummary {
  id: string;
  title: string;
  updated_at: string;
}

export async function ensureConversation(
  db: SupabaseClient,
  userId: string,
  conversationId: string | undefined,
  firstQuestion: string,
): Promise<string | null> {
  if (conversationId) {
    const { data, error } = await db
      .from("chat_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!error && data) {
      await db.from("chat_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
      return conversationId;
    }
  }
  const title = firstQuestion.replace(/\s+/g, " ").trim().slice(0, 60) || "Nueva conversación";
  const { data, error } = await db
    .from("chat_conversations")
    .insert({ user_id: userId, title })
    .select("id")
    .single();
  if (error || !data) {
    safeLog("conversation_insert_failed", { code: error?.code ?? "sin-codigo" });
    return null;
  }
  return (data as { id: string }).id;
}

export async function insertMessage(
  db: SupabaseClient,
  userId: string,
  conversationId: string | null,
  role: "user" | "assistant",
  content: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  const row: Record<string, unknown> = { user_id: userId, role, content };
  if (conversationId) {
    row.conversation_id = conversationId;
    if (meta) row.meta = meta;
  }
  const { error } = await db.from("chat_messages").insert(row);
  if (error) safeLog("message_insert_failed", { role, code: error.code ?? "sin-codigo" });
}

export async function listConversations(db: SupabaseClient, userId: string): Promise<ConversationSummary[]> {
  const { data, error } = await db
    .from("chat_conversations")
    .select("id, title, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) return [];
  return (data ?? []) as ConversationSummary[];
}

export async function loadConversation(db: SupabaseClient, userId: string, id: string) {
  const { data, error } = await db
    .from("chat_messages")
    .select("role, content, meta, created_at")
    .eq("user_id", userId)
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) return [];
  return data ?? [];
}

export async function deleteConversation(db: SupabaseClient, userId: string, id: string): Promise<boolean> {
  const { error } = await db.from("chat_conversations").delete().eq("id", id).eq("user_id", userId);
  return !error;
}
