# F1 — Seguridad

Rama: `mejoras/f1-seguridad`. No hay push. La migración 007 no se modificó.

## Qué se hizo

El asistente deja de fiarse del navegador. Con sesión, `POST /api/chat` llama a la RPC `check_chat_quota` (service role, id de la sesión) antes de OpenRouter. Sin sesión, hashea la IP y llama a `check_anon_chat_quota(hash, 2)`; si no hay service key o la RPC falla, un Map en memoria aplica el mismo tope de 2 por día UTC. El 429 trae un texto en español y cuándo se renueva. Pro y Elite usan `isPaidPlan` / `isElitePlan` (Elite: tope semanal de la 007, 500). El cuerpo se valida con zod: mensaje 1–2000, historial máx. 20, roles `user|assistant`, slug opcional `^[a-z0-9-]{1,80}$`. Si llega un slug, el servidor lee top 15 posiciones (primero `get_portfolio_holdings`, si no la tabla `holdings`) y las últimas 5 alertas publicadas. No se usa contexto armado por el cliente. En modo demo (sin Supabase real) ese contexto sale del catálogo demo.

Acciones y rutas: login/registro (correo, clave, ruta `next` sin open redirect), ajustes (nombre, frecuencia, canal), holdings (símbolo, peso, máx. 100) y follow (uuid, nunca un `user_id` del cliente). Si el trigger de follows de la 007 rechaza el insert, la API muestra el texto amigable. `POST /api/run-pipeline` exige `CRON_SECRET` siempre.

Se borró `src/app/api/chat/route.ts.bak`.

## Archivos

- `supabase/migrations/007_seguridad_rls.sql` — ya estaba; no se tocó
- `src/lib/chat-limits.ts`, `src/lib/chat-guard.ts`, `src/lib/validation.ts`
- `src/lib/supabase/service.ts` — ya estaba
- `src/app/api/chat/route.ts`, `src/app/api/follow/route.ts`, `src/app/api/run-pipeline/route.ts`
- `src/app/actions/auth.ts`, `holdings.ts`, `settings.ts`
- `src/components/ai-chat-widget.tsx` — manda el slug y muestra el 429
- `tests/validation.test.ts`, `tests/chat-limits.test.ts`, `tests/holdings.test.ts`
- `.env.example` — `CHAT_RATE_SALT`, `CRON_SECRET`

## Cómo probar

- `npm test` — 53 tests en verde (incluye esquemas y el Map anónimo).
- `npm run lint` — verde.
- `npm run build` — verde (TypeScript del build incluido).
- `npm run typecheck` suelto sigue marcando `LayoutProps` en `src/app/layout.tsx`. Es el caso conocido del proyecto: el tipo lo genera el build. No lo toqué.
- Chat inválido: `POST /api/chat` con `{"messages":[]}` → 400, sin llamar a OpenRouter.
- Con sesión y sin la 007 aplicada, el chat responde 503 y no llama al modelo.
- Anónimo: la tercera pregunta del día → 429.

No hay navegador en esta sesión. No recorrí el widget a mano.

## Qué debe hacer Manu

1. En el SQL Editor, aplicar `supabase/migrations/007_seguridad_rls.sql` si aún no está. Es idempotente. No aplica otras migraciones desde aquí.
2. Variables (vacías en `.env.example`, valores reales solo en `.env.local` / Vercel):
   - `SUPABASE_SERVICE_ROLE_KEY` — sin ella el chat con sesión responde 503 y el anónimo cae al Map del proceso.
   - `CHAT_RATE_SALT` — opcional; cualquier string largo. Mejora el hash de IP.
   - `CRON_SECRET` — ahora obligatoria. Sin ella el pipeline responde 401.
   - `OPENROUTER_API_KEY` y `OPENROUTER_MODEL` siguen igual.
3. Si `check_chat_quota` responde permission denied con la service key, en el SQL Editor: `grant execute on function public.check_chat_quota(uuid) to service_role;` La 007 revoca `anon` y `authenticated` y no hace ese grant explícito (sí lo hace para la RPC anónima).
4. No hay cuenta externa nueva.

## Riesgos y pendientes

- El cupo se descuenta al pasar la RPC, aunque OpenRouter falle después.
- `reset_at` de `check_chat_quota` es el inicio de la ventana. El texto suma 1 día (gratis) o 7 (pro/elite). El anónimo ya trae la medianoche siguiente.
- El Map anónimo no se comparte entre instancias de Vercel. El límite real es la RPC.
- `alert_channel` (`email` | `telegram`) y `weekly_digest` se validan y no se escriben: `profiles` todavía no tiene esas columnas. `TODO(integración)` en `settings.ts`.
- `get_portfolio_holdings` llega con la migración 012 (otro frente). Hasta entonces se leen `holdings` directo, con el RLS del usuario.
- El widget mantiene además el contador local de 2 preguntas anónimas.
- No se hizo push, deploy, ni SQL contra la base real.
