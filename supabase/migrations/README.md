# Migraciones — orden de aplicación

Todas son idempotentes: pueden re-ejecutarse sin romper nada. Aplicar en
este orden en el SQL Editor de Supabase (o `supabase db push` si se usa
el CLI, respetando el mismo orden).

## Orden actual (archivos existentes en `supabase/migrations/`)

| # | Archivo | Qué hace |
|---|---------|----------|
| 0 | `../schema.sql` (o `../SETUP-COMPLETO.sql`) | Esquema base + seeds. SETUP incluye schema + migraciones tempranas. |
| 1 | `002_holdings_returns.sql` | Precios y `return_pct` en holdings. |
| 2 | `003_portfolio_snapshots.sql` | Snapshots históricos para gráficos. |
| 3 | `004_chat_quota.sql` | Cuotas de chat AI + historial de mensajes. |
| 4 | `004_cover_image.sql` | Columna `cover_image` en portfolios. |
| 5 | `005_assign_covers.sql` | Asignación de imágenes de portada. |
| 6 | `006_elite_plan.sql` | Restringe constraint de plan a free/pro/elite. |
| 7 | `006_elite_plan_and_13f_portfolios.sql` | Plan Elite completo: cuotas diferenciadas, portafolios 13F Wave 2/3. **Reemplaza al 006 anterior en la práctica** (ambos son idempotentes; aplicar ambos no rompe, pero basta con este). |
| 8 | `prices.sql` | Tabla de precios diarios por símbolo (sin número: aplicar después de 002). |
| 9 | `012_muro_pago.sql` | Muro de pago real: quita lectura pública de `holdings`/`portfolio_snapshots`, funciones `get_portfolio_holdings(p_slug)` y `get_portfolio_snapshots(p_slug)` con recorte por plan. **Incluir bloque `-- rollback` si se quiere revertir.** |
| 10 | `013_portafolios_tematicos.sql` | Tres portafolios temáticos + holdings semilla. |
| 11 | `014_trump_dice.sql` | Tabla `mentions` (lectura pública solo `status='verificada'`, sin políticas de escritura), portafolio `trump-dice`, 15 menciones y holdings semilla. |
| 12 | `016_insiders.sql` | Compras de ejecutivos (Form 4): tabla `insider_trades` (lectura pública, sin direcciones ni políticas de escritura) y portafolio `insiders-compras-1m`. |
| 13 | `019_trump_compra.sql` | Tabla `disclosure_trades` (lectura pública solo `verificada`), portafolio `trump-compra` (`premium=false`, source `oge_278t`) y excepción de muro para `oge_278t` / `house_ptr` / `senate_ptr`. |
| 14 | `020_afp_carteras.sql` | F14: portafolio `afp-modelo-acciones-cl` (AFP Modelo, acciones chilenas al 29-05-2026) y holdings semilla. No modifica `afp-consenso-chile`. |
| 15 | `017_musk_dice.sql` | Amplía `mentions.kind` con `critica` y `empresa_propia`, portafolio `musk-dice`, 4 menciones (URL de X) y holdings ETSY/GME al 50%. Reutiliza la tabla de la 014. La 015 sigue reservada para F9. |
| 16 | `018_inverse_cramer.sql` | Amplía `mentions.kind` con `recomienda_compra` y `recomienda_venta`. Portafolio `inverse-cramer-real`, 27 picks y holdings semilla al 2026-10-16. El proxy `inverse-cramer` no se toca. La 015 queda reservada para F9. |
| 17 | `044_corredoras_cl.sql` | F23: portafolios `bice-acciones-destacadas` y `mbi-acciones-recomendadas` (`broker_cl`, `CL`, `premium=false`). Solo filas de `portfolios`; los holdings los carga la etapa `corredoras_cl`. Aplicar después de `021_infoprobidad_agregado.sql` (y de la `043` si existe); independiente de `022-042`. Re-ejecutable. |
| 18 | `045_accionistas_anonimizar.sql` | F33-B: agrega `cl_top_shareholders.es_persona_natural` y anonimiza las personas naturales históricas como `Persona natural (#ranking)`. Aplicar después de `033_mayores_accionistas.sql`. Re-ejecutable. |
| 19 | `046_endurecer_permisos.sql` | SB1 (M3/B1/037): `revoke` de escritura a `anon`/`authenticated` en las 9 tablas públicas nuevas, `revoke execute` de `enforce_alert_rule_limits()` y función `anonimizar_accionista()` + trigger `BEFORE INSERT OR UPDATE` en `cl_top_shareholders` que fuerza la anonimización de personas naturales (mismo regex que la 045). Re-ejecutable. |
| 20 | `047_telegram_link_code.sql` | M10: RPC `create_telegram_link_code()` (`security definer`, `set search_path = ''`) que genera el código con `auth.uid()` y escribe `profiles.telegram_link_code` marcando `reclu.trusted` para el trigger de la 007. Solo `authenticated`. Re-ejecutable. |

## Migraciones que vendrán de otros frentes (reservadas)

Estos números están asignados a otros frentes en paralelo. Cuando se
fusionen las ramas, aplicar en este orden:

| # | Frente | Tema |
|---|--------|------|
| 007 | Seguridad | Endurecimiento de RLS/auth |
| 008 | Planes/alertas | Configuración de planes y alertas |
| 009 | Pagos | Cobro de suscripciones |
| 010 | Fuentes | Nuevas fuentes de datos |
| 011 | Rendimiento | Índices y optimizaciones |
| 012 | **Este frente (F6)** | Muro de pago (ya presente arriba) |
| 013 | Portafolios | Nuevos portafolios/seed |
| 015 | F9 — muro pago en /accion | RPC `get_symbol_holders(p_symbol)`: quién tiene un ticker. El rank se calcula sobre todas las posiciones del `as_of` vigente (`weight desc, id`) y después se filtra el símbolo; luego `rank <= holdings_limit_for_plan(current_user_plan())` y premium solo pagos. Aplicar después de 012. Re-ejecutable. |
| 016 | F10 - compras de ejecutivos | `016_insiders.sql`: tabla `insider_trades` y portafolio `insiders-compras-1m`. Re-ejecutable. |
| 020 | F14 | `020_afp_carteras.sql` — carteras AFP (este frente). |

## Duplicados conocidos (A8)

- Hay dos `004_*` y dos `006_*`: archivos distintos de frentes distintos,
  todos idempotentes. No renombrar (otros frentes pueden referenciarlos);
  el orden de la tabla de arriba es el correcto.
- `prices.sql` no lleva número: aplicar tras `002_holdings_returns.sql`.

## 021 — InfoProbidad agregado (F15)

`021_infoprobidad_agregado.sql`: tabla pública `infoprobidad_empresas`
(RUT, nombre de la sociedad, nemotécnico, autoridades, valor declarado,
última declaración). Sin columnas de personas. El slug `infoProbidad-cl`
no cambia. Aplicar después del esquema base. Idempotente.

## 044 — Carteras BICE y MBI (F23)

`044_corredoras_cl.sql`: filas de `portfolios` para `bice-acciones-destacadas`
y `mbi-acciones-recomendadas` (`category='broker_cl'`, `country='CL'`,
`premium=false`, `source` = `bice_cartera` / `mbi_cartera`, que es el nombre
de cada adaptador). No trae holdings semilla: los carga la etapa
`corredoras_cl` (`scrapers/stages/corredoras_cl.py`) desde los PDF públicos de
cada corredora. Aplicar después de `021_infoprobidad_agregado.sql` (y de la
`043` si existe); independiente de `022-042`. El `on conflict (slug) do update`
toca solo `description` y `source`, nunca `followers` ni `return_ytd`.
## 043 — Ocultar portafolios con cifras inventadas (D43)

`043_ocultar_demos.sql`: agrega `portfolios.replaced_by_slug` y
`portfolios.hidden_reason`, y marca `is_active = false` +
`hidden_reason = 'cifras_inventadas'` en `elon-doge-tracker`,
`trump-truth-signals`, `afp-consenso-chile` e `inverse-cramer`. Apunta
`replaced_by_slug` a la versión real (`musk-dice`, `trump-dice`,
`afp-modelo-acciones-cl`, `inverse-cramer-real`); el de `inverse-cramer` solo
se escribe si `inverse-cramer-real` existe y está activa. **No borra filas** ni
toca holdings/alerts. Se puede aplicar después de la 021 y antes o después de
las migraciones v2 (022-042): es independiente. Idempotente.

**Reversión:** `043_ocultar_demos_down.sql` (en `supabase/rollback/`, fuera de
`migrations/` para que no corra en el flujo normal) reactiva esos 4 portafolios
y limpia `replaced_by_slug`/`hidden_reason`. **El `_down` NO se aplica en el
flujo normal**; solo se corre a mano si se quiere deshacer el ocultamiento.

Pendiente conocido: las RPC de `011`, `012`, `015` y `019` ya filtran
`p.is_active = true`, así que no vuelven a exponer los ocultos. La política RLS
`portfolios public read` (`schema.sql`) también limita la lectura a
`is_active = true`, por eso el redirect usa un mapa estático como respaldo.

## Revertir el muro de pago (012)

Al final de `012_muro_pago.sql` hay un bloque comentado `-- rollback`:
restaura las policies públicas de lectura y borra las funciones.

## 045 — Anonimizar personas naturales (F33-B)

`045_accionistas_anonimizar.sql`: agrega
`cl_top_shareholders.es_persona_natural boolean not null default false` y
reescribe las filas históricas que no traen marcador societario como
`Persona natural (#ranking)`, conservando porcentaje, acciones y ranking.
Las personas jurídicas mantienen su nombre. El RUT del accionista nunca se
guarda.

**Reversión:** los nombres y RUT originales no se pueden recuperar (el
reemplazo es intencional, Leyes 19.628 y 21.719). Solo se puede deshacer el
esquema con `alter table ... drop column if exists es_persona_natural`; los
textos `Persona natural (#n)` quedan como están. Aplicar después de la `033`.
Idempotente.

## 046 — Endurecer permisos (SB1: M3, B1 y fila 037)

`046_endurecer_permisos.sql` cierra los hallazgos M3, B1 y la fila de
`037_reglas_alerta.sql` de la revisión de seguridad 2026-10-20:

- **B1:** `revoke insert, update, delete` a `anon`/`authenticated` en las 9
  tablas públicas nuevas (`activist_filings`, `spinoffs`, `buybacks`,
  `cl_dividends`, `cl_material_events`, `cl_top_shareholders`,
  `cl_mutual_funds`, `cl_mutual_fund_holdings`, `sponsorships`), cada una con
  `do $$ ... if to_regclass(...) is not null` por si alguna no existe todavía.
  Solo el `service_role` (que bypassa RLS) puede escribir.
- **Fila 037:** `revoke execute on function public.enforce_alert_rule_limits()
  from public, anon, authenticated` (la función es de trigger y solo el
  service role necesita acceso).
- **M3:** función `public.anonimizar_accionista()` (`security definer`,
  `set search_path = ''`, con `revoke execute`) + trigger
  `anonimizar_accionista` `BEFORE INSERT OR UPDATE` en
  `public.cl_top_shareholders`: si `NEW.accionista` no calza con el regex
  societario de la 045 (copiado exacto), lo reescribe como
  `Persona natural (#ranking)` y marca `es_persona_natural = true`. Si ya
  empieza con `Persona natural (#`, lo deja (idempotente).

Re-ejecutable. Aplicar después de la `045`.

**Reversión:** `drop trigger if exists anonimizar_accionista on
public.cl_top_shareholders; drop function if exists
public.anonimizar_accionista();` y repetir los `grant insert, update, delete`
que cada migración original declaraba (no hay `grant` de escritura que
restaurar: las migraciones 027–034 y 042 solo daban `grant select`).

## 047 — Código de vinculación de Telegram (M10)

`047_telegram_link_code.sql` cierra M10 de la revisión de seguridad
2026-10-20. `prepareTelegramLink` escribía `profiles.telegram_link_code`
directamente desde el cliente autenticado, pero el trigger
`a_protect_profile_columns` de la 007 revertía la columna: el flujo no
persistía. Abrir la columna a escritura directa permitiría manipular códigos
desde el navegador.

La migración agrega `public.create_telegram_link_code()`:

- `security definer` y `set search_path = ''`; todos los objetos van
  calificados con `public.`.
- Usa `auth.uid()` (no recibe parámetros) y falla si no hay sesión, así que
  solo puede escribir el perfil propio.
- Genera 128 bits en hex con `pg_catalog.gen_random_uuid()` (32 caracteres).
- Hace `perform set_config('reclu.trusted', 'on', true)` antes del `UPDATE`
  de `public.profiles`, para que el trigger de la 007 permita el cambio.
- Devuelve el código. `revoke execute` a `public`/`anon` y `grant execute`
  a `authenticated`.

Re-ejecutable. Aplicar después de la 008 (columna `telegram_link_code`).
La acción `prepareTelegramLink` llama `supabase.rpc('create_telegram_link_code')`.

**Reversión:** `drop function if exists public.create_telegram_link_code();`.
