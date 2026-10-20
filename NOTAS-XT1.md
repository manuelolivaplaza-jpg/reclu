# XT1 — tests faltantes de lo integrado

Rama: `v2/xt1-tests-faltantes` (desde `mejoras/integracion`). Solo se tocaron
tests; no se cambió código de producción.

## Estado inicial

La rama de integración ya traía cobertura de los cuatro frentes pedidos,
aportada por las ramas de F43/F45/F52 y publicación:

- `tests/hidden-demos.test.ts`
- `tests/import-holdings.test.ts`
- `tests/widgets.test.ts`
- `tests/publish-core.test.ts`

En vez de duplicar archivos, se completaron los casos límite que faltaban.

## Agregado

1. **Redirección de portafolios ocultos (043)** — `tests/hidden-demos.test.ts`
   - Solo cuentan las claves propias del mapa (`__proto__`, `constructor`,
     `toString`, `hasOwnProperty` no son slugs ocultos).
   - Un portafolio activo del catálogo demo nunca redirige
     (`demoPortfolioBySlug` existe y `getPortfolioRedirect` devuelve `null`).

2. **Importación de holdings por CSV (F45)** — `tests/import-holdings.test.ts`
   - BOM + separador `;` + decimales con coma en el mismo archivo.
   - Cada fila inválida deja un warning numerado (`Fila N: ...`) y las válidas
     siguen.
   - Sin filas válidas: `rows` vacío, `totalQuantity` 0 y solo warnings.
   - Cantidad sobre `MAX_QUANTITY` se rechaza.
   - CSV sobre `MAX_CSV_LENGTH` (1 MB) se rechaza antes de parsear.
   - Tope de 100 símbolos: exactamente 100 pasa; las filas repetidas no gastan
     cupo y se suman.

3. **Widgets (F52)** — `tests/widgets.test.ts`
   - `isWidgetTipo` rechaza parámetros con caracteres raros o intentos de
     inyección: query string, `&`, `#`, `%2F`, `../`, backslash, `%00`,
     carácter nulo, `<script>`, mayúsculas y espacios alrededor.

4. **Flags de publicación** — `tests/publish-core.test.ts`
   - Por cada canal (`x`, `telegram`, `newsletter`), la env debe ser
     exactamente `"true"`: `undefined`, vacío, espacios, `"true "`, `" true"`,
     `"TRUE"`, `"True"`, `"1"`, `"yes"`, `"on"` y `"false"` dejan el canal
     apagado.
   - `canSendLive` respeta el mismo criterio con modo `live` y borrador
     `approved`.

## Notas / pendientes

- No se encontraron bugs de producción.
- `src/lib/widgets.ts` no recibe parámetros más allá del tipo de widget; la
  validación de "parámetros raros" se cubre vía `isWidgetTipo` (el `tipo` del
  segmento dinámico). Si más adelante se agregan query params a los widgets,
  falta un validador explícito y sus tests.
- Comportamiento observado (no es bug): si un CSV no tiene ninguna fila válida
  pero sí filas inválidas, `parseHoldingsCsv` devuelve solo los warnings, sin
  el mensaje adicional "No se encontraron filas válidas.".

## Verificación

```bash
npm run lint
npm run typecheck
npm test -- --run
```

Resultado: lint y typecheck sin errores; 42 archivos y 499 tests en verde
(antes 487).
