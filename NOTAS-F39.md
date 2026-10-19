# NOTAS-F39 — Reglas de alerta a medida

Rama `v2/f39-reglas-alerta-ui`. Sin push.

## Qué se hizo

El usuario puede crear y borrar reglas desde Ajustes → «Mis reglas».

- `supabase/migrations/037_reglas_alerta.sql`: tabla `alert_rules` (`user_id`, `kind`, `value`, `channel`, `active`). `kind` es `ticker | portfolio | source | min_amount`. `channel` es `email | telegram | both`. RLS de lectura, alta, cambio y baja solo para el dueño. El trigger `enforce_alert_rule_limits` valida el valor, deja Telegram solo en Pro, Elite o prueba vigente, y corta el alta en 3 reglas (gratis) o 50 (Pro, Elite y prueba).
- `src/lib/alert-rules.ts`: esquema Zod y `ruleMatches(rule, alert)`, pura. No consulta la base ni mira el canal.
- `src/app/actions/alert-rules.ts`: crear y borrar, con `useActionState` / `FormState`.
- `src/components/alert-rules-form.tsx` y una sección nueva en `src/app/(dashboard)/settings/page.tsx`. El resto de Ajustes no se reescribió.
- `tests/alert-rules.test.ts`.

Ejemplos que cubre el matcher: símbolo `NVDA` en cualquier portafolio, portafolio o persona `Pelosi` (slug, nombre, manager o lista de acumulación), fuente exacta (`house_disclosure`) y monto mínimo en dólares.

## Variables nuevas

Ninguna. No se tocó `.env.example` (lo une F57).

## Deudas

- Elite queda en 50, el mismo tope que Pro. El encargo fijó gratis 3 y Pro 50, y no dio un número distinto para Elite.
- La pantalla crea y borra. La columna `active` existe y una regla con `active: false` no dispara, pero no hay botón de pausa.
- `ruleMatches` todavía no está conectado a `detect-changes` ni a `send-alerts`. Esta fase es el modelo y la UI. Quien envíe las alertas tiene que llamar al matcher.
- El tipo `Alert` no trae `portfolio.source`. Para una regla de fuente hay que pasar `portfolio.source` o `payload.source`.
- El monto usa `payload.value_usd`, `amount_usd`, `notional_usd`, `amount` o `amount_min` / `amount_max`. Si no hay cifra, lee un rango del título (`$1M–$5M`) y se queda con el extremo alto. La comparación es inclusiva: US$1.000.000 entra.
- La 037 lee `profiles.plan` y `profiles.trial_ends_at` (migración 008). Si 008 no está aplicada, el `CREATE FUNCTION` igual pasa y el `INSERT` falla al ejecutarse.
- No se corrió la migración contra Supabase.
- No se abrió el navegador: esta sesión no permite levantar un servidor.

## Cómo probar

1. En el SQL Editor, ejecutar `supabase/migrations/037_reglas_alerta.sql` dos veces. La segunda no debe fallar. No se hizo en esta sesión.
2. Con sesión, abrir `/settings`. La sección «Mis reglas» queda debajo de Telegram.
3. Crear símbolo `NVDA` por correo. Tiene que aparecer en la lista.
4. Crear la misma otra vez: «Ya tienes una regla igual.»
5. En el plan gratis, la cuarta regla responde que se alcanzó el límite.
6. En gratis, Telegram sale deshabilitado. Si se fuerza el formulario, el servidor lo rechaza.
7. `npm test` incluye `tests/alert-rules.test.ts`.

## Revisión de idempotencia (solo lectura, sin ejecutarla)

La 037 se puede correr dos veces porque usa:

- `create table if not exists`
- `create index if not exists` y `create unique index if not exists`
- `drop policy if exists` antes de cada `create policy`
- `create or replace function`
- `drop trigger if exists` antes de `create trigger`
- `revoke` y `grant`, que se pueden repetir

No usa `drop table` ni borra filas.

## Verificación de esta sesión

- `npm run typecheck` en verde después del build (en un worktree sin `.next/types`, el primer `tsc` marca el `LayoutProps` conocido de Next 16; el build lo genera y el `tsc` siguiente pasa).
- `npm run lint` en verde.
- `npm test`: 26 archivos, 279 tests, en verde.
- `npx next build` en verde. `/settings` sigue en prerender parcial.
