-- ============================================================
-- reclu.cl — Cover images: migración + asignación (idempotente)
-- Ejecutar en Supabase SQL Editor. Reejecutable sin romper nada.
-- ============================================================

-- 1. Columnas de portada
alter table public.portfolios
  add column if not exists cover_image text,
  add column if not exists cover_type text not null default 'asset';

comment on column public.portfolios.cover_image is 'Ruta bajo /covers, ej. 05-algoritmo.png';
comment on column public.portfolios.cover_type is 'asset = public/covers; upload = subida manual';

-- 2. Asignación por arquetipo (según categoría/tema)
-- hedge_fund: value/viejo, nueva ola, cuant, soberano
update public.portfolios set cover_image = '03-inversor-viejo.png'  where slug in ('berkshire-hathaway-13f','baupost-13f','appaloosa-13f','third-point-13f','pershing-square-13f');
update public.portfolios set cover_image = '04-inversor-joven.png'  where slug in ('scion-13f','coatue-13f','tiger-global-13f','viking-global-13f','duquesne-13f','egerton-13f','lansdowne-13f','sb-advisers-13f');
update public.portfolios set cover_image = '05-algoritmo.png'        where slug in ('renaissance-13f','bridgewater-13f');
update public.portfolios set cover_image = '06-soberano.png'         where slug in ('pif-13f','mubadala-13f','cevian-13f','tci-13f','softbank-13f','soros-13f');

-- political_us: capitolio
update public.portfolios set cover_image = '01-capitolio.png'       where source = 'capitol_trades' or source = 'congress_bridge' or slug in ('pelosi-tracker','trump-trades','cisneros-tracker','hern-tracker','gottheimer-tracker','fields-tracker','mcclain-delaney-tracker','moskowitz-tracker','congress-buys');

-- broker_cl: banca (corredoras)
update public.portfolios set cover_image = '11-banca.png'           where source in ('renta4','larrainvial','btg') or category = 'broker_cl';

-- thematic: según tema
update public.portfolios set cover_image = '07-chip.png'            where slug = 'semiconductores';
update public.portfolios set cover_image = '09-energia.png'         where slug in ('energias-renovables','utilities-defensivas');
update public.portfolios set cover_image = '10-bateria.png'         where slug in ('litio-mineria','lit','copx');
update public.portfolios set cover_image = '08-grafico.png'         where slug in ('sp500-top10');
update public.portfolios set cover_image = '11-banca.png'           where slug in ('bancos-chilenos','fintech-global','dividendos-ipsa','retail-chileno');
update public.portfolios set cover_image = '12-global.png'          where slug in ('ai-world-war','claude-portfolio','latin-tech','bonos-tesoro-us','dividend-aristocrats','inverse-cramer','bug','hero');
update public.portfolios set cover_image = '02-toro.png'            where source = 'ark_csv';

-- public_disclosure: banca/institucional
update public.portfolios set cover_image = '11-banca.png'           where source = 'infoprobidad';

-- 3. Verificación
select slug, cover_image from public.portfolios where cover_image is not null order by slug;
