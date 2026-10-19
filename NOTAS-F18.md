# NOTAS F18 — Adaptador de X (OAuth 1.0a)

Rama: `v2/f18-publicar-x` (worktree `C:\reclu-work\f17`). Sin push.

## Qué se hizo

- `src/lib/publish/x.ts` — `xPublisher()` implementa el `Publisher` de F17 para
  `POST https://api.x.com/2/tweets`:
  - Lee las 5 variables de X con `process.env` **dentro** de cada llamada
    (`readXEnv()`), nunca al importar el módulo.
  - Si falta alguna de las 4 credenciales de publicación,
    `validate`/`send` lanzan `X no configurado`.
  - Firma OAuth 1.0a HMAC-SHA1 con `node:crypto`.
  - El cuerpo JSON `{ text }` **no** entra en la base de firma (OAuth 1.0a
    firma solo parámetros del protocolo + query string).
  - URL exacta `https://api.x.com/2/tweets`, `redirect: "error"` (no sigue
    redirecciones), válido solo con 2xx.
  - Límite de 280 caracteres contando cada URL como 23 (`weightedLength`).
  - No loguea claves, tokens ni la cabecera `Authorization`; en errores solo
    se propaga el status HTTP.
- `src/lib/publish/x-read.ts` — `getPostMetrics(id)` con `X_BEARER_TOKEN`
  (app-only, `public_metrics`). Valida que el id sea numérico.
- `tests/publish-x.test.ts` — 11 tests: vector de firma de la documentación
  oficial de X (`hCtSmYh+iHYCEqBWrE7C7hYmtUk=`, citando
  https://docs.x.com/fundamentals/authentication/oauth-1-0a/creating-a-signature),
  codificación RFC 3986, largo ponderado, `fetch` mockeado, "sin variables no
  hay llamada" y "ningún log contiene secretos".

## Variables nuevas (NO se tocó `.env.example`, lo une F57)

| Variable | Uso |
| --- | --- |
| `X_API_KEY` | Consumer key de la app (OAuth 1.0a) |
| `X_API_SECRET` | Consumer secret de la app (clave de firma) |
| `X_ACCESS_TOKEN` | Token de la cuenta de Reclu (contexto de usuario) |
| `X_ACCESS_SECRET` | Secret del token de la cuenta |
| `X_BEARER_TOKEN` | App-only. Solo lecturas (`x-read.ts`); nunca firma ni publica |

Los flags de F17 (`PUBLISH_MODE`, `PUBLISH_X_ENABLED`) siguen mandando: sin
`PUBLISH_MODE=live` y `PUBLISH_X_ENABLED=true`, `publishDraft` no llama a
`send`.

## Deudas / decisiones

- `validate` exige las 4 credenciales OAuth de publicación; el Bearer se lee
  pero **no** bloquea el envío (es solo para lecturas). Se interpretó así la
  nota "X_BEARER_TOKEN es app-only y sirve solo para lecturas".
- El largo ponderado cuenta puntos de código y URLs de 23, pero no aplica el
  peso 2 de rangos CJK/emoji ni normalización NFC de X. Si se necesita exactitud
  total, ampliar `weightedLength`.
- El ejemplo de la doc de X es `application/x-www-form-urlencoded` (v1.1), por
  eso su base de firma incluye `status` y `include_entities`; el test reproduce
  ese vector para validar el algoritmo, mientras que `oauthHeader` de producción
  firma JSON y excluye el cuerpo.
- No se integró el publicador en ninguna ruta ni cron (fuera de alcance); se
  consume con `publishDraft(draft, [xPublisher()])`.
- `getPostMetrics` no tiene tests propios (cobertura opcional pedida en F18).

## Cómo probar

```bash
npm run typecheck   # 0 errores
npm run lint        # 0 errores
npm test            # 322 tests (30 archivos), incluye tests/publish-x.test.ts
```

No se requieren llamadas reales a X: `fetch` va mockeado en los tests.
