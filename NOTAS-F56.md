# NOTAS F56 — Patrocinios rotulados (APAGADO por defecto)

## Hecho

- `supabase/migrations/042_patrocinios.sql`
  - Tabla `public.sponsorships`: `name`, `url` (solo `https://`), `body`,
    `starts_on`, `ends_on`, `placement`, `created_at`.
  - `check` de fechas (`ends_on >= starts_on`) y de `placement`.
  - `placement` solo admite ubicaciones editoriales: `home`, `explore`,
    `dashboard`, `compare`, `aprende`, `herramientas`. **No** admite
    `portfolio` ni `alerts`: un patrocinio no puede ser un portafolio ni una
    alerta, ni aparecer en tablas de posiciones o en el flujo de alertas.
  - RLS activo: lectura pública solo de campañas vigentes
    (`starts_on <= current_date and ends_on >= current_date`). Sin policies de
    escritura: escribe solo el service role.
  - Idempotente: `create extension if not exists`, `create table if not exists`,
    `create index if not exists`, `drop policy if exists` + `create policy`.
    Revisado por lectura; **no se ejecutó** contra Supabase.
- `src/components/sponsored-slot.tsx`
  - Componente de servidor. Sin `NEXT_PUBLIC_SPONSORS_ENABLED=true` devuelve
    `null` (no renderiza nada).
  - Cuando renderiza, siempre muestra la etiqueta `Patrocinado` (reutiliza
    `SPONSORED_LABEL` de `src/lib/legal.ts`, que ya existía desde F16).
  - Enlace con `rel="sponsored noopener noreferrer nofollow"`, `target="_blank"`
    y descargo: espacio pagado, no es recomendación ni cartera/alerta.
  - Defensa en runtime: descarta URLs que no sean `https://` y ubicaciones fuera
    de `SPONSORABLE_PLACEMENTS` (bloquea `portfolio` y `alerts`).
- `tests/sponsored.test.ts` (4 tests)
  - Flag apagado/ausente → HTML vacío.
  - Flag encendido → etiqueta `Patrocinado`, patrocinador y `rel="sponsored"`.
  - `portfolio`/`alerts` no son ubicaciones válidas.
  - URLs `http://` o `javascript:` se descartan.

## Variables de entorno nuevas

- `NEXT_PUBLIC_SPONSORS_ENABLED` — `"true"` para activar los slots.
  Cualquier otro valor (o ausente) los apaga. No se agregó a `.env.example`
  porque ese archivo lo unifica F57.

## Pendiente / deudas

- No se montó el slot en ninguna página todavía: falta decidir las ubicaciones
  editoriales reales (por ejemplo `explore` o `dashboard`) y pasarle datos.
  Debe montarse **fuera** de tablas de posiciones, detalle de portafolio y
  alertas.
- No hay capa de datos ni panel de administración para `sponsorships`
  (hoy se cargaría por SQL/service role).
- No hay seed: la tabla arranca vacía a propósito.
- Revisión legal/CMF de los textos de cada campaña antes de encender la flag en
  producción.

## Cómo probar

```bash
npm run typecheck
npm run lint
npm test
npx vitest run tests/sponsored.test.ts
```

Verificación de idempotencia del SQL: revisar que use `if not exists`,
`drop policy if exists` y que no tenga seeds ni `alter` no idempotentes. No
ejecutar contra la base real.

Prueba manual (sin servidor): con `NEXT_PUBLIC_SPONSORS_ENABLED` sin definir el
componente no emite HTML; con `"true"` emite el `<aside>` con la etiqueta
`Patrocinado`.
