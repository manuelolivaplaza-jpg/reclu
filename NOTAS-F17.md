# F17 — Núcleo de borradores (canales apagados)

## Qué se hizo

Núcleo común para publicar en X, Telegram y el newsletter. Nada sale si Manu no aprobó el borrador. Por defecto no se envía nada: no hay clientes de esas redes ni llamadas a sus APIs.

- `supabase/migrations/022_publicaciones.sql`: tabla `publish_drafts`. RLS activo y sin policies. `anon` y `authenticated` no tienen GRANT. Solo `service_role`.
- `src/lib/publish/flags.ts`: `isChannelEnabled`, `publishMode`, `canSendLive`.
- `src/lib/publish/types.ts`: `Channel`, `Draft`, `Publisher`.
- `src/lib/publish/index.ts`: `publishDraft(draft, publishers)`.
- `tests/publish-core.test.ts`.

`publishDraft` no abre red ni escribe en Supabase. El `send` lo inyecta quien llama, y solo corre si se cumplen las tres: modo `live`, flag del canal exactamente `true`, estado `approved`. El resultado vuelve en el retorno y queda en una lista corta de este proceso (`recentPublishRecords`, máximo 50). Esa lista no es la fila de la base.

Si el estado no es `approved`, no se llama a `send` y el resultado es `{ skipped: false, rejected: true, reason }`. Eso no pasa la fila a `rejected`: solo niega el envío.

Si el canal está apagado o el modo es `preview`, devuelve `{ skipped: true, reason }` y no llama a `validate` ni a `send`. El modo `draft` tampoco envía.

No hay UI. El aviso legal de F16 (`src/components/legal/legal-notice.tsx`) queda para la pantalla que muestre el borrador. Este módulo no redacta el texto, no recomienda comprar ni vender, y no ejecuta órdenes (Ley 21.521). La tabla no guarda nombre, correo ni otros datos de contacto: `approved_by` es un uuid (Leyes 19.628 y 21.719).

## Variables nuevas

No se tocaron `.env*` ni `.env.example` (eso lo une F57).

| Variable | Valores | Efecto |
| --- | --- | --- |
| `PUBLISH_MODE` | `preview` (defecto), `draft`, `live` | Cualquier cosa distinta de `draft` o `live` cuenta como `preview`. `preview` y `draft` no envían. `live` puede enviar. |
| `PUBLISH_X_ENABLED` | exactamente `true` | Si no es `true`, X no se envía. `TRUE`, `1`, `yes` o vacío no activan. |
| `PUBLISH_TELEGRAM_ENABLED` | exactamente `true` | Igual, para Telegram. |
| `PUBLISH_NEWSLETTER_ENABLED` | exactamente `true` | Igual, para el newsletter. |

Dejarlas sin definir. No poner `live` ni `true` en un entorno real hasta que existan los publicadores y Manu apruebe un borrador a mano.

## Migración 022 (leída, no ejecutada)

Idempotente en una segunda pasada:

- `create extension if not exists`, `create table if not exists`, `create index if not exists`.
- `drop policy if exists` de cualquier policy pública previa. No se vuelve a crear ninguna: sin policy no hay lectura pública.
- `revoke` / `grant` se pueden repetir.
- `comment on` y `enable row level security` también.

No hay `insert`, así que no hay `on conflict do nothing`. No se sembró ninguna fila.

En el worktree están 008, 009, 014, 015, 016, 019, 020 y 021. No están 017 ni 018. Fase 0 autorizó seguir. Esta migración no las usa.

## Deudas

- No hay publicador de X, Telegram ni newsletter. `Publisher.send` es un hueco para esa capa.
- No se persiste el resultado en `publish_drafts`. `getServiceClient` no se usa, para que un test o un dry-run no escriba en Supabase. Quien apruebe debe guardar `external_id`, `sent_at`, `error` y el `status`.
- TODO(F16): la pantalla del borrador debe mostrar `legal-notice`. Este módulo no la importa porque no renderiza.
- F57 documenta las variables en `.env.example`.
- El registro en memoria se pierde al terminar el proceso. No sirve de auditoría.

## Cómo probar

```bash
npm test -- tests/publish-core.test.ts
npm run typecheck
npm run lint
npx next build
```

Los tests cubren: canales apagados si la variable no existe; `TRUE` y `1` no activan; `preview` no llama a `send` aunque el flag sea `true`; un borrador que no está `approved` no se envía ni en `live`; `draft` no envía; `live` + `true` + `approved` llama al `send` inyectado (sin red).

Verificado en este worktree:

- `npm run lint`: ok.
- `npm test`: 23 archivos, 241 tests, ok.
- `npm run typecheck`: ok después de que `next build` genera `LayoutProps`. Un `tsc` aislado, antes de ese build, marca `LayoutProps` en `src/app/layout.tsx` (peculiaridad de Next 16 ya anotada en `Agents.md`). El paso de TypeScript del build sí terminó.
- `npx next build`: compiló y typechequeó, y falló al prerender de `/accion/[symbol]` por `Date.now()` en `timeAgo` (`src/lib/utils.ts`), llamado desde `src/app/accion/[symbol]/page.tsx`. No es de este módulo. No lo toqué: el encargo solo crea archivos nuevos del núcleo.

No correr la 022 contra Supabase desde aquí. No definir los flags en `true` ni `PUBLISH_MODE=live` contra cuentas reales.
