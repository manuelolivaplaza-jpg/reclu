# NOTAS F15 — InfoProbidad agregado por empresa

Rama: `mejoras/f15-infoprobidad` · Migración asignada: `supabase/migrations/021_infoprobidad_agregado.sql`

El slug `infoProbidad-cl` no cambia. No se corrió el scraper ni SQL contra Supabase real.

## Qué se hizo (por área)

### 1. Migración y mapa de nemotécnicos
- `supabase/migrations/021_infoprobidad_agregado.sql` — tabla pública `infoprobidad_empresas` (RUT, nombre de la sociedad, nemotécnico, autoridades, valor declarado, última declaración, `updated_at`). Idempotente (`create table if not exists`, `drop policy if exists`). Lectura para `anon` y `authenticated`. Sin policy de escritura y sin columnas de personas. El `update` del portafolio solo aclara la descripción y deja `return_ytd` en null.
- `supabase/migrations/README.md` — fila de la 021.
- `scrapers/data/infoprobidad/rut_nemotecnico.json` — 10 RUT del ejemplo del 2026-10-19. Nueve con nemotécnico BCS (LTM, CHILE, VAPORES, ENELGXCH, ENELAM, BSANTANDER, CMPC, SQM-B, CENCOSUD). La cooperativa `82878900` queda con `symbol` null: entra al agregado y no a la canasta.
- `.env.example` — `INFOPROBIDAD_NOMBRES=0`.

### 2. Scraper (misma etapa, mismo slug)
- `scrapers/infoprobidad.py` — `InfoProbidadAdapter`, slug `infoProbidad-cl`. La consulta SPARQL agrupa por `ip:rutJuridica`, filtra la última declaración, suma `ip:valorPlaza/ip:valor` y pide como máximo 50 RUT. Descarta `rut=0` y las sociedades deportivas Cruzados, Azul Azul y Blanco y Negro. Holdings solo de emisoras con nemotécnico; el peso es proporcional al número de autoridades. Alerta `threshold` si una empresa sube 5 o más autoridades. El payload lleva RUT, nombre de la sociedad, conteo, fecha, `source_url` y `licencia: CC BY 4.0`. Sin nombres de personas.
- Sigue registrado en `scrapers/run_all.py` como etapa `infoprobidad` (opcional), entre `btg_pactual` y `sec13f`. No se creó otra etapa.
- `docs/sources.md` — fila de la fuente, licencia y límites.

### 3. UI
- `src/lib/infoprobidad.ts` — lectura de `infoprobidad_empresas` (solo columnas agregadas) o ejemplo rotulado si no hay Supabase. Formato de pesos y fechas.
- `src/components/infoprobidad-empresas.tsx` — tabla "Empresas con más autoridades accionistas", finalidad (conflictos de interés, no recomendación), aviso fijo de simulación informativa y atribución "Fuente: InfoProbidad, Consejo para la Transparencia (CC BY 4.0)" con enlace a la licencia.
- `src/app/portfolio/[slug]/page.tsx` — la tabla solo en `infoProbidad-cl`. En ese slug no hay gráfico de evolución, panel de rendimiento, dona, franja de "rotación" ni retorno por holding. El título no dice "Qué compró". La canasta de emisoras cotizadas, si existe, aclara que el peso sigue a las autoridades y no es una cartera para copiar.
- `src/lib/demo-data.ts` — descripción y `return_ytd: null` del portafolio demo. `src/components/sections/source-line.tsx` ya nombraba InfoProbidad.

### 4. Reglas legales (revisadas en esta sesión)
- Solo totales por empresa: conteo de autoridades, valor declarado y fecha. La consulta no selecciona `ip:nombre` ni apellidos de la persona; `?nombre` es la etiqueta de la sociedad.
- La consulta no pide `direccion`, `estadoCivil`, `regimenPatrimonial`, `tieneBien` ni `tienePasivo`. Un test falla si aparecen. Tampoco pide bienes, pasivos ni datos de cónyuge o familiares.
- `INFOPROBIDAD_NOMBRES` queda en `0`. Aunque se ponga en `1`, esta versión no consulta ni guarda nombres. Activarlo de verdad queda para después de la revisión con abogado.
- Atribución CC BY 4.0 visible en la ficha y en el JSON-LD (`license`).
- Finalidad en la ficha: transparencia sobre posibles conflictos de interés. No es recomendación de inversión. El rendimiento simulado no se muestra en este slug.

### 5. Tests
- `scrapers/tests/test_infoprobidad.py` — fixture real, agrupación por RUT, descarte de `rut=0` y sociedades deportivas, holdings solo con nemotécnico, alerta sin datos personales, consulta sin predicados prohibidos.
- Fixtures en `scrapers/tests/fixtures/infoprobidad/`.
- `scrapers/tests/test_parsers_f3.py` — ajustado al agregado (ya no espera el símbolo partido por la primera palabra del nombre).
- `tests/infoprobidad.test.ts` — formato CLP/fecha y descarte de RUT 0 sin copiar columnas personales.

## Verificación ejecutada
- `npm run lint` — OK (0 errores).
- `npm run typecheck` — OK.
- `npm test` — 116/116 OK (12 archivos).
- `npm run build` — OK (Next.js 16.4.0). `/portfolio/[slug]` queda en prerender parcial.
- `uv run ... python -m py_compile scrapers/infoprobidad.py` — OK.
- `uv run ... pytest scrapers/tests/test_infoprobidad.py -q` — 5 passed.
- `uv run ... python scrapers/run_all.py --list` — etapa `infoprobidad` presente, opcional.
- No se levantó `npm run dev` (pedido de esta sesión). La ficha no se recorrió en el navegador.

## Pendiente / qué debe configurar Manu
1. **Migraciones a aplicar (en orden)** en el SQL Editor de Supabase, sin `db push` desde este worktree:
   - Las previas que aún no estén en esa base.
   - `supabase/migrations/021_infoprobidad_agregado.sql` (idempotente). Si al integrar choca el número con la 014 (F8) o la 015 (F9), el orquestador puede renumerar: el archivo no depende de un número fijo.
2. **Variables de entorno**: `INFOPROBIDAD_NOMBRES=0` (ya en `.env.example`). No ponerla en `1` hasta hablarlo con un abogado. El código igual no guarda nombres.
3. **Cuentas externas**: ninguna. El SPARQL `https://datos.cplt.cl/sparql` es público. Licencia CC BY 4.0.
4. **Pasos manuales**:
   - Cuando corresponda, correr solo en seco: `uv run --with httpx --with supabase python scrapers/infoprobidad.py --dry-run`. No escribe la base.
   - La etapa en el cron es la misma `infoprobidad` de `run_all.py`. No es crítica: Virtuoso a veces corta.
   - Ampliar `rut_nemotecnico.json` si aparecen más emisoras cotizadas. Sin nemotécnico verificado, `symbol` queda null y la empresa no entra a la canasta.
   - El calendario "martes y viernes" del docstring viejo no está confirmado en una página oficial. La declaración más reciente vista el 2026-10-19 es del 2026-10-10.

## Decisiones documentadas
- Nombres de autoridades (aunque sean ministros o jefes de servicio) no se publican en esta versión. El flag existe y está apagado; encenderlo no abre una consulta de personas.
- El valor declarado es la suma de `ip:valorPlaza`. Si el endpoint no trae monto, la UI muestra "—". No se inventa un rendimiento.
- Sociedades deportivas y RUT `0` se descartan. El resto del top 50 se publica agregado, coticen o no.
- `AGENTS.md` solo cambió una palabra del bloque que reescribe `next dev` ("just" → "only"). No es parte del producto.
