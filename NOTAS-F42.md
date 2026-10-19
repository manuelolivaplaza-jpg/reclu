# NOTAS F42 — Asistente DJ 1929, lógica de cálculo

Rama: `v2/f42-dj1929-logica` · Migración: ninguna · Worktree: `C:\reclu-work\f42`

La lógica corre en el navegador. No guarda operaciones, no pide RUT y no llama a la red. No calcula el impuesto a pagar: ordena los montos de la sección B y los totales de la sección C.

## Hecho

- `src/lib/tax/fx.ts` — el tipo de cambio lo ingresa la persona (pesos por un dólar). No hay dólar observado de ejemplo ni consulta al Banco Central. Los dólares se pasan a centavos y después a pesos enteros.
- `src/lib/tax/dj1929.ts` — tipos `Operacion` y `ResumenInstrumento`, y `resumirInstrumentos`.
  - 10 dividendos, 11 intereses, 13 ganancias de capital (valor al 31.12, rentas y pérdidas), 21 otras rentas.
  - El valor al 31.12 sale solo de filas `posicion`. El costo de una compra no se usa como ese monto.
  - La renta de una venta sale de `costoUsd`. Si falta, no se inventa: queda un aviso y esa venta no suma renta ni pérdida.
  - Ganancias y pérdidas de ventas distintas no se netean. Las pérdidas van en positivo.
  - La retención no se resta de la renta. Si es mayor que la renta, se avisa y no se aplica el tope del artículo 41 A.
  - Relación que anotan las guías de una acción suelta: código 9 (`RELACION_SIN_RELACION`). Fintual escribe "99" en su guía; el texto AT2025 y Racional dicen 9. Participación por defecto: 0. No se calcula el porcentaje real.
  - Domicilio y ciudad solo se copian a los códigos 10 y 21, y solo si la persona los escribió.
- `src/lib/tax/import.ts` — `parseGenericCsv` con columnas propias (ver el comentario del archivo y `FORMATO_CSV_GENERICO`).
- `tests/tax-dj1929.test.ts`.
- TODO(F16): no existe `src/components/legal/legal-notice.tsx`. No se creó. La pantalla futura tiene que mostrar `<LegalNotice kind="tax" />`. Mientras tanto, `DJ1929_NO_CALCULA_IMPUESTO`.

## Variables de entorno

Ninguna.

## Deudas

- CSV de Racional `reporte-operaciones-stocks-2025.csv`: la guía lista columnas por posición y el archivo va sin encabezados, pero no hay un ejemplo real en el repo. No se parsea. Un CSV sin las columnas propias se rechaza.
- No se estima el costo de adquisición (ni promedio ni FIFO). Sin `costo_usd`, no hay renta de esa venta.
- No se arman las filas del Formulario 22 (1104, 748, 746). Eso ya es la declaración de renta, no la DJ 1929.
- No se valida la sigla de país contra el suplemento del SII. Se aceptan 2 o 3 letras, más "Estados Unidos" y "Chile".
- No hay pantalla. Esta tarea es solo la función pura.
- Sección A (RUT, domicilio del declarante): se llena en el SII. Este módulo no la arma, para no guardar datos personales.
- Código 9 del SII (entidad extranjera controlada) y el resto de códigos que no son 10, 11, 13 o 21 quedan fuera.

## Cómo probar

```bash
npm test -- tests/tax-dj1929.test.ts
```

En el navegador, cuando exista la pantalla: armar un arreglo de `Operacion` (o el texto de `FORMATO_CSV_GENERICO`), pedir el tipo de cambio al 31.12 y llamar `resumirInstrumentos(operaciones, clpPorUsd)`. Los pesos del resultado son los montos a copiar en la DJ. No son el impuesto a pagar.

## Verificación

- `npm run lint` — OK.
- `npm test` — 234/234 OK (incluye `tests/tax-dj1929.test.ts`, 21 tests).
- `npx next build` — OK. TypeScript del build en verde.
- `npm run typecheck` — OK.
- No se abrió el navegador: no hay pantalla nueva y esta sesión no levanta servidores.
- No se corrió nada contra Supabase. No hay migraciones.

## Arreglo colateral del build

`/accion/[symbol]` prerenderizaba `timeAgo` (`Date.now()`) y el build se caía en `/accion/nvda`. La página ya decía que no es un prerender instantáneo (`instant = false`) pero no llamaba `connection()`. Quedó `await connection()` al inicio de `AccionPage`, igual que el resto de las fichas. Las rutas comunes siguen en prerender parcial.
