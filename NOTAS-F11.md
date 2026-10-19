# NOTAS F11 — Elon Musk dice

Rama: `mejoras/f11-musk` · Migración: `supabase/migrations/017_musk_dice.sql`

Reutiliza `public.mentions` de la 014 (F8). No hay tabla nueva. La 015 sigue reservada para F9.

## Qué se hizo (por área)

### 1. Migración 017
- `supabase/migrations/017_musk_dice.sql` — idempotente.
- El check de `kind` de la 014 no trae nombre en el SQL. Postgres lo llama `mentions_kind_check`. La 017 lo dropea (ese nombre, y cualquier otro check de la tabla que todavía liste `compra_directa` y `elogio_acuerdo`) y lo vuelve a crear con los tipos de Trump más `critica` y `empresa_propia`.
- Portafolio `musk-dice`: nombre "Elon Musk dice", category `model`, source `musk_mentions`, manager `Elon Musk`, country `US`, premium false, followers 0, `return_ytd` null, tags `{musk, menciones, x}`.
- Cuatro menciones, `speaker = 'Elon Musk'`, `external_id` = id del post. Cada una tiene URL `https://x.com/elonmusk/status/…`.
  - ETSY, GME y CDR: `kind = 'elogio'`.
  - TSLA: `kind = 'empresa_propia'` (el texto es una crítica; el tipo que bloquea la señal es `empresa_propia`). `critica` queda permitido en el check y no se usa en estas cuatro filas.
- Holdings: ETSY y GME al 50% (`equity`, `USD`, `previous_weight` 0, `as_of` 2026-10-16). CDR no entra: cotiza en PLN y el check de `currency` no se tocó. Tesla no entra.
- Fila agregada en `supabase/migrations/README.md`.
- `elon-doge-tracker` no se borró ni se editó.

### 2. Scraper
- `scrapers/trump_dice.py`: `build_trump_dice` acepta `skip_kinds`, `skip_symbols` y `equal_weight`. `sync_mentions` acepta `speaker`, `slug`, `skip_alert_kinds` y `log_name`. Con los valores por defecto F8 no cambia. La alerta ahora también lleva `payload.source_url` (la primera URL http).
- `scrapers/musk_dice.py`: lee `scrapers/data/musk_menciones.json`. Normaliza al formato de Trump. Pesos con `build_trump_dice(..., equal_weight=True)`.
- Entrada: cierre de Nueva York (16:00 ET) si el post salió antes en un día hábil; si no, el día hábil siguiente. Las cuatro filas del JSON calzan (ETSY 2021-01-26, GME 2021-01-27, CDR 2021-01-28, TSLA 2020-05-01).
- `empresa_propia` se inserta en `mentions` y no genera alerta ni holding. `pendiente` no se inserta, no alerta y no es holding.
- `--detectar` usa `detectar_candidatas`: `$TICKER` o "buy" + nombre de una empresa del catálogo → `pendiente`. No llama a la API de X (hace falta un plan de pago; este proceso no lo tiene).
- Etapa en `scrapers/run_all.py`: `("musk_dice", "Elon Musk dice: menciones verificadas", False)`, después de `trump_dice` y antes de `radar_ia`. En `--dry-run` del orquestador se omite, igual que Trump.
- `python scrapers/musk_dice.py --dry-run` imprime ETSY 50% y GME 50%, 4 menciones y 3 alertas (Tesla sin alerta). No escribe.

### 3. UI
- La ficha con `source === 'musk_mentions'` reutiliza `TrumpMentionsList` y `getMentions`. Aviso fijo de simulación (el de F8) más: "Musk es insider de Tesla/SpaceX/xAI; esas menciones no son señal."
- Enlace a `/metodologia#musk-dice` (sección 8).
- Tipos nuevos en la lista: "Empresa propia" y "Crítica".
- Demo sin Supabase: portafolio `musk-dice` (`d48`) y holdings ETSY/GME. Las cuatro menciones salen de `demoMuskMentions`, con `DemoBadge`.
- `src/components/sections/source-line.tsx`: nombre corto "Elon Musk".
- `docs/sources.md`: fila y sección de la fuente.

### 4. Build de `/accion`
- `npm run build` se caía en `/accion/nvda`: `timeAgo` usa `Date.now()` y la página se prerenderizaba. Ya tenía `instant = false` y no llamaba `connection()`.
- Se agregó `await connection()` al inicio de `AccionPage`, el mismo patrón que la ficha de portafolio. No cambia la ficha de Musk.

### 5. Tests
- `scrapers/tests/test_musk_dice.py`: empresa propia sin alerta ni holding; entradas antes y después de la apertura (y Tesla el mismo día); pendiente que no entra; URL de X obligatoria; pesos 50/50.
- `tests/mentions-list.test.ts`: etiquetas `empresa_propia` y `critica`, y las cuatro menciones demo con URL de X (Tesla sigue visible).

## Verificación ejecutada
- `uv run --with httpx --with pytest --with supabase python -m pytest scrapers/tests -q` — 20 passed (los de F8 siguen ahí).
- `uv run python -m py_compile` de `musk_dice.py`, `trump_dice.py` y `run_all.py` — OK.
- `uv run --with httpx --with supabase python scrapers/run_all.py --list` — `musk_dice` opcional, después de `trump_dice` y antes de `radar_ia`.
- `uv run --with httpx --with supabase python scrapers/musk_dice.py --dry-run` — ETSY 50, GME 50, Tesla sin alerta. No escribió.
- `npm run lint` — OK.
- `npm test` — 208 tests, 18 archivos, OK.
- `npm run build` — OK. `/accion/[symbol]` queda en prerender parcial (◐), igual que antes del fallo de `Date.now()`.
- `npm run typecheck` — OK, después de ese build.
- No se levantó servidor, no se hizo `git push`, no se abrió `.env*`, no se tocó Supabase real. La ficha no se abrió en el navegador.

## Pendiente / qué debe configurar Manu
1. Aplicar `supabase/migrations/017_musk_dice.sql` en el SQL Editor, después de la 014. Es idempotente. No se ejecutó contra Supabase real.
2. Decidir si desactiva `elon-doge-tracker` (`is_active=false`) cuando "Elon Musk dice" tenga datos reales. No borrarlo: viene de la 006, con source `public_mentions`, premium y followers y return inventados.
3. La API de X no está conectada. `--detectar` no llama a la red. Para candidatas en vivo hace falta un plan de pago y cumplir los términos (post embebido o enlazado, con atribución). Hoy solo está el archivo verificado.
4. `critica` está en el check y no hay filas con ese tipo. Tesla quedó como `empresa_propia`.

## Decisiones documentadas
- Viabilidad baja como portafolio propio: se integró al motor de menciones de F8, no se duplicó la tabla.
- La frase de la tarea dice "antes de la apertura". Las cuatro fechas verificadas (y la nota de GME, "después del cierre") calzan con el cierre de las 16:00 ET, no con la campana de las 9:30. Tesla se publicó a las 11:11 ET —ya había abierto— y la tabla igual entra el 2020-05-01. El código sigue esa tabla. No se saltan feriados de EE.UU.; ninguna de las cuatro fechas lo necesita.
- Se guarda solo id, fecha, cita corta y URL de X. El contexto de CNBC (2021-01-29) está en la metodología y en `docs/sources.md`, no como `source_url` de la mención.
- Excluidas y el motivo siguen en el JSON (Signal Advance, Sandstorm, Ryanair, mRNA, Zhipu, Tesla/SpaceX como empresas propias). No se insertan.
- CDR se muestra en la lista de menciones y no en la composición, porque PLN no está en el check de `currency`.
- Comprar cuando Musk elogió una acción ajena perdió en los tres casos. Eso se dice en la metodología. La UI no lo presenta como señal.
