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

## Revertir el muro de pago (012)

Al final de `012_muro_pago.sql` hay un bloque comentado `-- rollback`:
restaura las policies públicas de lectura y borra las funciones.
