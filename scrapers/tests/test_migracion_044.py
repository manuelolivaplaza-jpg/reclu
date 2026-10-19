"""La migracion 044 debe declarar exactamente los slugs que usan los parsers.

Lee `supabase/migrations/044_corredoras_cl.sql` como texto: sin Supabase y sin
red. Correr: python -m pytest scrapers/tests/test_migracion_044.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from corredoras_cl import BiceCarteraAdapter, MbiCarteraAdapter  # noqa: E402

RAIZ = Path(__file__).resolve().parents[2]
SQL = RAIZ / "supabase" / "migrations" / "044_corredoras_cl.sql"

# Adaptadores que la 044 debe cubrir, con su slug y su `source`.
ESPERADOS = {
    BiceCarteraAdapter.portfolio_slug: BiceCarteraAdapter.name,
    MbiCarteraAdapter.portfolio_slug: MbiCarteraAdapter.name,
}


def _sql() -> str:
    assert SQL.is_file(), f"falta {SQL}"
    return SQL.read_text(encoding="utf-8")


def test_los_slugs_del_parser_estan_en_la_044() -> None:
    sql = _sql()
    for slug in ESPERADOS:
        assert f"'{slug}'" in sql, f"la 044 no declara el slug {slug}"


def test_la_044_no_declara_slugs_de_mas() -> None:
    sql = _sql()
    slugs = set(re.findall(r"^\s*\('([a-z0-9-]+)',\s*$", sql, flags=re.MULTILINE))
    slugs |= set(re.findall(r"^\s*\('([a-z0-9-]+)',\s+\S", sql, flags=re.MULTILINE))
    assert slugs == set(ESPERADOS), f"slugs inesperados en la 044: {slugs}"


def test_el_source_de_cada_fila_es_el_del_adapter() -> None:
    sql = _sql()
    for slug, source in ESPERADOS.items():
        bloque = re.search(
            rf"'{re.escape(slug)}'.*?on conflict",
            sql,
            flags=re.DOTALL,
        )
        assert bloque, f"no encontre el bloque del slug {slug}"
        assert f"'{source}'" in bloque.group(0), (
            f"el source de {slug} no es {source}"
        )


def test_es_idempotente_y_no_toca_followers_ni_return_ytd() -> None:
    # Sin comentarios: el encabezado menciona followers/return_ytd a proposito.
    sentencias = "\n".join(
        linea
        for linea in _sql().splitlines()
        if not linea.lstrip().startswith("--")
    )
    assert "on conflict (slug) do update" in sentencias
    update = sentencias.split("on conflict (slug) do update", 1)[1]
    assert "followers" not in update
    assert "return_ytd" not in update
