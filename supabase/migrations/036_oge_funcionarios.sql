-- ============================================================
-- Migration 036 (F36): Funcionarios de EE.UU. — OGE 278-T
-- Idempotente. Un portafolio por funcionario, source oge_278t y
-- premium=false. La tabla disclosure_trades y las funciones de
-- lectura pública vienen de la 019; aquí no se duplican.
--
-- Legal: 5 U.S.C. § 13107(c)(1)(B) obliga a dar acceso público a
-- estas declaraciones. Por eso los portafolios NO van detrás del
-- muro (src/lib/public-disclosure.ts ya incluye oge_278t).
-- Datos mínimos: nombre, cargo y enlace al PDF oficial. Sin datos
-- personales adicionales (Ley 19.628 / 21.719).
-- ============================================================

insert into public.portfolios (
  slug, name, description, category, source, manager, country,
  followers, return_ytd, premium, tags, is_active
)
values
  (
    'bessent-oge',
    'Scott Bessent (OGE)',
    'Compras y ventas de valores declaradas por Scott Bessent, Secretario del Tesoro de EE.UU., en el formulario OGE 278-T. Los montos son tramos oficiales, no cifras exactas. La OGE publica con hasta 45 días de atraso. Declaración pública y gratuita según 5 U.S.C. § 13107. Solo informa transacciones divulgadas: no es recomendación de inversión.',
    'political_us',
    'oge_278t',
    'Scott Bessent',
    'US',
    0,
    null,
    false,
    '{oge,funcionarios,tesoro,eeuu}',
    true
  ),
  (
    'lutnick-oge',
    'Howard Lutnick (OGE)',
    'Compras y ventas de valores declaradas por Howard Lutnick, Secretario de Comercio de EE.UU., en el formulario OGE 278-T. Los montos son tramos oficiales, no cifras exactas. La OGE publica con hasta 45 días de atraso. Declaración pública y gratuita según 5 U.S.C. § 13107. Solo informa transacciones divulgadas: no es recomendación de inversión.',
    'political_us',
    'oge_278t',
    'Howard Lutnick',
    'US',
    0,
    null,
    false,
    '{oge,funcionarios,comercio,eeuu}',
    true
  ),
  (
    'hegseth-oge',
    'Pete Hegseth (OGE)',
    'Compras y ventas de valores declaradas por Pete Hegseth, Secretario de Defensa de EE.UU., en el formulario OGE 278-T. Los montos son tramos oficiales, no cifras exactas. La OGE publica con hasta 45 días de atraso. Declaración pública y gratuita según 5 U.S.C. § 13107. Solo informa transacciones divulgadas: no es recomendación de inversión.',
    'political_us',
    'oge_278t',
    'Pete Hegseth',
    'US',
    0,
    null,
    false,
    '{oge,funcionarios,defensa,eeuu}',
    true
  )
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  source = excluded.source,
  manager = excluded.manager,
  country = excluded.country,
  premium = false,
  tags = excluded.tags,
  is_active = true,
  updated_at = now();

-- La Fed queda fuera a propósito: desde 2022 la FOMC prohíbe a sus
-- miembros tener acciones individuales, así que un "portafolio Fed"
-- mostraría una señal falsa. Los 278-T de la Fed se pueden citar como
-- fuente, pero no arman cartera.

-- ============================================================
-- ROLLBACK:
-- delete from public.portfolios
--   where slug in ('bessent-oge', 'lutnick-oge', 'hegseth-oge');
-- ============================================================
