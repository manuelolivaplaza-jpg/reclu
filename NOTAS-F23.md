# NOTAS-F23 — Carteras BICE y MBI

## Qué se hizo

Parsers de las carteras recomendadas públicas de BICE y MBI. Solo nemotécnico, peso, fecha y URL. El PDF no se sube a la base.

- `scrapers/corredoras_cl.py`: `parse_bice`, `parse_mbi`, alias de nombres y dos adaptadores.
- `scrapers/stages/corredoras_cl.py`: etapa `corredoras_cl`, `critical=False` (opcional, antes de `radar_ia`).
- Fixtures en `scrapers/tests/fixtures/corredoras_cl/` (copia de `scrapers/data/v2/F23/`).
- `scrapers/tests/test_corredoras_cl.py`.

Alias: Chile → CHILE, Santander → BSANTANDER, LTM y Latam → LTM, Enel Chile → ENELCHILE. Los pesos de BICE se guardan como vienen en el PDF (los 7 de octubre 2026 suman 100, sin renormalizar). MBI reparte 100% en partes iguales entre las acciones con recomendación Comprar, Mantener o Vender. ITAUCL va con Mantener y entra igual que el resto: 5 × 20%.

`mbi_informe_banco_santander_oct_2026` no es una cartera. Usa «Sobreponderar» y el parser lo deja vacío.

## Cómo se encuentra el PDF de MBI

BICE tiene URL fija:

`https://mercadosenlinea.biceinversiones.cl/reportes/cartera-inversiones-bice.pdf`

MBI no. El listado `https://corredores.mbi.cl/publicaciones` sale de más nuevo a más viejo. Se toma el primer `href` cuyo path es `/publicaciones/cartera-recomendada-*`. En esa nota, el primer PDF bajo `/static/uploads/docs/`. Un informe de compañía (BSANTANDER, BCI, etc.) tiene otro slug y no se sigue.

Octubre 2026, verificado en seco el 2026-10-19:

`https://corredores.mbi.cl/static/uploads/docs/20261005185815_Cartera_Octubre.pdf?v=1791226695`

pypdf y el `.txt` guardado no ordenan igual la página de dos columnas. El parser acepta las dos: ficha `Recomendación / nemotécnico / acción`, o nemotécnico al cierre de una línea y más abajo `Recomendación Comprar`.

## Qué queda guardado

En `holdings`, si algún día se corre sin `--dry-run`: `symbol`, `name`, `weight`, `as_of`, `exchange=BCS`, `currency=CLP`. La URL va en el dict de resumen de la etapa (`source_url`). `holdings` no tiene columna de URL y esta tarea no trae migración.

Slugs previstos, todavía sin fila en el seed: `bice-acciones-destacadas` y `mbi-acciones-recomendadas`.

## Variables nuevas

Ninguna.

## Deudas

- Sin las filas de portafolio, una corrida real falla en `_resolve_portfolio_id`. Esta sesión solo usó `--dry-run`.
- `test_sin_etapas_el_orden_no_cambia` lee un directorio temporal vacío (`discover_stages(tmp_path)`). `test_corredoras_cl_aparece_antes_de_radar_ia` confirma, con `scrapers/stages/` real, que `corredoras_cl` queda antes de `radar_ia`.
- Itaú y Credicorp figuran en el JSON como pesos parciales, sin PDF. No se parsean.
- TODO(F16): no hay UI. Si estas carteras se muestran, el aviso va en el componente legal de F16. Esto no ejecuta órdenes ni arma una recomendación personalizada.
- Fase 0 autorizó seguir sin confirmar las migraciones 008, 009 y 014–021. Esta tarea no las usa.
- `scrapers/data/v2/F23/` queda sin versionar. La copia que usa el test está en `scrapers/tests/fixtures/corredoras_cl/`.

## Cómo probar

En esta máquina `python` abre el alias de la tienda. Correr con `uv run`.

```
uv run --with pytest --with httpx --with supabase --with pypdf python -m py_compile scrapers/corredoras_cl.py scrapers/stages/corredoras_cl.py scrapers/tests/test_corredoras_cl.py
uv run --with pytest --with httpx --with supabase --with pypdf python -m pytest scrapers/tests/test_corredoras_cl.py
uv run --with httpx --with supabase --with pypdf python scrapers/run_all.py --list
uv run --with httpx --with supabase --with pypdf python scrapers/run_all.py --only corredoras_cl --dry-run
```

Hecho el 2026-10-19 en `v2/f23-corredoras-cl-parsers`:

- `py_compile` salió 0.
- pytest: 8 passed.
- `--list` muestra `corredoras_cl        opcional  Carteras recomendadas BICE y MBI (PDF público)` antes de `radar_ia`.
- `--dry-run` salió 0 y no escribió. BICE: 7 holdings, FALABELLA 20%, `as_of` 2026-10-05. MBI: 5 holdings, ITAUCL 20%, misma fecha, URL de arriba.

## Para el orquestador

- Los slugs `bice-acciones-destacadas` y `mbi-acciones-recomendadas` necesitan fila en `portfolios`. Sin esa fila, una corrida real falla en `_resolve_portfolio_id`.
- No hay número de migración asignado a F23 en PLAN.md (022-042 están repartidos). Esta tarea no crea migración.
