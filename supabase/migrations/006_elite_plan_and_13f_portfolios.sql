-- ============================================================
-- Migration 006: Plan Elite, cuotas diferenciadas de chat y portafolios Wave 2/3
-- 100% idempotente: seguro de re-ejecutar en el SQL Editor de Supabase.
-- ============================================================

-- 1. Actualizar constraint de plan en public.profiles para permitir 'elite'
alter table public.profiles
  drop constraint if exists profiles_plan_check;

alter table public.profiles
  add constraint profiles_plan_check
  check (plan in ('free', 'pro', 'elite'));

-- 2. Asegurar columnas de cuota y actualizar límites según plan ('free': 5, 'pro': 50, 'elite': 500)
alter table public.profiles add column if not exists chat_quota_used integer not null default 0;
alter table public.profiles add column if not exists chat_reset_at timestamptz not null default now();
alter table public.profiles add column if not exists chat_quota_limit integer not null default 50;

update public.profiles
set chat_quota_limit = case
  when plan = 'elite' then 500
  when plan = 'pro' then 50
  else 5
end
where
  (plan = 'elite' and chat_quota_limit < 500)
  or (plan = 'pro' and chat_quota_limit not in (50, 100));

-- Trigger que reinicia cuota vencida y ajusta chat_quota_limit al cambiar de plan
create or replace function public.reset_chat_quota_if_stale()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.plan is distinct from old.plan then
    new.chat_quota_limit := case
      when new.plan = 'elite' then 500
      when new.plan = 'pro' then 50
      else 5
    end;
  end if;

  if new.chat_reset_at < now() - interval '7 days' then
    new.chat_quota_used := 0;
    new.chat_reset_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists reset_chat_quota on public.profiles;
create trigger reset_chat_quota
  before insert or update on public.profiles
  for each row execute function public.reset_chat_quota_if_stale();

-- Función RPC de verificación e incremento de cuota por plan ('free': 5/día, 'pro': 50/semana, 'elite': 500/semana)
create or replace function public.check_chat_quota(p_user_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_plan text;
  v_used integer;
  v_reset_at timestamptz;
  v_limit integer;
  v_window interval;
begin
  select plan, chat_quota_used, chat_reset_at
    into v_plan, v_used, v_reset_at
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'profile_not_found');
  end if;

  v_limit := case
    when v_plan = 'elite' then 500
    when v_plan = 'pro' then 50
    else 5
  end;

  v_window := case
    when v_plan in ('pro', 'elite') then interval '7 days'
    else interval '1 day'
  end;

  if v_reset_at is null or v_reset_at < now() - v_window then
    v_used := 0;
    v_reset_at := now();
  end if;

  if v_used >= v_limit then
    update public.profiles
       set chat_quota_used = v_used,
           chat_reset_at = v_reset_at,
           chat_quota_limit = v_limit
     where id = p_user_id;

    return jsonb_build_object(
      'allowed', false,
      'plan', v_plan,
      'used', v_used,
      'limit', v_limit,
      'remaining', 0,
      'reset_at', v_reset_at
    );
  end if;

  v_used := v_used + 1;

  update public.profiles
     set chat_quota_used = v_used,
         chat_reset_at = v_reset_at,
         chat_quota_limit = v_limit
   where id = p_user_id;

  return jsonb_build_object(
    'allowed', true,
    'plan', v_plan,
    'used', v_used,
    'limit', v_limit,
    'remaining', greatest(v_limit - v_used, 0),
    'reset_at', v_reset_at
  );
end;
$$;

-- 3. Upsert de portafolios de DEMO_PORTFOLIOS (Wave 2 + Wave 3: 13F, Políticos EE.UU., Radar Trump/Musk y Chile)
insert into public.portfolios (slug, name, description, category, source, manager, country, followers, return_ytd, premium, tags, is_active)
values
  ('berkshire-hathaway', 'Berkshire Hathaway', 'El libro 13F de Warren Buffett: posiciones listadas en EE.UU. al cierre de cada trimestre.', 'hedge_fund', 'sec_13f', 'Warren Buffett', 'US', 18900, 22.40, false, '{buffett,13f,value}', true),
  ('pershing-square', 'Pershing Square', 'El libro 13F de Bill Ackman: cartera concentrada de convicción.', 'hedge_fund', 'sec_13f', 'Bill Ackman', 'US', 9200, 19.80, true, '{ackman,13f,activista}', true),
  ('duquesne-family-office', 'Duquesne Family Office', 'El family office de Stanley Druckenmiller, alta rotación y foco en crecimiento.', 'hedge_fund', 'sec_13f', 'Stanley Druckenmiller', 'US', 11400, 34.60, true, '{druckenmiller,13f,family-office}', true),
  ('scion-asset-management', 'Scion Asset Management', 'El libro 13F de Michael Burry, famoso por la tesis de The Big Short.', 'hedge_fund', 'sec_13f', 'Michael Burry', 'US', 14200, 27.10, true, '{burry,13f,contrarian}', true),
  ('appaloosa-lp', 'Appaloosa Management', 'El libro 13F de David Tepper: distressed y equity concentrado.', 'hedge_fund', 'sec_13f', 'David Tepper', 'US', 6800, 29.50, true, '{tepper,13f,distressed}', true),
  ('tci-fund', 'TCI Fund Management', 'El fondo de Christopher Hohn: activismo con posiciones concentradas.', 'hedge_fund', 'sec_13f', 'Christopher Hohn', 'Global', 5400, 26.20, true, '{hohn,13f,activista}', true),
  ('pif-saudi', 'Public Investment Fund (PIF)', 'El fondo soberano de Arabia Saudita: posiciones globales vía filings 13F.', 'hedge_fund', 'sec_13f', 'Fondo Soberano', 'Global', 7100, 16.90, true, '{soberano,13f,vision-2030}', true),
  ('gottheimer-tracker', 'Josh Gottheimer Tracker', 'Operaciones declaradas por Joshua Gottheimer (D-NJ, Financial Services), uno de los congresistas más activos.', 'political_us', 'congress_invests', 'Josh Gottheimer', 'US', 4900, 24.70, false, '{congreso,financial-services,active-trader}', true),
  ('tuberville-tracker', 'Tommy Tuberville Tracker', 'Operaciones del senador Tommy Tuberville (R-AL, Armed Services), seguido por volumen y timing.', 'political_us', 'congress_invests', 'Tommy Tuberville', 'US', 6300, 21.30, false, '{senado,armed-services,opciones}', true),
  ('mccaul-tracker', 'Michael McCaul Tracker', 'Operaciones declaradas por Michael McCaul (R-TX, Foreign Affairs), uno de los libros más grandes en dólares.', 'political_us', 'congress_invests', 'Michael McCaul', 'US', 4100, 19.40, false, '{congreso,foreign-affairs,large-book}', true),
  ('mccormick-tracker', 'David McCormick Tracker', 'Operaciones del senador David McCormick (R-PA, Banking), ex CEO de Bridgewater, libro muy concentrado.', 'political_us', 'congress_invests', 'David McCormick', 'US', 5200, 25.80, true, '{senado,banking,bridgewater}', true),
  ('btg-cartera-recomendada', 'BTG Pactual — Cartera Recomendada 5', 'Cartera Concentrada de acciones IPSA del equipo de research de BTG Pactual Chile.', 'broker_cl', 'btg', 'BTG Pactual', 'CL', 4600, 15.40, false, '{chile,btg,ipsa}', true),
  ('trump-truth-signals', 'Trump Truth & Tariffs Radar', 'Monitorea menciones directas de empresas, aranceles y sectores estratégicos publicados por Donald Trump.', 'political_us', 'truth_social', 'Donald Trump', 'US', 19400, 36.40, true, '{trump,menciones,aranceles,truth-social}', true),
  ('elon-doge-tracker', 'DOGE & Musk Ecosystem', 'Empresas impactadas por recortes regulatorios, contratos aeroespaciales y menciones públicas de Elon Musk.', 'thematic', 'public_mentions', 'Elon Musk', 'US', 16800, 44.20, true, '{musk,doge,defensa,espacio}', true),
  ('khanna-tracker', 'Ro Khanna Tracker', 'Operaciones bursátiles declaradas por Ro Khanna (D-CA, Armed Services), representante del distrito de Silicon Valley.', 'political_us', 'house_clerk', 'Ro Khanna', 'US', 7400, 26.90, false, '{congreso,silicon-valley,tech}', true),
  ('delbene-tracker', 'Suzan DelBene Tracker', 'Operaciones declaradas por Suzan DelBene (D-WA, Ways and Means), ex ejecutiva de Microsoft con foco en tecnología.', 'political_us', 'house_clerk', 'Suzan DelBene', 'US', 5100, 23.10, false, '{congreso,ways-and-means,msft}', true),
  ('tiger-global', 'Tiger Global Management', 'El libro 13F de Tiger Global (Chase Coleman): alta convicción en plataformas tecnológicas, software y semiconductores.', 'hedge_fund', 'sec_13f', 'Chase Coleman', 'US', 10200, 33.10, true, '{13f,tech,growth,wall-street}', true),
  ('coatue-management', 'Coatue Management', 'El libro 13F de Coatue (Philippe Laffont): infraestructura de inteligencia artificial, energía para data centers y TMT.', 'hedge_fund', 'sec_13f', 'Philippe Laffont', 'US', 8900, 31.80, true, '{13f,ia,semis,tmt}', true),
  ('bridgewater-all-weather', 'Bridgewater Associates (13F)', 'El libro 13F de Bridgewater Associates: diversificación macro global, mercados emergentes y consumo defensivo.', 'hedge_fund', 'sec_13f', 'Ray Dalio / Bridgewater', 'US', 11600, 14.70, false, '{13f,macro,all-weather}', true),
  ('renaissance-institutional', 'Renaissance Technologies (13F)', 'Posiciones cuantitativas reportadas en el 13F de Renaissance Technologies, el fondo sistemático líder de Wall Street.', 'hedge_fund', 'sec_13f', 'Jim Simons / Rentech', 'US', 15300, 28.90, true, '{13f,quant,algoritmico}', true),
  ('softbank-vision', 'SoftBank Group (13F)', 'Posiciones listadas en EE.UU. de SoftBank Group: foco estratégico en diseño de chips, robótica y ecosistema ARM.', 'hedge_fund', 'sec_13f', 'Masayoshi Son', 'Global', 8100, 25.40, true, '{13f,arm,ia,japon}', true),
  ('mubadala-sovereign', 'Mubadala Investment Co (13F)', 'Declaraciones 13F del fondo soberano de Abu Dabi: inversiones estratégicas en semiconductores, IA e infraestructura.', 'hedge_fund', 'sec_13f', 'Fondo Soberano Abu Dabi', 'Global', 6200, 18.60, true, '{13f,soberano,semis}', true),
  ('afp-consenso-chile', 'Consenso AFP Chile — Acciones Nacionales', 'Tenencias agregadas de los Fondos de Pensiones chilenos en renta variable local según reportes de la Superintendencia de Pensiones.', 'public_disclosure', 'spensiones', 'Fondos de Pensiones CL', 'CL', 8700, 14.20, false, '{chile,afp,ipsa,institucional}', true),
  ('cobre-superciclo', 'Superciclo del Cobre & Red Eléctrica', 'Productores de cobre y equipamiento de transmisión eléctrica ante el déficit estructural por electrificación y data centers.', 'thematic', 'model', 'Tesis Commodities', 'Global', 6900, 29.10, true, '{cobre,mineria,chile,electrificacion}', true)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  source = excluded.source,
  manager = excluded.manager,
  country = excluded.country,
  return_ytd = coalesce(public.portfolios.return_ytd, excluded.return_ytd),
  premium = excluded.premium,
  tags = excluded.tags,
  is_active = true,
  updated_at = now();
