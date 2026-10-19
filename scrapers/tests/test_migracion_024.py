"""La migracion 024 debe reutilizar los slugs oficiales de la 044.

Lee las migraciones como texto: sin Supabase y sin red.
Correr: python -m pytest scrapers/tests/test_migracion_024.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from corredoras_cl import BiceCarteraAdapter, MbiCarteraAdapter  # noqa: E402

RAIZ = Path(__file__).resolve().parents[2]
SQL_024 = RAIZ / "supabase" / "migrations" / "024_consenso_corredoras.sql"
SQL_044 = RAIZ / "supabase" / "migrations" / "044_corredoras_cl.sql"

BICE = BiceCarteraAdapter.portfolio_slug
MBI = MbiCarteraAdapter.portfolio_slug
CONSENSO = "consenso-corredoras-cl"
SLUGS_OFICIALES = {BICE, MBI}


def _sql(ruta: Path) -> str:
    assert ruta.is_file(), f"falta {ruta}"
    return ruta.read_text(encoding="utf-8")


def _sin_comentarios(sql: str) -> str:
    return "\n".join(
        linea for linea in sql.splitlines() if not linea.lstrip().startswith("--")
    )


def test_los_slugs_de_la_024_son_los_de_la_044() -> None:
    sql_024 = _sin_comentarios(_sql(SQL_024))
    sql_044 = _sql(SQL_044)

    for slug in SLUGS_OFICIALES:
        assert f"'{slug}'" in sql_024, f"la 024 no usa el slug {slug}"
        assert f"'{slug}'" in sql_044, f"la 044 no declara el slug {slug}"

    assert "bice-cartera-recomendada" not in sql_024
    assert "mbi-cartera-recomendada" not in sql_024


def test_bice_y_mbi_se_insertan_sin_pisar_la_044() -> None:
    sentencias = _sin_comentarios(_sql(SQL_024))
    primera = sentencias.split("insert into public.portfolios", 1)[1]
    primera = primera.split("insert into public.portfolios", 1)[0]

    assert "on conflict (slug) do nothing" in primera
    for slug in SLUGS_OFICIALES:
        assert f"'{slug}'" in primera


def test_el_consenso_mantiene_su_slug() -> None:
    sentencias = _sin_comentarios(_sql(SQL_024))
    assert f"'{CONSENSO}'" in sentencias


def test_los_holdings_semilla_apuntan_a_slugs_declarados() -> None:
    sentencias = _sin_comentarios(_sql(SQL_024))
    bloque = sentencias.split("with filas(slug, symbol, name, weight) as (", 1)[1]
    bloque = bloque.split("insert into public.holdings", 1)[0]

    slugs = set(re.findall(r"\('([a-z0-9-]+)',\s*'", bloque))
    assert slugs == SLUGS_OFICIALES | {CONSENSO}
