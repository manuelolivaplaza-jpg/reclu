"""La migracion 046 debe copiar exacto el regex de la 045 y cubrir las 9 tablas.

Lee `supabase/migrations/046_endurecer_permisos.sql` y
`supabase/migrations/045_accionistas_anonimizar.sql` como texto: sin Supabase
y sin red. Correr: python -m pytest scrapers/tests/test_migracion_046.py
(o directo: python scrapers/tests/test_migracion_046.py).
"""

from __future__ import annotations

import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
SQL_046 = RAIZ / "supabase" / "migrations" / "046_endurecer_permisos.sql"
SQL_045 = RAIZ / "supabase" / "migrations" / "045_accionistas_anonimizar.sql"

# Las 9 tablas publicas nuevas que deben quedar sin escritura para anon/auth.
TABLAS = (
    "activist_filings",
    "spinoffs",
    "buybacks",
    "cl_dividends",
    "cl_material_events",
    "cl_top_shareholders",
    "cl_mutual_funds",
    "cl_mutual_fund_holdings",
    "sponsorships",
)

# Delimitadores exactos del regex societario (con limites de palabra).
_INI = "(^|[^[:alnum:]])("
_FIN = ")([^[:alnum:]]|$)"


def _sql(ruta: Path) -> str:
    assert ruta.is_file(), f"falta {ruta}"
    return ruta.read_text(encoding="utf-8")


def _regex_societarios(sql: str) -> list[str]:
    """Extrae cada regex societario literal del SQL (los `||` unen trozos)."""
    encontrados: list[str] = []
    pos = 0
    while True:
        ini = sql.find(_INI, pos)
        if ini < 0:
            break
        fin = sql.find(_FIN, ini)
        assert fin > 0, "regex societario sin cierre en el SQL"
        fin += len(_FIN)
        bloque = sql[ini:fin]
        encontrados.append("".join(re.findall(r"'([^']*)'", bloque)))
        pos = fin
    return encontrados


def test_el_regex_de_la_046_es_identico_al_de_la_045() -> None:
    regex_045 = _regex_societarios(_sql(SQL_045))
    regex_046 = _regex_societarios(_sql(SQL_046))
    assert regex_045, "no encontre el regex en la 045"
    assert regex_046, "no encontre el regex en la 046"
    # Todos los regex de cada archivo son iguales entre si (la 045 lo usa 2 veces).
    assert all(r == regex_045[0] for r in regex_045), "la 045 tiene regex distintos"
    assert all(r == regex_045[0] for r in regex_046), "la 046 tiene regex distintos"
    assert regex_046[0] == regex_045[0], (
        "el regex de la 046 no es identico al de la 045"
    )


def test_las_9_tablas_tienen_revoke_con_guarda() -> None:
    sql = _sql(SQL_046)
    for tabla in TABLAS:
        assert f"to_regclass('public.{tabla}') is not null" in sql, (
            f"falta la guarda to_regclass para {tabla}"
        )
        assert (
            f"revoke insert, update, delete on table public.{tabla} "
            "from anon, authenticated" in sql
        ), f"falta el revoke de escritura para {tabla}"
    # Exactamente 9 revokes de tabla (los guardas del trigger usan to_regclass
    # pero no revoke de tabla).
    n_revokes = len(
        re.findall(
            r"revoke insert, update, delete on table public\.\w+ "
            r"from anon, authenticated",
            sql,
        )
    )
    assert n_revokes == 9, f"esperaba 9 revokes de tabla, hay {n_revokes}"


def test_fila_037_revoke_execute_del_trigger_de_alertas() -> None:
    sql = _sql(SQL_046)
    assert "to_regprocedure('public.enforce_alert_rule_limits()')" in sql
    assert (
        "revoke execute on function public.enforce_alert_rule_limits() "
        "from public, anon, authenticated" in sql
    )


def test_m3_funcion_y_trigger_de_anonimizacion() -> None:
    sql = _sql(SQL_046)
    assert "create or replace function public.anonimizar_accionista()" in sql
    assert "security definer" in sql
    assert "set search_path = ''" in sql
    assert (
        "revoke execute on function public.anonimizar_accionista() "
        "from public, anon, authenticated" in sql
    )
    assert (
        "before insert or update on public.cl_top_shareholders" in sql
    ), "el trigger debe ser BEFORE INSERT OR UPDATE"
    # Fails cerrado: sin marcador societario se reescribe con el ranking.
    assert "'Persona natural (#' || coalesce(new.ranking::text, '?') || ')'" in sql
    # Idempotente: lo ya anonimizado no se vuelve a tocar.
    assert "like 'Persona natural (#%'" in sql
    assert "drop trigger if exists anonimizar_accionista" in sql


def test_rollback_comentado() -> None:
    assert "ROLLBACK" in _sql(SQL_046)


if __name__ == "__main__":
    fallos = 0
    for nombre, fn in sorted(globals().items()):
        if nombre.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"ok    {nombre}")
            except AssertionError as exc:
                fallos += 1
                print(f"FAIL  {nombre}: {exc}")
    raise SystemExit(1 if fallos else 0)
