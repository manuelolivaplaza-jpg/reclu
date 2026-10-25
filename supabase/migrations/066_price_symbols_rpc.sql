-- D38: símbolos distintos de prices en una sola RPC paginada (solo lectura).
-- price_coverage.py la usa en vez de ~5000 consultas (una por símbolo).
create or replace function public.price_symbols(p_offset int default 0, p_limit int default 1000)
returns table(symbol text)
language sql stable security invoker
as $$
  select distinct p.symbol from public.prices p
  order by p.symbol
  offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 1000);
$$;

grant execute on function public.price_symbols(int, int) to service_role;
