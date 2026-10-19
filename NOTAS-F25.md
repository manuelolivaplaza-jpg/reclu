# NOTAS-F25 — 13F soberanos, banco central y family offices

## Qué se hizo

Se agregaron cuatro filers 13F con CIK verificados el 2026-10-19 en `data.sec.gov` (`scrapers/data/v2/F25/ciks_verificados.json`). Duquesne (1536411) y Soros (1029160) ya estaban: no se duplican.

| Fondo | CIK | Slug | Corte |
| --- | --- | --- | --- |
| Norges Bank | 1374170 | `norges-bank-13f` | top 50 por valor |
| Swiss National Bank | 1582202 | `snb-13f` | top 50 por valor |
| Gates Foundation Trust | 1166559 | `gates-foundation-13f` | libro completo |
| Icahn Carl C | 921669 | `icahn-13f` | libro completo |

- `scrapers/sec13f.py`: los cuatro entran en `FUNDS` con el comentario de verificación. `TOP_N` pone 50 en Norges y en el SNB. `fetch_holdings(..., top_n=None)` usa ese tope; un entero explícito lo pisa. `parse_infotable` fusiona emisores duplicados, calcula el peso sobre el libro completo y recién ahí corta.
- `scrapers/load_13f.py`: los cuatro slugs en `FUND_SLUG`.
- `supabase/migrations/025_13f_soberanos.sql`: los cuatro portafolios, `category` `hedge_fund`, `country` `Global`, `premium` false, tags `{soberano,13f}` o `{family-office,13f}`. La descripción de Norges lleva el enlace semestral de NBIM (`https://www.nbim.no/en/investments/all-investments/`). `followers` 0 y `return_ytd` null: no se inventa rendimiento.
- `scrapers/tests/test_13f_topn.py`: corte sobre un XML falso, fusión antes del corte, y el registro de CIK/slugs.

La etapa sigue siendo `sec13f` (no hay etapa nueva). El dry-run del 2026-10-19 dejó Norges en 50 líneas (top NVIDIA 6.5%), SNB en 50 (top NVIDIA 6.81%), Gates en 24 e Icahn en 12. Resumen: `dry_run: True`, `funds: 29`. No escribió en Supabase.

## Variables nuevas

Ninguna. No se tocó `.env.example` (lo une F57).

## Idempotencia de 025

Revisada leyendo el SQL, sin ejecutarlo. No crea tablas, funciones ni policies, así que no hace falta `create ... if not exists` ni `drop policy if exists`. La única escritura es `insert ... on conflict (slug) do nothing`. Una segunda corrida no inserta de nuevo y no falla.

## Deudas

- Faltan en este worktree `017` y `018` dentro del rango 014–021. El orquestador autorizó seguir. Están 008, 009, 014, 015, 016, 019, 020 y 021.
- `scrapers/reconstruct_history.py` tiene su propio `SLUG_BY_NAME` y no incluye estos cuatro. Quedó fuera de la lista de archivos de F25, así que la reconstrucción histórica no los toma. `TODO(F25)` si alguien corre ese script.
- El peso es la participación en el 13F completo, no se renormaliza al top 50. Por eso las 50 líneas de Norges o del SNB no suman 100. El dry-run lo confirma (NVIDIA ~6.5% del libro de Norges, no del corte).
- El corte ocurre después de bajar el XML. El dry-run igual descarga el filing entero; solo deja de publicar la cola.
- No hay UI nueva. No se usó `src/components/legal/legal-notice.tsx` (F16). Los cuatro portafolios son filings institucionales públicos, `premium` false, y el copy no recomienda ni enruta órdenes.
- La migración no se corrió contra Supabase.

## Cómo probar

`python` no está en el PATH de esta máquina. El intérprete que pasó es `uv run python`.

```
uv run python -m py_compile scrapers/sec13f.py scrapers/load_13f.py scrapers/tests/test_13f_topn.py
uv run --with pytest --with httpx python -m pytest scrapers/tests/test_13f_topn.py
uv run --with httpx --with supabase python scrapers/run_all.py --list
uv run --with httpx --with supabase python scrapers/run_all.py --only sec13f --dry-run
```

Resultado de esta sesión: py_compile en verde, 5 tests en verde, `--list` muestra `sec13f`, y el dry-run terminó `1/1 etapas OK` sin escritura.

Para la migración, pegar `025_13f_soberanos.sql` dos veces en el SQL Editor cuando toque aplicarla. No forma parte de esta verificación.
