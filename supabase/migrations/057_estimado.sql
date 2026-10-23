-- 057: marca de serie estimada en portfolio_performance (idempotente).
--
-- is_estimated = true  -> punto proyectado con las posiciones actuales
--                         (scrapers/performance.py).
-- is_estimated = false -> historia real (precio del ETF, 13F trimestrales,
--                         PTR del Congreso).
--
-- Al crear la columna, TODAS las filas previas se marcan estimadas: venían de
-- la proyección de performance.py o de reconstrucciones que se vuelven a
-- correr (y se reescriben como reales). Solo ocurre la primera vez.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'portfolio_performance'
      and column_name = 'is_estimated'
  ) then
    alter table public.portfolio_performance
      add column is_estimated boolean not null default false;
    update public.portfolio_performance set is_estimated = true;
  end if;
end $$;

create index if not exists idx_portfolio_performance_estimated
  on public.portfolio_performance (portfolio_id, is_estimated, date);
