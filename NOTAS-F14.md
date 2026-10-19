# NOTAS F14 — AFP chilenas (Superintendencia de Pensiones)

Rama: `mejoras/f14-afp` · Migración asignada: `supabase/migrations/020_afp_carteras.sql`

Sesión A = backend (migración, scraper, tests). La UI queda para la sesión B.
El avance de código de esta sesión quedó en `6440856` (`wip(f14): avance de Grok sesion A`), guardado por el orquestador. Estas notas son el cierre.

## Hecho en sesión A

### 1. Migración `020_afp_carteras.sql`
- Portafolio `afp-modelo-acciones-cl`: nombre "AFP Modelo: acciones chilenas", categoría `public_disclosure`, source `spensiones`, manager `AFP Modelo`, country `CL`, followers 0, `return_ytd` null, premium false, tags `{afp,pensiones,chile,ipsa}`.
- Holdings semilla al 29-05-2026: 42 nemotécnicos (41 emisores; ANDINA-A y ANDINA-B comparten emisor). Moneda `CLP`, `asset_class` `equity`, exchange `BCS`, `previous_weight` 0.
- El peso es `round(MMUS$ del emisor / total × 100, 2)`, la participación dentro de las acciones chilenas de Modelo. Con el total del fixture (~2.284,6 MMUS$) LTM queda en 13,95 %.
- Idempotente: `on conflict (slug) do nothing` y `on conflict (portfolio_id, symbol, as_of) do nothing`. No hay `DELETE`.
- `afp-consenso-chile` (migración 006, seguidores y retorno de demostración) no se modifica.
- Fila agregada en `supabase/migrations/README.md`. La 014 sigue reservada para F8 y la 015 para F9.

### 2. Scraper `scrapers/spensiones.py`
- `SpensionesAdapter(SourceAdapter)`, `name='spensiones'`, portafolio `afp-modelo-acciones-cl`.
- Modo A (httpx, el que corre `run_all`): endpoint antiguo `genera_desagregada_xsl.php?fecpro=AAAAMM&idu=50&listado=14`. Camina el mes en curso hacia atrás (hasta 18 meses) hasta una respuesta de más de 1000 bytes que contenga "CUADRO" y parsee filas. Una respuesta de 363 bytes se trata como mes no publicado.
- `parse_cuadro14(html)`: filas `<tr>` con 12 `<td>`; omite las que parten con "TOTAL" y las que no tienen 12 celdas. Cifras con coma decimal. Peso = MMUS$ / total × 100.
- No se guarda ningún CUSIP. Un nemotécnico con forma de CUSIP (8 caracteres + dígito, y al menos un dígito) se descarta. `MALLPLAZA` no calza esa forma.
- Alertas vía `previous_weight`, para que `detect-changes` las clasifique:
  - emisor nuevo (`previous_weight` 0) → `new_trade`;
  - |delta| ≥ 1 punto → `weight_change`;
  - cambio menor: `previous_weight` = peso nuevo (delta 0), así el umbral global de 0,5 pp no dispara.
- `payload_alerta()` arma `payload.source_url` con la URL del cuadro. La alerta `scraper_error` del modo navegador también lleva `source_url` y queda con `is_published=false`.
- Modo B detrás de `--navegador`: Playwright abre el portal del mes y sigue el enlace "Html" de Total de Fondos (cuadro 11 o 14). Si falla, registra `scraper_error` y sigue con el modo A. El consolidado que llegue a leer no se escribe.
- Etapa en `scrapers/run_all.py`, después de `performance` y antes de `radar_ia`: `("spensiones", "Carteras AFP (Superintendencia de Pensiones)", False)`. `run_spensiones` está en `RUNNERS`. No reescribe el archivo por finales de línea: ya está en LF.

### 3. Tests
- `scrapers/tests/test_spensiones.py`, sin red ni base de datos.
- El fixture `scrapers/data/afp/afp_modelo_acciones_cl_202605.json` produce la fecha 29-05-2026, 42 filas, 41 emisores y un total de unos 2.284,6 MMUS$.
- Una respuesta de 363 bytes no está publicada. La búsqueda hacia atrás se detiene en `202605`.
- La migración no contiene `DELETE`, declara los dos `on conflict do nothing` y no guarda un CUSIP.

## Verificación ejecutada
- `uv run --with httpx --with pytest --with supabase python -m pytest scrapers/tests -q` — 13 passed.
- `npm run lint` — OK (0 errores).
- `npm test` — 113/113 OK (11 archivos).
- `npm run build` — OK (Next.js 16.4, TypeScript incluido en el build).
- `uv run python -m py_compile scrapers/spensiones.py scrapers/run_all.py scrapers/tests/test_spensiones.py` — OK. `python` a secas no está en el PATH de esta máquina; se usó `uv run`.
- `uv run --with httpx --with supabase python scrapers/run_all.py --list` — `spensiones` aparece como etapa opcional, entre `performance` y `radar_ia`.
- `uv run --with httpx --with supabase python scrapers/spensiones.py --dry-run` (2026-10-19, sin escribir en Supabase): 202610–202606 responden 363 bytes; 202605 responde 19962 bytes. Resultado: 42 holdings, corte 2026-05-29, top LTM 13,95 %, `status=ok`, `dry_run=true`.

## Pendiente para sesión B

La UI y el resto de la especificación. No se tocó ninguna pantalla en esta sesión.

1. **Ficha del portafolio.** Mostrar la fecha de la cartera (29-05-2026 en la semilla) y el aviso "La SP publica con desfase; no es la cartera de hoy." Enlace "Fuente: Superintendencia de Pensiones" a la URL del cuadro. Aviso fijo: "Simulación histórica con fines informativos. No es recomendación de inversión."
2. **Fuente visible.** Fila en `docs/sources.md`. Nombre corto en `src/components/sections/source-line.tsx` (hoy: Capitol Trades · Renta 4 · LarrainVial · BTG Pactual · InfoProbidad · SEC 13F).
3. **`source_url` en las alertas de cambio.** `detect-changes` arma `new_trade` y `weight_change` a partir de `previous_weight` y hoy no copia la URL del cuadro al payload. `payload_alerta()` ya la incluye; hay que enchufarla en esa función (o en el insert) para que cada alerta publicada la lleve. La de `scraper_error` ya la guarda.
4. **Benchmark.** ECH ya está en la etapa `etfs` (iShares). En la UI rotularlo "ECH en CLP (proxy del IPSA)". Los números simulados están solo como referencia en `scrapers/data/afp/afp_vs_ipsa.json` (cartera 30-05-2025: +33,79 % vs ECH-CLP +33,09 %; cartera 29-05-2026: +3,74 % vs ECH-CLP +3,31 %, corte 2026-09-16). No se cargaron a la base.
5. **Precios de Chile.** Yahoo `.SN` no trae volumen desde el 2026-09-16 y los precios quedan congelados. Para producción hace falta otra fuente (Bolsa de Santiago u otro proveedor).
6. **Modo B en vivo.** El flag `--navegador` está escrito y, si falla, no tumba el modo A. Falta verificarlo contra el portal (Cuadro 11 o 14 de "Total de Fondos", desde junio de 2026 el parámetro va cifrado y curl devuelve 0 o 363 bytes). Hasta eso, el consolidado de todas las AFP no se consigue: los `idu` distintos de 50 no devolvieron datos.
7. **`afp-consenso-chile`.** Sigue en el catálogo con source `spensiones`, 8700 seguidores y retorno 14,2 de la semilla demo de la 006. Propuesta: alimentarlo con el consolidado cuando el modo navegador funcione, o desactivarlo. No borrarlo en la migración.
8. **Términos.** Información pública, sin condiciones de reutilización explícitas encontradas. La página trae aviso de copyright de CUSIP (American Bankers Association / FactSet): no publicar códigos CUSIP. Revisar los términos antes de tratar la fuente como cerrada.
9. **Desfase.** La cartera de cada mes aparece varias semanas después. El desfase exacto no se midió. La entrada "el día hábil siguiente al cierre" del archivo de referencia es optimista.

## Decisiones documentadas
- El peso de la semilla se calcula desde los MMUS$ del fixture, con redondeo a 2 decimales. LTM queda en 13,95 % (318,66 / 2.284,6). La lista redondeada de la especificación (LTM 13,96, SQM-B 12,87, …) es la misma cartera; no se hardcodearon esos porcentajes.
- Un cambio de peso menor a 1 punto guarda `previous_weight` igual al peso nuevo. Así se respeta el umbral de 1 pp de esta fuente y el umbral global de 0,5 pp de `detect-changes` no genera una alerta de más.
- El modo B no escribe el consolidado aunque el HTML parsee. Primero hay que verlo en vivo.
- `parse14_referencia.py` y `afp_vs_ipsa.json` quedan en `scrapers/data/afp/` como referencia. El parser de producción es `parse_cuadro14` en `scrapers/spensiones.py`.

## Pendiente / qué debe configurar Manu
1. **Migración a aplicar** en el SQL Editor de Supabase, después de las previas: `supabase/migrations/020_afp_carteras.sql`. Es idempotente.
2. **Variables de entorno nuevas:** ninguna.
3. **Cuentas externas:** ninguna. El modo A es un GET público. El modo B, cuando se pruebe, necesita Playwright y Chromium en la máquina que lo corra; el cron de `run_all` no lo invoca.
4. **Pasos manuales opcionales:**
   - `uv run --with httpx --with supabase python scrapers/spensiones.py --dry-run` antes de dejarlo en el cron.
   - `--navegador` solo después de verificar el portal en vivo.
   - No aplicar esta migración esperando que reemplace a `afp-consenso-chile`: son dos slugs distintos.
