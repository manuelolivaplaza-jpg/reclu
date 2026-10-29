-- ============================================================
-- Migration 069 (D52): historial del chat IA del panel. NO APLICADA.
-- Idempotente. Solo agrega: tabla chat_conversations y columnas
-- conversation_id/meta en chat_messages. RLS: cada usuario solo lo suyo.
-- ============================================================

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Nueva conversación' check (char_length(title) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_chat_conversations_user
  on public.chat_conversations(user_id, updated_at desc);

alter table public.chat_conversations enable row level security;

drop policy if exists "own conversations all" on public.chat_conversations;
create policy "own conversations all" on public.chat_conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on table public.chat_conversations from anon;
grant select, insert, update, delete on table public.chat_conversations to authenticated;

alter table public.chat_messages
  add column if not exists conversation_id uuid references public.chat_conversations(id) on delete cascade,
  add column if not exists meta jsonb check (meta is null or pg_column_size(meta) < 65536);

create index if not exists idx_chat_messages_conversation
  on public.chat_messages(conversation_id, created_at);

-- Un mensaje solo puede colgar de una conversación del mismo usuario.
drop policy if exists "own chat insert" on public.chat_messages;
create policy "own chat insert" on public.chat_messages for insert with check (
  auth.uid() = user_id
  and (
    conversation_id is null
    or exists (
      select 1 from public.chat_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  )
);

-- Borrado propio (para "borrar conversación" y derecho de supresión).
drop policy if exists "own chat delete" on public.chat_messages;
create policy "own chat delete" on public.chat_messages
  for delete using (auth.uid() = user_id);
