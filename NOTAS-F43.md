# NOTAS F43 — Asistente DJ 1929 / F22: página `/herramientas/impuestos`

Rama: `v2/f43-dj1929-ui` · Migración: ninguna · Worktree: `C:\reclu-work\f42` (indicado por el orquestador)

Interfaz paso a paso sobre la lógica de F42. Todo corre en el navegador: el CSV se lee con `File.text()` y **no se envía nada a un servidor** (no hay `fetch`, `XMLHttpRequest`, `sendBeacon` ni `<form action>`). No calcula el impuesto a pagar ni arma el archivo oficial del SII.

## Hecho

- `src/app/herramientas/impuestos/page.tsx` (server, estático): header/footer, intro, recordatorio de **plazos** (DJ 1929 antes del 30 de junio; F22 en abril; fila 12 c/ código 1104, filas 14/748 y 49/746 iguales sin superar la fila 12; quien empezó en 2026 declara en 2027), **guías oficiales** enlazadas (SII instrucciones PDF, SII HOMER, Fintual, Racional), el asistente, enlace a la ficha `/aprende/dj-1929` y `<LegalNotice kind="tax" />` (de F16).
- `src/components/tax/tax-wizard.tsx` (client): tres pasos `subir → revisar → resumen`.
  - **subir**: input de archivo CSV (local) + botón “usar datos de ejemplo” (`FORMATO_CSV_GENERICO`). Muestra operaciones leídas y filas con problemas.
  - **revisar**: tabla de operaciones, tipo de cambio (pesos por dólar, lo ingresa la persona) y año de las operaciones; avisos de `resumirInstrumentos`.
  - **resumen**: tabla de la sección B en pesos + totales, descarga de **CSV** (`resumen-dj1929-reclu-<año>.csv`, resumen propio **no** el archivo del SII) y **PDF imprimible** vía `window.print()`.
  - Lógica de pasos pura y exportada para testear: `PASOS`, `estadoInicial`, `indicePaso`, `pasoSiguiente/Anterior`, `motivoBloqueo`, `puedeAvanzar`, `parsearTipoCambio`, `resumir`, `armarCsvResumen`, `formatoClp/Usd`, `PLAZOS`, `GUIAS_OFICIALES`.
- `tests/tax-wizard.test.ts`: 19 tests (orden y bordes de pasos, bloqueos, parseo del tipo de cambio, conversión a pesos, CSV de salida, formato de cifras, datos de plazos/guías y verificación de que no hay `fetch` ni `form action` en el wizard y que la página usa `LegalNotice kind="tax"`).
- Formato de cifras manual (punto de miles, coma decimal) para no depender del locale del navegador y evitar desajustes de hidratación.

## Variables de entorno

Ninguna.

## Deudas

- Solo se importa el **formato CSV propio** de F42 (`FORMATO_CSV_GENERICO`). El CSV sin encabezados de Racional/Fintual (`reporte-operaciones-stocks-2025.csv`, `dj1929_formato_sii.csv`) sigue sin parsearse: no hay ejemplo real en el repo y adivinar los índices de columna metería montos en el casillero equivocado.
- No se arma el archivo oficial que sube el SII ni las filas del F22 (1104/748/746): eso se hace en el SII, con el reporte de la corredora. El CSV que exporta este asistente es un resumen propio con encabezados.
- El “PDF” es impresión del navegador (Guardar como PDF). El bloque de plazos es texto fijo (no hay cuenta regresiva) para mantener la página estática y prerenderizable.
- La sección A (RUT/domicilio del declarante) no se arma aquí, para no guardar datos personales.

## Cómo probar

```bash
npm test -- tests/tax-wizard.test.ts   # lógica de pasos
npm run typecheck && npm run lint && npm test
```

En el navegador (`/herramientas/impuestos`): “Usar datos de ejemplo” → Continuar → tipo de cambio (ej. `900`) → Continuar → ver el resumen, “Descargar CSV” y “Imprimir / Guardar como PDF”. Los montos son para la DJ, no el impuesto a pagar.

## Verificación

- `npm run lint` — OK (exit 0).
- `npm run typecheck` — OK (exit 0).
- `npm test` — 27 archivos / 297 tests OK (incluye `tests/tax-wizard.test.ts`, 19 tests).
- No se corrió `npx next build` (lo corre el orquestador). No se levantó servidor. No se tocó Supabase ni `.env*`.
