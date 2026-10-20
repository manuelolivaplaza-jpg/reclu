-- ============================================================
-- Migracion 045 (F33-B): anonimizar personas naturales en los
-- 12 mayores accionistas CMF (`public.cl_top_shareholders`).
--
-- Decision de producto: las personas juridicas se muestran con su
-- nombre; las personas naturales NO guardan nombre ni RUT. Se guardan
-- como "Persona natural (#ranking)" conservando porcentaje, acciones y
-- ranking. El ranking va en el texto porque la clave unica es
-- (rut_emisor, periodo, accionista).
--
-- Criterio: una fila es persona natural si su `accionista` NO trae
-- ninguno de los marcadores societarios de la lista (mismo criterio que
-- `es_persona_natural` en `scrapers/cmf_accionistas.py`). Ante la duda
-- se oculta (falla cerrado).
--
-- Idempotente: `add column if not exists` y un update que solo toca
-- filas sin marcador societario (reejecutarlo deja el mismo valor).
--
-- Aplicar despues de 033_mayores_accionistas.sql.
--
-- ROLLBACK: no es posible recuperar los nombres ni RUT originales; el
-- reemplazo es intencional e irreversible (Leyes 19.628 y 21.719). Para
-- deshacer solo el esquema:
--   alter table public.cl_top_shareholders drop column if exists es_persona_natural;
-- Los textos "Persona natural (#n)" quedan como estan.
-- ============================================================

alter table public.cl_top_shareholders
  add column if not exists es_persona_natural boolean not null default false;

comment on column public.cl_top_shareholders.es_persona_natural is
  'F33-B: true si la CMF publica una persona natural. Su nombre y RUT no se guardan; `accionista` queda como "Persona natural (#ranking)".';

-- Anonimiza las filas historicas que no traen marcador societario.
-- El regex replica la lista de `es_persona_natural` con limites de palabra
-- (para que 'Inc' no calce con 'Vincent' ni 'SpA' con 'Esparza'), ~*
-- cubre mayusculas/minusculas).
update public.cl_top_shareholders
set accionista = 'Persona natural (#' || coalesce(ranking::text, '?') || ')',
    es_persona_natural = true,
    updated_at = now()
where es_persona_natural = false
  and accionista !~* (
    '(^|[^[:alnum:]])(S\.A\.|S\.A\.C\.|SpA|Ltda|Limitada|Inversiones|Sociedad|Fondo|AFP|'
    || 'Banco|Corredores|Administradora|Holding|Trust|Inc|LLC|Ltd|Fund|'
    || 'Custodia|Compania|Compañia|Compañía|E\.I\.R\.L\.|Fundacion|'
    || 'Fundación|Corporacion|Corporación|Agencia)([^[:alnum:]]|$)'
  );

-- Las filas juridicas quedan explicitamente marcadas (por si alguna
-- corrida anterior las dejo en el default false).
update public.cl_top_shareholders
set es_persona_natural = false
where es_persona_natural = true
  and accionista ~* (
    '(^|[^[:alnum:]])(S\.A\.|S\.A\.C\.|SpA|Ltda|Limitada|Inversiones|Sociedad|Fondo|AFP|'
    || 'Banco|Corredores|Administradora|Holding|Trust|Inc|LLC|Ltd|Fund|'
    || 'Custodia|Compania|Compañia|Compañía|E\.I\.R\.L\.|Fundacion|'
    || 'Fundación|Corporacion|Corporación|Agencia)([^[:alnum:]]|$)'
  );
