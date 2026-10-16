-- Migration 006: Elite plan (Wave 2)
-- Extends the profiles.plan check to accept 'elite'.
-- Free ($0) / Pro ($12.990) / Elite ($16.990). Idempotent.

alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles drop constraint if exists profiles_plan_check1;
alter table public.profiles add constraint profiles_plan_check
  check (plan in ('free', 'pro', 'elite'));
