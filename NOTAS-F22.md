# F22 — Newsletter semanal con doble opt-in

Rama: `v2/f22-newsletter` (desde `mejoras/integracion`). Sin push.

## Qué se hizo

### Migración `supabase/migrations/023_newsletter.sql`
- Tabla `public.newsletter_subscribers`: `email` único (normalizado a minúsculas),
  `status` (`pending` / `confirmed` / `unsubscribed`), `confirm_token` y
  `unsub_token` (uuid independientes), `consent_text`, `consent_at`, `source`,
  `created_at`, `confirmed_at`, `unsubscribed_at`.
- RLS activa **sin policies**: `anon` y `authenticated` no leen ni escriben.
  Solo `service_role` tiene GRANT sobre la tabla y las funciones.
- Alta únicamente por `newsletter_subscribe(p_email, p_consent_text, p_source)`,
  `security definer`: valida formato, exige texto de consentimiento y aplica un
  tope de 60 altas nuevas por hora (`v_max_per_hour`). Devuelve `true` aunque el
  correo ya existiera (no revela membresía) y reactiva como `pending` a quien se
  había dado de baja.
- `newsletter_confirm(p_token)` y `newsletter_unsubscribe(p_token)` también
  `security definer`, sin acceso directo a la tabla.
- Idempotente: `create table if not exists`, `add column if not exists`,
  `create [unique] index if not exists`, `create or replace function`,
  `drop policy if exists`, `revoke/grant` repetibles. No inserta filas.
  **No se ejecutó contra Supabase real.**

### API (`src/app/api/newsletter/`)
- `subscribe/route.ts`: `POST` con zod (`email`, `consent: true`, `source`).
  Llama a la RPC y, solo si hay `RESEND_API_KEY` + `NEWSLETTER_FROM`/`EMAIL_FROM`,
  envía el correo de confirmación por la API HTTP de Resend. Sin claves, la fila
  queda `pending` y no se envía nada. La respuesta no distingue correo nuevo de
  existente. `429` si la RPC corta por límite.
- `confirm/route.ts`: `GET ?token=…` valida uuid y confirma. Redirige a
  `/?newsletter=confirmado` o `/?newsletter=invalido`.
- `unsubscribe/route.ts`: `GET` muestra una página mínima con botón (los
  clientes de correo prefetchean enlaces, no se da de baja solo por abrir).
  `POST` ejecuta la baja; acepta `List-Unsubscribe-Post` de un clic y responde
  JSON, o HTML cuando viene de formulario.

### UI
- `src/components/newsletter-signup.tsx`: formulario cliente con correo,
  casilla de consentimiento obligatoria y enlace a `/privacidad`. El texto dice
  que el correo se usa **solo** para enviar el resumen semanal y que la baja
  está disponible en cualquier momento (Ley 19.628 / 21.719). Píldora blanca
  sobre el footer negro, filetes de 1px, sin sombras.
- `src/components/site-footer.tsx`: cuarta columna con el formulario. En `md`
  pasa a dos columnas; en `lg` a la grilla de cuatro.

### Redactor semanal
- `src/lib/publish/weekly.ts`:
  - `composeWeekly(alertsDeLaSemana, { now?, maxItems? })` es puro (no lee
    entorno, no consulta Supabase, no envía).
  - Ordena por variación absoluta de peso, luego severidad y luego fecha;
    toma los 5 primeros (máximo configurable 1–10).
  - Cada movimiento lleva fuente: `payload.source_url` si existe; si no, el
    enlace público `/portfolio/<slug>` con UTM `utm_source=reclu` y
    `utm_medium=newsletter`.
  - Incluye fecha de divulgación y atraso cuando el payload lo trae.
  - InfoProbidad se redacta como agregado: no copia `title` ni `summary` que
    puedan nombrar personas.
  - Devuelve un `WeeklyDraft` (`channel: "newsletter"`, `status: "draft"`,
    `body`, `payload.subject`, rango semanal, `alert_ids`, `positions`) listo
    para insertar en `publish_drafts` y aprobar en `/admin/publicaciones`.
  - Semana vacía: texto breve que también requiere aprobación.
- `tests/newsletter.test.ts`: top 5 y orden, fuentes, enlaces, asunto/rango,
  semana vacía, anonimización de InfoProbidad, tope de movimientos, esquema zod
  del alta, texto de consentimiento y chequeos de idempotencia/seguridad del SQL.
  Ningún test llama a Resend ni a Supabase.

## Variables de entorno
No se agregaron variables nuevas a `.env.example` (lo une F57). Se reutilizan:

| Variable | Uso |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | cliente de servicio de las rutas |
| `SUPABASE_SERVICE_ROLE_KEY` | RPC de alta/confirmación/baja (solo servidor) |
| `RESEND_API_KEY` | opcional: correo de confirmación |
| `NEWSLETTER_FROM` / `EMAIL_FROM` | remitente del correo de confirmación |
| `NEXT_PUBLIC_SITE_URL` | base del enlace de confirmación (fallback `https://reclu.cl`) |

Sin `RESEND_API_KEY` y remitente el alta queda `pending` y no se envía correo
(modo desarrollo). Confirmar y dar de baja funcionan igual.

## Deudas / pendientes
- No hay aún un cron o endpoint que llame a `composeWeekly` y **inserte** el
  borrador en `publish_drafts`. La función entrega el objeto listo; falta el
  disparador semanal (candidato a una tarea posterior o al orquestador).
- `newsletterPublisher` (`src/lib/publish/newsletter.ts`) sigue esperando una
  implementación de `NewsletterList` conectada a `newsletter_subscribers`
  (`confirmed`, con `unsub_token`). No se tocó ese archivo en F22.
- La home no muestra el mensaje de `?newsletter=confirmado` / `invalido`; hoy
  solo redirige. Falta un aviso visible.
- El tope de 60 altas/hora es global (no por IP) y está en la función SQL.
- No se implementó doble opt-in por email transaccional con reintentos ni cola.
- `scripts`/Supabase: la migración no se aplicó en remoto (regla de la tarea).

## Cómo probar
```bash
npm run typecheck
npm run lint
npm test        # 45 suites / 528 tests
```

Prueba manual (con Supabase y migración 023 aplicada en un entorno de prueba):
1. Enviar el formulario del footer. Debe aparecer una fila `pending` con
   `consent_text` y `source = 'footer'`.
2. Sin marcar la casilla, la API responde 400 y no escribe.
3. Abrir `/api/newsletter/confirm?token=<confirm_token>`: la fila pasa a
   `confirmed` y redirige a `/?newsletter=confirmado`.
4. Abrir `/api/newsletter/unsubscribe?token=<unsub_token>` y confirmar: pasa a
   `unsubscribed`. Repetir el POST responde `ok`.
5. `composeWeekly` se prueba sin red en `tests/newsletter.test.ts`.
