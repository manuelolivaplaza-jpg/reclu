# NOTAS F19 — Publicadores Telegram (canal) y newsletter (Resend)

## Estado

Hecho y commiteado en `v2/f19-publicar-telegram-newsletter`:

- `src/lib/publish/telegram-channel.ts`
  - `telegramChannelPublisher(fetchImpl?)` implementa `Publisher` (`channel: "telegram"`).
  - Publica en el canal público (`TELEGRAM_CHANNEL_ID`), distinto del bot 1-a-1 de F4.
  - Escapa `& < > "` y envía `parse_mode: "HTML"` + `disable_web_page_preview: true`.
  - `validate` rechaza vacío y textos > 4096 caracteres.
  - Falla cerrado si falta `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID` o el flag
    `PUBLISH_TELEGRAM_ENABLED` no es exactamente `"true"`.
  - Exporta además `telegramChannel` (instancia con el `fetch` global).
- `src/lib/publish/newsletter.ts`
  - `newsletterPublisher(resend, list, options?)` implementa `Publisher`
    (`channel: "newsletter"`).
  - `resend` es un cliente estructural mínimo (`ResendClient`): alcanza con
    `new Resend(apiKey)`.
  - `list` implementa `NewsletterList.recipients()`; **F22** debe conectar ahí
    la lista real desde Supabase. Acá no se consulta nada.
  - Envía en tandas (`batchSize`, defecto 20, entre 1 y 100) y devuelve
    `externalId` del correo o `batch:<n>:<primerId>`.
  - Cada correo lleva `List-Unsubscribe: <url>`,
    `List-Unsubscribe-Post: List-Unsubscribe=One-Click` y el enlace de baja en
    el HTML.
  - Remitente: `NEWSLETTER_FROM`; si falta, `EMAIL_FROM`.
  - Falla cerrado sin remitente, con `PUBLISH_NEWSLETTER_ENABLED` apagado, con
    lista vacía, destinatario inválido o sin enlace de baja.
  - El HTML escapa cuerpo y URL, y usa el estilo sobrio de `docs/hermes-diseno.md`
    (blanco/negro, filetes de 1px, sin sombras).
- `tests/publish-channels.test.ts`
  - Escape de HTML en ambos canales.
  - Sin variables / con flag apagado no se llama a la API ni a Resend.
  - Telegram: payload exacto (`chat_id`, texto escapado, `parse_mode`,
    `disable_web_page_preview`) y `message_id` como `externalId`.
  - Newsletter: remitente preferido y fallback, cabeceras y enlace de baja en
    cada correo, lotes, lista vacía y destinatario sin baja.

## Verificación ejecutada

- `npm run typecheck` ✅
- `npm run lint` ✅
- `npm test` ✅ — 29 archivos, 316 tests (incluye los 13 nuevos de este archivo).
- `npx next build` no se corrió acá: lo ejecuta el orquestador.

## Variables nuevas (documentar en F57, no se tocó `.env.example`)

| Variable | Uso |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Token del bot que publica en el canal (ya existe para F4). |
| `TELEGRAM_CHANNEL_ID` | `@canal` o id numérico del canal público. **Nueva.** |
| `PUBLISH_TELEGRAM_ENABLED` | `"true"` habilita el canal (F17). |
| `PUBLISH_NEWSLETTER_ENABLED` | `"true"` habilita el newsletter (F17). |
| `NEWSLETTER_FROM` | Remitente del newsletter. Si falta se usa `EMAIL_FROM`. **Nueva.** |
| `RESEND_API_KEY` | Ya existente; el cliente lo recibe quien construye el publicador. |
| `EMAIL_FROM` | Fallback de remitente. |

`PUBLISH_MODE` sigue siendo el de F17 (`preview` por defecto; `live` para enviar).

## Deudas / pendientes

- **F22**: implementar `NewsletterList` contra Supabase (suscriptores activos +
  `unsubscribeUrl` por persona) y pasarla a `newsletterPublisher`.
- **F57 / integración**: registrar los publicadores en el punto de composición
  que use `publishDraft` (hoy no hay ruta que los llame; `src/lib/publish/index.ts`
  no se modificó).
- El newsletter envía un correo individual por destinatario en tandas
  concurrentes; si se quiere usar el endpoint batch de Resend, se puede cambiar
  el transporte sin tocar el contrato `Publisher`.
- No hay UI nueva en esta tarea, por lo que no aplica `legal-notice.tsx`. El pie
  del correo incluye el aviso de información pública y no asesoría.
- No se tocaron migraciones ni Supabase real.

## Cómo probar

```bash
npm run typecheck
npm run lint
npm test
npx vitest run tests/publish-channels.test.ts
```

Prueba manual (sin llamadas reales): los tests mockean `fetch` y el cliente de
Resend. Para un smoke test real haría falta configurar las variables y llamar a
`publishDraft` en modo `live` con un borrador `approved`, algo que el orquestador
puede hacer cuando exista la ruta de composición.
