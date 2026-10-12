-- Migration 002: real returns on holdings
-- Adds price fields and computed return_pct to holdings, filled by
-- scrapers/compute_returns.py (latest price from the prices table).
-- Idempotent: safe to re-run.

alter table public.holdings add column if not exists price_at_disclosure numeric(14,4);
alter table public.holdings add column if not exists price_current numeric(14,4);
alter table public.holdings add column if not exists return_pct numeric(8,2);
