# NOTAS F37 — Fecha, días de atraso y rendimiento al publicarse

Rama: `v2/f37-atraso-visible` · Migración: ninguna

## Qué se hizo

Cada alerta muestra cuándo se publicó (día, y hora si existe) en America/Santiago, con la etiqueta "hora de Chile", y los días entre la operación y esa publicación.

El panel de rendimiento del portafolio agrega la fila "Si entraste al publicarse": el retorno de la serie de niveles desde el día de la publicación más reciente hasta el último punto. Debajo va el aviso `LegalNotice` de simulación (F16). No es una recomendación ni una orden.

### Fechas que reconoce `lagDays`

- Operación: `tx_date`, `traded_at` o `trans_date` (OGE / F13).
- Publicación: `disclosed`, `report_published` (F13) o `filed_at`.
- Una fecha `YYYY-MM-DD` se lee como ese día. Un instante con hora se convierte a hora de Chile antes de contar.
- Ejemplo: `trans_date` 2026-08-21 y `report_published` 2026-10-08 → 48 días, texto "Publicado 08-10-2026 · 48 días después de la operación".
- `disclosureLagLabel` sigue diciendo "Declarado N días después de la operación" (los tests viejos no cambian).

### Retorno

`returnSincePublication(series, publishedAt)` es pura. La serie tiene que ser de niveles (precio o base 100), igual que `src/lib/performance.ts`. Entra en el primer punto en o después del día de publicación. Si ese punto está a más de 10 días, o no hay punto, devuelve null y la UI no inventa un número. Si el punto es el último de la serie, el retorno es 0.

En la página del portafolio, la fecha es la publicación oficial más nueva entre sus alertas. Si el gráfico no trae serie (métricas precalculadas o demo), se usa la serie de evolución convertida con `fromPctToLevel`.

### Archivos

- `src/lib/disclosure-lag.ts` — `lagDays`, sello de Chile, texto del badge, última publicación.
- `src/lib/entry-at-publication.ts` — retorno desde la publicación.
- `src/components/lag-badge.tsx` — el texto en alertas y en el panel.
- `src/components/alerts-feed.tsx` — usa `LagBadge`.
- `src/components/performance-panel.tsx` — fila "Si entraste al publicarse".
- `src/app/portfolio/[slug]/page.tsx` — pasa la publicación y la serie, y el badge en las alertas recientes. No estaba en la lista de la tarea; sin esto el portafolio no mostraba la fila.
- `tests/entry-at-publication.test.ts`
- `src/app/accion/[symbol]/page.tsx` — `await connection()` antes de `timeAgo`. El build abortaba en `/accion/aapl` porque `Date.now()` caía en el prerender. No es parte del atraso; desbloquea `npx next build`.

## Variables nuevas

Ninguna.

## Deudas

- El feed de alertas no calcula el retorno por alerta: no tiene serie de precios. El número vive en el portafolio, con la publicación más reciente de sus alertas, no trade por trade.
- Si la serie es mensual y el punto más cercano está a más de 10 días, la fila muestra "—" y el motivo. No se alarga la holgura para no presentar un mes entero como "el día en que se publicó".
- `supabase/functions/send-alerts` sigue mirando solo `disclosed` y `filed_at`. No se tocó (fuera de esta tarea). El correo aún no dice `report_published`.
- `npm run typecheck` (`tsc --noEmit`) sigue fallando solo en `src/app/layout.tsx` con `LayoutProps`. Es el tipo global de Next 16 que el build sí genera. `npx next build` compiló TypeScript sin ese error.
- No se abrió el sitio: esta sesión no puede levantar `npm run dev`.
- Fase 0: no se exigieron las migraciones 008, 009 y 014–021 (autorizado por el orquestador). Esta tarea no las usa.

## Cómo probar

```bash
npm test
npm run lint
npx next build
```

Los tests nuevos están en `tests/entry-at-publication.test.ts`. Los de `tests/disclosure-lag.test.ts` siguen en verde.

Con el sitio levantado (fuera de esta sesión):

1. `/alerts` — en cada ítem, "Publicado DD-MM-YYYY … hora de Chile" y los días de atraso cuando el payload trae operación y publicación.
2. `/portfolio/pelosi-tracker` (demo, sin Supabase) — la misma línea en alertas recientes y, bajo las métricas, "Si entraste al publicarse" con un porcentaje o "—".
3. Un payload OGE `trans_date: 2026-08-21` y `report_published: 2026-10-08` debe leerse como 48 días.
