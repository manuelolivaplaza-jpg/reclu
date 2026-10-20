# SD1 — Seguridad puntual (M8, M10 y search_path de 023)

Rama `v2/sd1-seguridad-puntuales2` desde `mejoras/integracion`. Sin push.

## Hecho

### M8 — `/api/explain-alert` ya no explica texto del cliente
- `src/lib/explain-prompt.ts`: nuevo `explainAlertIdSchema` (`{ alertId: uuid }`).
  Se conserva `explainAlertRequestSchema` para validar la alerta que arma el
  servidor antes de mandarla al modelo.
- `src/app/api/explain-alert/route.ts`: recibe solo `alertId`, lee la fila de
  `alerts` con `is_published = true` + join a `portfolios` y explica ESE
  contenido (helper `explainInputFromRow`). Orden: parseo (400) → lookup
  (404 si no existe / 500 si falla la lectura) → sin `OPENROUTER_API_KEY`
  (503) → cuota → OpenRouter.
- `src/components/alerts-feed.tsx`: el fetch manda `{ alertId }`.
- `tests/explain-alert.test.ts`: texto arbitrario sin `alertId` → 400;
  `alertId` inexistente/no publicado → 404; `alertId` no uuid → 400.

### M10 — código de Telegram vía RPC
- `supabase/migrations/047_telegram_link_code.sql`: `public.create_telegram_link_code()`
  (`security definer`, `set search_path = ''`, `auth.uid()`, 32 hex con
  `pg_catalog.gen_random_uuid()`, `set_config('reclu.trusted','on',true)` antes
  del UPDATE, `revoke` a public/anon y `grant` a authenticated).
- `src/app/actions/settings.ts`: `prepareTelegramLink` llama
  `supabase.rpc("create_telegram_link_code")`; se quitó el update directo y el
  `randomBytes`.
- `tests/telegram-link-code.test.ts`: sin sesión no llama la RPC; plan free no
  llama; Pro llama y revalida; error de RPC → error genérico.

### 023 — `search_path` de las 3 funciones
- `supabase/migrations/023_newsletter.sql`: las 3 funciones `security definer`
  pasaron a `set search_path = ''`. Dentro de las funciones todos los objetos
  no-`pg_catalog` van calificados: tablas `public.newsletter_subscribers` y
  `public.uuid_generate_v4()` (incluido el default de `confirm_token` en el
  ON CONFLICT). Los defaults de la tabla también quedaron calificados sin
  efecto adverso.

### Documentación
- `supabase/migrations/README.md`: fila 20 + sección “047”.

## Verificación
- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm test` ✅ — 51 archivos, 588 tests.
- `npx eslint` sobre los archivos tocados ✅ (parte del lint global).

## Pendiente / a tener en cuenta
- **Aplicar `047_telegram_link_code.sql` en la base** (no se tocó Supabase
  real). Orden: después de `008_planes_alertas.sql`.
- **M8 en modo demo**: los ids de `demo-data.ts` no son UUID (`a1`, `a2`…),
  así que el botón “Explicar” en modo demo ahora responde 400. Es el
  comportamiento pedido (solo se explican alertas reales publicadas en la
  base); si se quiere explicar en demo habría que cargar alertas demo en DB.
- No se tocó `007`; la RPC 047 depende de que el trigger
  `a_protect_profile_columns` esté aplicado (ya lo está en la línea base).
- Sin push, como pidió el orquestador.

## Cómo probar
```bash
npm run lint && npm run typecheck && npm test
# M8: npx vitest run tests/explain-alert.test.ts
# M10: npx vitest run tests/telegram-link-code.test.ts
```
