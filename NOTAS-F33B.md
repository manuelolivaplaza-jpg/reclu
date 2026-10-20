# F33-B — Ocultar personas naturales en mayores accionistas CMF

Rama `v2/f33b-anonimizar-personas` (worktree `C:\reclu-work\f25`, base
`mejoras/integracion` con F33 fusionada). Sin push. No se tocó Supabase real.

## Qué se hizo

### `scrapers/cmf_accionistas.py`

- `es_persona_natural(nombre, rut=None)`:
  - Con RUT manda el umbral: `< 50.000.000` → persona natural;
    `>= 50.000.000` → jurídica. El RUT se usa **solo** para clasificar y
    nunca se guarda ni se loguea.
  - Sin RUT (o RUT ilegible) se buscan marcadores societarios en el nombre
    normalizado (minúsculas, sin tildes): S.A., SpA, Ltda, Limitada,
    S.A.C., Inversiones, Sociedad, Fondo, AFP, Banco, Corredores,
    Administradora, Holding, Trust, Inc, LLC, Ltd, Fund, Custodia,
    Compañía, E.I.R.L., Fundación, Corporación, Agencia.
  - Sin marcador → persona natural (falla cerrado: ante la duda se oculta).
- `separar_rut(texto)`: si la fuente trae el RUT pegado al nombre
  (`PEREZ JUAN 12.345.678-5`), lo separa y lo descarta antes de clasificar.
  El RUT tampoco queda en la fila resultante.
- En `parse_accionistas`, la persona natural se reemplaza por
  `Persona natural (#ranking)` conservando porcentaje, acciones y ranking.
  El ranking va en el texto porque la clave única es
  `(rut_emisor, periodo, accionista)`. Cada fila lleva
  `es_persona_natural` y `_record()` lo persiste en el upsert.
- Docstring del módulo actualizado a la nueva política.

### `supabase/migrations/045_accionistas_anonimizar.sql` (nuevo)

- Agrega `cl_top_shareholders.es_persona_natural boolean not null default false`
  (`add column if not exists`).
- Anonimiza las filas históricas sin marcador societario (mismo criterio
  con `~*`) a `Persona natural (#ranking)` y las marca
  `es_persona_natural = true`; las jurídicas quedan en `false`.
- Idempotente, sin `delete`/`truncate`/`drop table`. Incluye comentario de
  rollback: los nombres/RUT originales **no se pueden recuperar** (es
  intencional, Leyes 19.628 y 21.719).
- `supabase/migrations/README.md`: fila 18 de la tabla y sección 045.

### Tests (`scrapers/tests/test_cmf_accionistas.py`)

De 14 a 21 tests:

- Persona natural sin RUT → `Persona natural (#3)` con su % y acciones.
- Persona natural con RUT inline → natural, y el dict **no contiene** el
  nombre, el RUT con puntos ni el cuerpo del RUT.
- Jurídica con "S.A." y con RUT `96.xxx` → nombre visible y RUT ausente.
- Jurídica por nombre (S.A., Limitada, Fondo) y por RUT; natural por
  umbral; falla cerrado con string vacío/municipalidad.
- Migración 045 verificada por texto (columna, `coalesce(ranking::text`,
  `~*`, rollback, sin borrados).

## Verificación

```powershell
cd C:\reclu-work\f25\scrapers
uv run --with pytest --with-requirements requirements.txt pytest -q tests/test_cmf_accionistas.py
# 21 passed
uv run --with pytest --with-requirements requirements.txt pytest -q
# 210 passed, 1 skipped

cd C:\reclu-work\f25
npm run lint       # ok
npm test           # 479 passed
npm run typecheck  # error conocido de Next 16: src/app/layout.tsx LayoutProps (tipo generado en build)
```

Notas de verificación:

- `LayoutProps` es el error documentado en `AGENTS.md` (tipo global que
  genera `next build`; `tsc --noEmit` aislado no lo ve). No viene de este
  cambio: solo se tocaron Python, SQL y docs.
- No se corrió `npm run build` (lo hace el orquestador) ni `npm run dev`.

## Pendiente

- Aplicar `045_accionistas_anonimizar.sql` en Supabase real (no ejecutada).
- El parser real de la CMF trae 4 celdas sin RUT de accionista: el soporte
  de RUT (umbral y RUT inline) queda listo por si otra fuente lo trae.
- Filas como "ILUSTRE MUNICIPALIDAD DE CASABLANCA" no son personas
  naturales, pero al no tener marcador societario se anonimizan (falla
  cerrado). Si se quiere distinguirlas, agregar el marcador a la lista.
- `ignore_duplicates` no pisa filas existentes: las personas naturales
  históricas solo se limpian al aplicar la 045.
