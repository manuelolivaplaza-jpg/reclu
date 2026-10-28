-- D40 · NO APLICADO. Completa holdings.name vacío o igual al símbolo con el
-- nombre real que ya existe en otra fila de holdings (13F/ETF). La app ya lo
-- hace al mostrar (getSymbolNamesAdmin); esto lo deja persistido.
-- 1) Vista previa (solo lectura).
with nombres as (
  select upper(symbol) as sym, max(regexp_replace(name, '^\s*corto\s*:\s*', '', 'i')) as nombre
  from holdings
  where name is not null and upper(regexp_replace(name, '^\s*corto\s*:\s*', '', 'i')) <> upper(symbol)
  group by upper(symbol)
)
select h.portfolio_id, h.symbol, h.name, n.nombre
from holdings h join nombres n on n.sym = upper(h.symbol)
where h.name is null or upper(regexp_replace(h.name, '^\s*corto\s*:\s*', '', 'i')) = upper(h.symbol);
-- 2) Aplicar (mantiene el prefijo "Corto:" si lo tenía):
-- begin;
-- with nombres as (...igual que arriba...)
-- update holdings h set name = case when h.name ~* '^\s*corto\s*:' then 'Corto: ' || n.nombre else n.nombre end
-- from nombres n where n.sym = upper(h.symbol)
--   and (h.name is null or upper(regexp_replace(h.name, '^\s*corto\s*:\s*', '', 'i')) = upper(h.symbol));
-- commit;
