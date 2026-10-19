# NOTAS F20 — Redactor automático de borradores desde las alertas

Rama: `v2/f20-publicar-redactor` (worktree `C:\reclu-work\f17`). Sin push.
Base: `mejoras/integracion` con F18/F19 ya fusionadas y migración
`022_publicaciones.sql` presente.

## Qué se hizo

- `src/lib/publish/compose.ts`
  - `composeFromAlert(alert, portfolio, channel)` es pura (sin env, sin red,
    sin Supabase).
  - Texto en español con fecha de divulgación (o `created_at` como respaldo),
    días de atraso (`lagDays`/`formatChileStamp` de `disclosure-lag.ts`) y
    enlace `https://reclu.cl/portfolio/[slug]` con
    `utm_source=reclu&utm_medium=<canal>&utm_campaign=alertas`.
  - `PUBLISH_DISCLAIMER = "No es recomendación de inversión."` se agrega
    siempre, en los tres canales.
  - X: recorta el cuerpo para no pasar de 280 caracteres ponderados
    (reutiliza `weightedLength`/`X_MAX_LENGTH` de `x.ts`; cada URL pesa 23).
  - InfoProbidad: no usa `alert.title` ni `alert.summary` (pueden nombrar
    personas). Solo redacta con `payload.nombre` (empresa) y el conteo
    `payload.autoridades`, y deja explícito "Datos agregados sin nombres".
- `src/app/api/publish/draft/route.ts`
  - `POST` con `Authorization: Bearer ${CRON_SECRET}` (comparación en tiempo
    constante; 503 si falta el secreto; 401 si no coincide).
  - Lee alertas publicadas de las últimas 24 h con severidad `high`/`medium`,
    descarta `scraper_error` y portafolios sin fuente pública.
  - Fuente pública = `portfolios.source` no vacío y distinto de
    `model`, `manual`, `demo`, `internal`.
  - Genera hasta 3 borradores (`x`, `telegram`, `newsletter`) por alerta y
    hace upsert en `publish_drafts` con `status = "draft"`, `preview_url` y
    `payload` con metadatos (sin datos de contacto).
  - Idempotencia sin migración nueva: el `id` es determinista
    (`sha256(alerta:canal)` con formato UUID) y el upsert usa
    `onConflict: "id", ignoreDuplicates: true`. Si un borrador ya existe no se
    pisa (por ejemplo, uno aprobado). Además se consultan los pares
    alerta+canal existentes para no recomponerlos.
  - No envía nada: no importa publicadores ni llama a X, Telegram o Resend.
- `tests/publish-compose.test.ts` — 6 tests:
  - X ≤ 280 ponderados con fecha, atraso, enlace UTM y aviso.
  - Recorte de un resumen largo sin perder enlace ni aviso.
  - Aviso legal y UTM en los tres canales.
  - Alerta sin fechas: usa `created_at` y avisa que el atraso no fue informado.
  - InfoProbidad: no aparece el nombre de la persona del título/resumen; sí la
    empresa y el conteo de autoridades.
  - Pureza: mismo input, mismo output.

## Variables nuevas

Ninguna. Se usan las existentes:

| Variable | Uso |
| --- | --- |
| `CRON_SECRET` | Autoriza `POST /api/publish/draft` |
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente service role |
| `SUPABASE_SERVICE_ROLE_KEY` | Leer alertas/portafolios y escribir `publish_drafts` |

No se tocó `.env.example` (lo une F57).

## Deudas / pendientes

- **Workflow**: el orquestador decide si agrega la llamada a
  `POST /api/publish/draft` en `.github/workflows/scrapers.yml` después de
  `/api/run-pipeline`. No se editó el workflow.
- No hay índice único `(source_alert_id, channel)`; la idempotencia se
  resuelve con el `id` determinista. Si más adelante se quiere upsert por par,
  agregar el índice en una migración nueva.
- `composeFromAlert` usa `payload.nombre` como nombre de empresa en
  InfoProbidad (convención del scraper). Si una fuente futura usara `nombre`
  para una persona, habría que sanearlo antes.
- No hay test de la ruta (solo de la composición). La ruta queda cubierta por
  typecheck/lint y por el patrón ya probado de `run-pipeline`.
- `npx next build` no se corrió acá: lo ejecuta el orquestador.
- `scrapers/data/v2/F20/` no existía en el worktree; los tests usan fixtures
  propios con el contrato de `Alert` y los payloads de `disclosure-lag.ts`.

## Cómo probar

```bash
npm run typecheck
npm run lint
npm test
```

Para probar la ruta en local (sin tocar Supabase real) hace falta un proyecto
de prueba con `022_publicaciones.sql` aplicada y las variables de arriba:

```bash
curl -X POST http://localhost:3000/api/publish/draft \
  -H "Authorization: Bearer $CRON_SECRET"
```

Sin `CRON_SECRET` responde 503; con un secreto distinto, 401. No publica ni
envía nada: solo crea filas `draft` en `publish_drafts`.
