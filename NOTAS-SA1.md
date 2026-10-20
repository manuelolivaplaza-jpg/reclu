# SA1 — /compare sin holdings completos en el cliente

Rama: `v2/sa1-compare-muro` (desde `mejoras/integracion`).
Hallazgo de origen: `docs/revision-seguridad-2026-10-20.md` — A1 (severidad alta).

## Hecho

1. **Nuevo módulo puro** `src/lib/compare-overlap.ts`:
   - `visibleHoldingsForRole()` normaliza símbolos y recorta a
     `HOLDING_LIMITS[role]` (anon 5 / free 10 / paid ∞).
   - `computeCompareCross()` replica en servidor el cruce que antes hacía el
     cliente (solape = suma de los menores pesos compartidos).
   - `buildComparePayload()`:
     - excluye portafolios `premium` para `anon`/`free` (`canViewPremium`),
     - recorta cada cartera al límite del rol **antes** de calcular,
     - devuelve solo resúmenes agregados: `slug`, `name`, `returnYtd`,
       `holdingsCount`, `overlapPct` vs. la cartera del usuario,
       `sharedSymbols` (solo posiciones visibles) y `alignment`,
     - precalcula los cruces entre pares de portafolios permitidos
       (`pairs`) para mantener el modo "Cruzar dos carteras".
   - El payload **no incluye ningún array completo de holdings**.

2. **`src/app/(dashboard)/compare/page.tsx`**:
   - obtiene el plan con `getProfile()` + `roleFor()` (mismo patrón que
     `app/portfolio/[slug]/page.tsx`),
   - filtra premium antes de leer holdings con el cliente de servicio,
   - calcula el payload en servidor y pasa a `PortfolioManager` /
     `AlignmentPanel` solo `portfolios` y `pairs`.

3. **Componentes cliente**:
   - `portfolio-manager.tsx`: eliminó `computeCross` local; resuelve el cruce
     desde `pairs` (soporta A/B invertidos).
   - `alignment-panel.tsx`: usa `target.alignment` calculado en servidor;
     ya no recibe holdings del catálogo ni recalcula en cliente.

4. **Tests** `tests/compare-overlap.test.ts` (8 casos):
   - free/anon no reciben portafolios premium (paid sí),
   - los símbolos en común salen solo de las primeras N posiciones del rol,
   - el payload no contiene símbolos ni pesos fuera del límite,
   - normalización de símbolos y cálculo de solape.

## Verificación

- `npm run lint` → OK.
- `npm test` → 43 archivos, 507 tests OK (incluye los 8 nuevos).
- `npm run typecheck` → solo el error conocido de `LayoutProps` en
  `src/app/layout.tsx` (tipo global generado por `next build`; documentado en
  AGENTS.md). No hay errores en los archivos tocados.
- No se corrió `next build` ni `npm run dev` (según la nota del orquestador).
- No se tocó Supabase real, `.env*` ni se hizo push.

## Pendiente / notas

- El payload precalcula todos los pares del catálogo permitido. Con el
  catálogo actual es liviano; si crece mucho, conviene mover el cruce a una
  server action o a un query param.
- `AlignmentPanel` ya no se recalcula con ediciones locales no guardadas.
  Antes tampoco lo hacía (el estado vive en `PortfolioManager`), así que no
  hay regresión funcional.
- El recorte por rol cambia la base del cálculo: para free/anon el solape y
  la alineación se calculan sobre el top N visible (no sobre el libro
  completo). Es intencional para no filtrar posiciones ocultas.

## Cómo probar

```bash
npm run lint
npm test
npm run typecheck   # falla solo por LayoutProps (preexistente)
npx vitest run tests/compare-overlap.test.ts
```

Prueba manual (cuando el orquestador levante el server): entrar con una
cuenta free a `/compare`, abrir el modo "Cruzar dos carteras" y revisar en el
payload RSC/network que no aparezcan portafolios premium ni posiciones fuera
del top 10.
