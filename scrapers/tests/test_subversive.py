"""N-PORT de NANC/GOP (F26). Sin red ni base de datos.

El fixture es SINTÉTICO: nombres, tickers y pesos inventados.

Correr: uv run --with httpx --with pytest python -m pytest scrapers/tests/test_subversive.py -q
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import etfs  # noqa: E402

FIXTURE = (
    Path(__file__).resolve().parent / "fixtures" / "nport_subversive_sintetico.xml"
)


def _xml() -> str:
    return FIXTURE.read_text(encoding="utf-8")


def test_fixture_es_sintetico():
    texto = _xml()
    assert "SINTÉTICO" in texto
    assert "S000000001" in texto


def test_parse_nport_holdings_basico():
    rows = etfs.parse_nport_holdings(_xml(), series_id="S000000001")

    assert [r["symbol"] for r in rows] == ["ALFA", "BETA"]
    assert [r["weight"] for r in rows] == [60.0, 40.0]
    assert all(r["as_of"] == "2026-06-30" for r in rows)
    assert all(r["currency"] == "USD" for r in rows)
    assert all(r["asset_class"] == "etf" for r in rows)
    assert rows[0]["name"] == "ALFA CORP SINTÉTICA"


def test_parse_ignora_filas_sin_ticker():
    rows = etfs.parse_nport_holdings(_xml())
    assert all(r["symbol"] for r in rows)
    assert len(rows) == 2


def test_parse_rechaza_otra_serie():
    with pytest.raises(ValueError, match="se esperaba S000000099"):
        etfs.parse_nport_holdings(_xml(), series_id="S000000099")


def test_peso_de_respaldo_si_falta_pct_val():
    texto = _xml().replace(
        "<pctVal>60.0000</pctVal>",
        "",
    )
    rows = etfs.parse_nport_holdings(texto, series_id="S000000001")
    alfa = next(r for r in rows if r["symbol"] == "ALFA")
    # 600 / 1000 activos netos = 60 %
    assert alfa["weight"] == pytest.approx(60.0)


def test_mapa_de_series_verificado():
    assert etfs.SUBVERSIVE_FUNDS["nanc-etf"]["series_id"] == "S000088363"
    assert etfs.SUBVERSIVE_FUNDS["gop-etf"]["series_id"] == "S000088364"


def test_fetch_subversive_usa_el_nport(monkeypatch):
    monkeypatch.setitem(
        etfs.SUBVERSIVE_FUNDS,
        "nanc-etf",
        {"series_id": "S000000001", "series_name": "ETF SINTÉTICO DE PRUEBA"},
    )
    monkeypatch.setattr(etfs, "_latest_nport_doc", lambda series_id, name: _xml())
    rows = etfs.fetch_subversive("nanc-etf")
    assert [r["symbol"] for r in rows] == ["ALFA", "BETA"]


def test_fetch_subversive_desconocido():
    with pytest.raises(ValueError, match="unknown Subversive ETF"):
        etfs.fetch_subversive("nope")


def test_fetch_etf_despacha_subversive(monkeypatch):
    monkeypatch.setattr(etfs, "fetch_subversive", lambda slug: [{"symbol": slug}])
    assert etfs.fetch_etf("gop-etf") == [{"symbol": "gop-etf"}]


# --- F26B: NANC/GOP detrás del muro -------------------------------------

SQL_026 = (
    Path(__file__).resolve().parents[2]
    / "supabase"
    / "migrations"
    / "026_etf_politicos.sql"
)


def _sql_026() -> str:
    assert SQL_026.is_file(), f"falta {SQL_026}"
    # Normaliza CRLF para que las aserciones multilinea valgan en Windows.
    return SQL_026.read_text(encoding="utf-8").replace("\r\n", "\n").lower()


def _fila_026(slug: str) -> str:
    sql = _sql_026()
    inicio = sql.find(f"'{slug}'")
    assert inicio >= 0, f"la 026 no siembra {slug}"
    fin = sql.find("),", inicio)
    assert fin > inicio, f"no encuentro el cierre de la fila {slug}"
    return sql[inicio:fin]


def test_migracion_026_marca_los_dos_etf_como_premium():
    # Son un ETF (producto comercial) con holdings del N-PORT, no PTR
    # oficiales: van detrás del muro por decisión de producto.
    for slug in ("nanc-etf", "gop-etf"):
        fila = _fila_026(slug)
        assert "'nport_subversive'" in fila
        assert "\n    true,\n    array[" in fila, (
            f"{slug} debe tener premium = true (no {fila!r})"
        )


def test_migracion_026_corrige_filas_existentes():
    sql = _sql_026()
    assert "on conflict (slug) do update set premium = true" in sql
    assert "do nothing" not in sql


def test_migracion_026_separa_los_etf_de_las_declaraciones_publicas():
    # La excepción legal sigue siendo solo PTR/OGE; el comentario lo explica.
    sql = _sql_026()
    assert "producto comercial" in sql
    assert "house_ptr" in sql and "senate_ptr" in sql and "oge_278t" in sql
