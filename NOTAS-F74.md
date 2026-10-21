# F74 — Límites de Mi portafolio por plan

Rama `v2/f74-limites-plan` (desde `mejoras/integracion`). Sin push.

## Hecho

- `src/lib/plans.ts`
  - `PlanConfig` ahora incluye:
    - `portfolioMaxPositions` (free 10, pro 50, elite 200).
    - `portfolioImport` (`manual`+`csv`; pro suma `cartola`; elite suma `cartola_multi`).
    - `newsDepth` (`direct` / `direct_sector` / `all`) y `newsDelayHours`
      (free 24 h, pro/elite 0).
    - `autoAlerts` (`none` / `daily_digest` / `realtime`) y
      `autoAlertsMaxPerDay` (free 0, pro 1, elite 20).
    - `portfolioExportCsv` (solo elite).
  - Tipos nuevos: `PortfolioImportSource`, `NewsDepth`, `NewsRelation`,
    `AutoAlertsMode`, `PortfolioLimits`.
  - Helpers puros:
    - `portfolioLimitsFor(plan, trialEndsAt?, now?)`: devuelve todos los
      límites efectivos y copias de los arreglos. Un plan desconocido cae a
      Gratis; Gratis con prueba vigente usa los límites Pro.
    - `canAddPositions(plan, current, adding, trialEndsAt?, now?)`: respeta
      el borde exacto (`current + adding <= tope`) y normaliza negativos/NaN.
    - `newsRelationsFor(plan, trialEndsAt?, now?)`: relaciones habilitadas
      (`direct`; pro +`sector`; elite +`supplier`, `competitor`, `macro`).
  - `NEWS_RELATIONS_BY_DEPTH` es la tabla única de profundidad → relaciones.
  - No se creó un cupo de IA nuevo: "Pregunta a la IA" sigue usando
    `chatQuota` / `check_chat_quota`.
- `src/lib/portfolio-flags.ts` (nuevo)
  - `isMyPortfolioEnabled()` y `isNewsImpactEnabled()`: solo `=== "true"`.
- `.env.example`
  - `MY_PORTFOLIO_ENABLED="false"` y `NEWS_IMPACT_ENABLED="false"`.
- `supabase/migrations/052_limites_portafolio.sql` (nuevo, idempotente)
  - Función `public.enforce_user_holdings_limit()` (`security definer`,
    `set search_path = ''`), trigger `enforce_user_holdings_limit`
    `before insert on public.user_holdings`.
  - Lee `profiles.plan` y `trial_ends_at` con `for update` (prueba = Pro) y
    cuenta solo las filas del mismo `user_id`.
  - `service_role` no cuenta el tope (jobs internos); authenticated solo
    puede insertar en su propia cuenta.
  - No toca datos existentes: quien ya esté sobre el tope lo conserva y solo
    fallan inserts nuevos.
  - Bloque ROLLBACK comentado al final.
- Tests
  - `tests/portfolio-limits.test.ts` (17 casos, incluye flags y trial).
  - `scrapers/tests/test_migracion_052.py` (8 casos, valida el texto del SQL).
- Verificación: `npm run lint`, `npm run typecheck`, `npm test`
  (64 archivos / 749 tests) y los dos tests nuevos. `next build` no se corrió
  (lo hace el orquestador).

## Pendiente / deudas

- La migración **no se aplicó** contra Supabase real (regla de la tarea). El
  test de Python solo valida el texto; falta probar el trigger en una base de
  desarrollo con inserts concurrentes/multi-fila.
- La 050 (F58) aún no está en esta rama. El trigger funciona igual porque solo
  usa `user_id`, pero `source = 'cartola'` y las columnas nuevas dependen de
  esa migración.
- No hay UI ni endpoints nuevos en esta tarea: los flags y los helpers quedan
  listos para F60/F62/F71/F72/F73. Cualquier pantalla de Mi portafolio debe
  leer los límites con `portfolioLimitsFor()` y respetar los flags.
- No se actualizaron los bullets de pricing ni `supabase/functions/send-alerts`
  con los nuevos topes: `send-alerts` solo usa frecuencias/Telegram, no
  posiciones ni alertas automáticas de cartera propia.

## Cómo probar

```powershell
# TypeScript
npx vitest run --maxWorkers=1 tests/portfolio-limits.test.ts
npm run lint
npm run typecheck
npm test

# Migración (desde scrapers/)
uv run --with pytest --with-requirements requirements.txt pytest -q tests/test_migracion_052.py
```

Prueba manual del SQL (en una base de desarrollo, nunca producción):
1. Usuario free sin trial: insertar 10 posiciones en `user_holdings`; la 11.ª
   debe fallar con "Alcanzaste el límite de posiciones de tu plan (10
   posiciones).".
2. Usuario free con `trial_ends_at` futuro: permite hasta 50.
3. Usuario pro: 50; elite: 200.
4. `service_role` puede insertar sin tope.
