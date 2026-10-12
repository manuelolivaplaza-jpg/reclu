-- Migration 004: AI chat quotas and history
-- chat_quota_used / chat_reset_at live on profiles (weekly reset).
-- chat_messages stores per-user history. Idempotent.

alter table public.profiles add column if not exists chat_quota_used integer not null default 0;
alter table public.profiles add column if not exists chat_reset_at timestamptz not null default now();
alter table public.profiles add column if not exists chat_quota_limit integer not null default 100;

create table if not exists public.chat_messages (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_messages_user on public.chat_messages(user_id, created_at);

alter table public.chat_messages enable row level security;

drop policy if exists "own chat read" on public.chat_messages;
create policy "own chat read" on public.chat_messages for select using (auth.uid() = user_id);

drop policy if exists "own chat insert" on public.chat_messages;
create policy "own chat insert" on public.chat_messages for insert with check (auth.uid() = user_id);

-- Weekly reset function: called before each quota check.
create or replace function public.reset_chat_quota_if_stale()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.chat_reset_at < now() - interval '7 days' then
    new.chat_quota_used := 0;
    new.chat_reset_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists reset_chat_quota on public.profiles;
create trigger reset_chat_quota
  before update on public.profiles
  for each row execute function public.reset_chat_quota_if_stale();
