# F53 — API de datos chilenos: claves, autenticación y límite

Rama: `v2/f53-api-datos-claves` (worktree `C:\reclu-work\f14`, base `mejoras/integracion`).
Sin push. Sin migraciones ejecutadas contra Supabase real.

## Qué se hizo

1. **`supabase/migrations/040_api_claves.sql`** (idempotente)
   - `api_keys`: `user_id` (dueño, FK a `auth.users` con `on delete cascade`),
     `name` (etiqueta opcional), `prefix` (`rcl_` + 12 hex, único y visible),
     `key_hash` (sha256 hex, único; **nunca** la clave en claro), `plan`
     (`free|pro|elite`), `revoked`, `revoked_at`, `last_used_at`, `created_at`.
   - `api_usage`: `(key_id, day)` PK, `count` y `updated_at`. Día UTC.
   - RLS: el dueño solo **lee** sus claves (`auth.uid() = user_id`);
     `insert/update/delete` revocados a `anon`/`authenticated` (escribe el
     service role desde el server action). `api_usage` sin policies.
   - RPC `consume_api_usage(uuid, date)` (`security definer`, solo
     `service_role`) para incrementar el contador del día con UPSERT.
   - Re-ejecutable: `if not exists`, `create or replace`, `drop policy if
     exists`, `drop constraint if exists` + `create`, `revoke/grant` repetibles.

2. **`src/lib/api-keys.ts`** (lógica pura, testeable)
   - `generateApiKey()` → `{ plaintext, prefix, hash }`. Formato
     `rcl_<12 hex>_<43 base64url>`; 256 bits de entropía.
   - `hashApiKey()` (sha256 hex), `verifyApiKey()` con `timingSafeEqual`
     (falla cerrado si el hash falta o está mal formado; compara contra un
     hash de relleno para no delatar si la clave existe).
   - `extractBearerToken()` + `authenticateApiKey(header, record, enabled)`:
     503 si la API está apagada, 401 si falta/es inválida, 403 si está
     revocada, y `{ plan, limit }` si es válida.
   - `apiPublicEnabled()`: **solo** `API_PUBLIC_ENABLED=true` (exacto) enciende.
   - `rateLimit()` (puro) + `apiDailyLimit()` (free 100, pro 1.000, elite
     10.000 por día) + `rateLimitHeaders()` + `apiDayKey()` (UTC).

3. **`src/app/(dashboard)/settings/api/page.tsx`**
   - Página protegida (layout de dashboard + `await connection()` +
     `export const instant = false`).
   - Lista las claves propias (nombre, prefijo enmascarado, plan, fechas,
     estado); permite crear y revocar con server actions inline
     (`useActionState` + `FormState`/`ApiKeyFormState`).
   - La clave en claro se devuelve **una sola vez** en la respuesta de la
     acción de creación (`success`/`key`), no se guarda ni se loguea.
   - Crear está bloqueado mientras `API_PUBLIC_ENABLED` no sea `true`;
     revocar funciona siempre.
   - `LegalNotice kind="fintec"` + nota de 5 U.S.C. § 13107 (datos de
     funcionarios de EE.UU. gratuitos y fuera del muro) y de Leyes 19.628 /
     21.719 (solo hash, prefijo y contador diario; sin IP ni user-agent).

4. **`src/components/api-keys-panel.tsx`** (archivo de apoyo, cliente)
   - Necesario porque `page.tsx` es un Server Component y la clave solo se
     puede mostrar desde el estado de `useActionState`. No contiene lógica
     de negocio ni acceso a datos.

5. **`tests/api-keys.test.ts`** — 24 tests: formato, hash, comparación en
   tiempo constante (correcta/incorrecta/ausente), Bearer, flag, planes,
   reinicio diario, bloqueo por límite, cabeceras y los cuatro caminos de
   autenticación (503/401/403/ok). Total del repo: 672 tests en verde.

## Variables de entorno nuevas

| Variable | Valor | Efecto |
| --- | --- | --- |
| `API_PUBLIC_ENABLED` | `true` (exacto) | Habilita crear claves y autenticar llamadas. Cualquier otro valor o su ausencia deja todo apagado. |

No se tocó `.env.example` (lo une F57). No se leyó ni modificó ningún `.env*`.

## Cómo lo consumiría el endpoint (siguiente tarea)

```ts
const token = extractBearerToken(request.headers.get("authorization"));
const prefix = token?.slice(0, "rcl_".length + 12);
const record = await service.from("api_keys").select("prefix, key_hash, plan, revoked")
  .eq("prefix", prefix).maybeSingle();
const auth = authenticateApiKey(request.headers.get("authorization"), record.data);
if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

const today = apiDayKey();
const { data: used } = await service.from("api_usage")
  .select("count, day").eq("key_id", id).eq("day", today).maybeSingle();
const decision = rateLimit({ plan: auth.plan, used: used?.count ?? 0, day: used?.day, today });
if (!decision.allowed) return Response.json({ error: "Límite diario alcanzado." }, { status: 429, headers: rateLimitHeaders(decision) });

await service.rpc("consume_api_usage", { p_key_id: id, p_day: today });
```

## Deudas / pendientes

- **No hay endpoint público todavía**: F53 entrega claves, autenticación y
  límite como librería + UI; el endpoint de datos chilenos debe usar
  `authenticateApiKey` + `rateLimit` + `consume_api_usage`. Por eso la API
  queda apagada por defecto.
- **Sincronización de plan**: `api_keys.plan` se fija al crear. Si la persona
  cambia de plan, hay que actualizar esa columna (o leer el plan vigente del
  perfil en el endpoint). Anotado como deuda para la tarea del endpoint.
- **Enlace en el sidebar**: `/settings/api` no aparece en la navegación
  porque el alcance de F53 no incluía `layout.tsx`; se llega por URL directa.
- La página no usa `window.confirm` para revocar (un clic revoca). Si se
  quiere confirmación, es un cambio de UI menor.
- `api_usage` crece una fila por clave y día; conviene una limpieza periódica
  (> 90 días) cuando la API esté encendida.

## Cómo probar

```bash
npx vitest run --maxWorkers=1 tests/api-keys.test.ts   # 24 tests
npx vitest run --maxWorkers=1                          # 672 tests
npm run typecheck
npm run lint
```

Con Supabase real (solo cuando el orquestador lo pida):
1. Ejecutar `supabase/migrations/040_api_claves.sql` dos veces seguidas en el
   SQL Editor; no debe dar error la segunda.
2. Poner `API_PUBLIC_ENABLED=true` en `.env.local`.
3. Entrar a `/settings/api`, crear una clave, copiarla (solo se muestra una
   vez), comprobar que en `api_keys` solo hay `prefix` y `key_hash`, y
   revocarla.
