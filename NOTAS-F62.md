# NOTAS F62 — página /mi-portafolio

Rama: `v2/f62-pagina-mi-portafolio` (desde `mejoras/integracion`).
Sin push. Sin migraciones nuevas (se usan la 050 y la 052 ya existentes).

## Hecho

- **Valorización pura** `src/lib/portfolio-valuation.ts`
  - Valor = cantidad × último cierre; P&L absoluto y %.
  - Sin precio (o precio ≤ 0): valor, P&L, P&L % y peso quedan `null`
    (la UI dice "sin precio", nunca 0).
  - Costo 0: P&L absoluto = valor y P&L % `null` (no se divide por cero).
  - Sin costo promedio: hay valor, P&L `null`.
  - **CLP y USD no se convierten ni se suman**: totales agrupados por moneda
    (`totals`), con peso calculado dentro de cada moneda.
- **Tests** `tests/portfolio-valuation.test.ts` (10 casos): precio/costo,
  sin precio, precio 0/negativo, CLP+USD separados, costo 0, sin costo, sin
  cantidad, moneda desconocida, cartera vacía.
- **Página** `src/app/(dashboard)/mi-portafolio/page.tsx`
  - `await connection()` + `export const instant = false`.
  - `notFound()` si `MY_PORTFOLIO_ENABLED` no es exactamente `"true"`.
  - Lectura con el cliente de sesión (`createClient()`), así la RLS
    `auth.uid() = user_id` es la última defensa.
  - Lee `user_portfolio_settings.consent_at`; **sin consentimiento no lee las
    tenencias** y muestra `<PortfolioConsent>` de F75 en vez de la tabla.
  - Último cierre de `prices` por símbolo (de a 8 en paralelo). Para posiciones
    CL/CLP busca el ticker con sufijo `.SN` (convención de `scrapers/prices.py`)
    y cae al ticker pelado.
  - Tope del plan con `portfolioLimitsFor` ("7 de 10 posiciones", plan).
  - Descargo al pie `LegalNotice kind="fintec"`.
- **Componentes** `src/components/my-portfolio/`
  - `portfolio-editor.tsx`: tabla + formulario de alta/edición (ticker,
    cantidad, costo, moneda, mercado), quitar posición, guardar cartera
    completa. Llama a `saveUserHoldings` con **todo** el arreglo (y a
    `clearUserHoldings` si queda vacío). Peso en % (0–100) calculado por
    valor/costo/cantidad; la action lo vuelve a normalizar.
  - `positions-table.tsx`: columnas ticker/cantidad/costo/precio/valor/P&L/P&L %/
    peso + editar y quitar. "sin precio" cuando falta.
  - `export-csv-button.tsx`: CSV solo si `portfolioLimitsFor(...).exportCsv`
    (Elite); para el resto queda deshabilitado con "Disponible en Elite" y un
    TODO para moverlo a servidor si se quiere auditar.
  - `format.ts`: formatos deterministas (coma decimal, sin `Intl`) para evitar
    mismatch de hidratación.
  - `types.ts`: tipos compartidos.
- **Navegación**: enlace "Mi portafolio" (icono `Wallet`) en sidebar y nav
  móvil solo con `isMyPortfolioEnabled()`.
- **Integración F75**: `revalidatePath("/mi-portafolio")` en las actions de
  consentimiento (otorgar/retirar) y borrado, para que al aceptar el
  consentimiento la página pase de la tarjeta al editor sin recargar a mano.

## Verificación

Ejecutado en este worktree (todo verde):

```bash
npm run typecheck
npm run lint
npm test                    # 71 suites, 875 tests
npx vitest run --maxWorkers=1 tests/portfolio-valuation.test.ts
```

No se corrió `next build` ni `npm run dev` (según la nota del orquestador).

## Cómo probar a mano

1. `MY_PORTFOLIO_ENABLED=true npm run dev` (y Supabase con 050/052 aplicadas).
2. Login → menú "Mi portafolio".
3. Sin consentimiento: solo aparece la tarjeta de consentimiento; al aceptar
   se revalida y aparece el editor.
4. Agregar `AAPL`, cantidad 10, costo 100, USD, US → guardar (peso 100).
   Si `prices` tiene AAPL se ve último cierre, valor, P&L y peso; si no,
   "sin precio".
5. Editar cantidad/costo, quitar una posición y volver a guardar.
6. Agregar una posición CLP/CL: se busca `<TICKER>.SN` en `prices`.
7. Plan free: "N de 10 posiciones"; intentar la 11.ª → error de tope.
8. Plan no Elite: "Exportar CSV" deshabilitado. Elite: descarga el CSV.
9. Con `MY_PORTFOLIO_ENABLED` apagado, `/mi-portafolio` responde 404 y no
   aparece el enlace en la navegación.

## Pendiente / notas

- No se probó en navegador real (no se levantan servidores en esta tarea).
- La exportación CSV se genera en el cliente; si se quiere auditar/limitar en
  servidor, mover a una server action que revalide el plan (TODO en el archivo).
- `saveUserHoldings` guarda `source = "csv"` también para altas manuales
  (comportamiento previo de F60; no se tocó).
- Las posiciones sin `quantity` muestran valor "—" (no hay dato para valorizar).
- `prices.py` no escribe `currency` (queda el default `USD` de la tabla), por
  eso la página no intenta convertir por moneda del precio: usa la moneda de la
  posición y no suma CLP con USD.
