"""Flujos de ETFs iShares (F35). Sin red ni base de datos.

El fixture es la cabecera real del CSV de iShares del ECH (Oct 15, 2026):
'Shares Outstanding,"24,700,000.00"'. Se verifica el parseo de la cabecera,
el cálculo del flujo (Δ acciones × NAV) y que la etapa existe y no escribe
en dry-run.

Correr desde scrapers/:
  uv run --with pytest --with-requirements requirements.txt pytest tests/test_etf_flows.py -q
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import etf_flows  # noqa: E402
import etfs  # noqa: E402

FIXTURE = (
    Path(__file__).resolve().parent / "fixtures" / "F35" / "ech_csv_cabecera.txt"
)
RAIZ = Path(__file__).resolve().parents[2]
SQL = RAIZ / "supabase" / "migrations" / "035_flujos_etf.sql"


def _csv() -> str:
    assert FIXTURE.is_file(), f"falta el fixture {FIXTURE}"
    return FIXTURE.read_text(encoding="utf-8")


# --- 1. La cabecera de ECH -------------------------------------------------


def test_cabecera_ech_da_24_700_000_acciones():
    _rows, header = etfs.parse_ishares_csv(_csv())
    assert header["shares_outstanding"] == pytest.approx(24_700_000.0)


def test_cabecera_ech_trae_fecha_y_fondo():
    _rows, header = etfs.parse_ishares_csv(_csv())
    assert header["as_of"] == "2026-10-15"
    assert header["inception_date"] == "2007-11-12"


def test_cabecera_ech_estima_nav_por_accion():
    _rows, header = etfs.parse_ishares_csv(_csv())
    # El patrimonio sale de Market Value / Weight(%) de cada posición.
    assert header["net_assets_metodo"] == "peso_por_posicion"
    assert header["net_assets_usd"] == pytest.approx(110_412_506.32 / 0.1217, rel=1e-3)
    assert header["nav"] == pytest.approx(
        header["net_assets_usd"] / 24_700_000.0, rel=1e-9
    )


def test_parse_ishares_sigue_devolviendo_los_holdings():
    rows, _header = etfs.parse_ishares_csv(_csv())
    assert [r["symbol"] for r in rows] == ["CHILE", "SQM.B"]
    assert rows[0]["weight"] == 12.17
    assert rows[0]["as_of"] == "2026-10-15"


def test_fetch_ishares_con_cabecera(monkeypatch):
    monkeypatch.setattr(etfs, "_get", lambda url: _csv())
    rows, header = etfs.fetch_ishares("ech", with_header=True)
    assert len(rows) == 2
    assert header["shares_outstanding"] == pytest.approx(24_700_000.0)


def test_fetch_ishares_sin_cabecera_sigue_devolviendo_lista(monkeypatch):
    monkeypatch.setattr(etfs, "_get", lambda url: _csv())
    rows = etfs.fetch_ishares("ech")
    assert isinstance(rows, list)
    assert rows[0]["symbol"] == "CHILE"


# --- 2. El cálculo del flujo ------------------------------------------------


def test_calcular_flujo_delta_por_nav():
    # +1.000.000 de acciones a NAV 30 = +30.000.000 USD
    assert etf_flows.calcular_flujo(25_700_000.0, 24_700_000.0, 30.0) == pytest.approx(
        30_000_000.0
    )


def test_calcular_flujo_negativo_cuando_hay_canje():
    assert etf_flows.calcular_flujo(23_700_000.0, 24_700_000.0, 30.0) == pytest.approx(
        -30_000_000.0
    )


def test_calcular_flujo_sin_lectura_anterior_es_cero():
    assert etf_flows.calcular_flujo(24_700_000.0, None, 30.0) == 0.0


def test_calcular_flujo_sin_nav_es_cero():
    assert etf_flows.calcular_flujo(24_700_000.0, 24_000_000.0, None) == 0.0


def test_calcular_flujo_con_acciones_iguales_es_cero():
    assert etf_flows.calcular_flujo(24_700_000.0, 24_700_000.0, 30.0) == 0.0


# --- 3. La etapa ------------------------------------------------------------


def test_la_etapa_existe_y_declara_contrato():
    from stages import discover_stages

    ids = [meta[0] for meta, _runner in discover_stages()]
    assert "etf_flows" in ids


def test_dry_run_no_toca_supabase(monkeypatch):
    """collect(dry_run=True) no lee ni escribe Supabase."""

    class _DbVeneno:
        def __getattr__(self, name: str):
            raise AssertionError(f"dry-run toco Supabase: db.{name}()")

    monkeypatch.setattr(etf_flows, "fetch_flow_data", lambda slug: {
        "symbol": slug.upper(),
        "fecha": "2026-10-15",
        "acciones": 24_700_000.0,
        "nav": 36.7,
        "net_assets": 906_000_000.0,
        "net_assets_metodo": "peso_por_posicion",
        "url": "https://example.invalid/x.csv",
    })
    resumen = etf_flows.collect(_DbVeneno(), dry_run=True)
    assert resumen["dry_run"] is True
    assert resumen["fuentes_ok"] == len(etf_flows.TICKER_POR_SLUG)


def test_mapa_de_tickers_cubre_los_etfs_de_ishares():
    assert set(etf_flows.TICKER_POR_SLUG) == set(etfs.ISHARES_FUNDS)
    assert etf_flows.TICKER_POR_SLUG["ech"] == "ECH"
    assert etf_flows.slug_para_ticker("ECH") == "ech"
    assert etf_flows.slug_para_ticker("NOPE") is None


# --- 4. La migración 035 ----------------------------------------------------


def _sql() -> str:
    assert SQL.is_file(), f"falta {SQL}"
    return SQL.read_text(encoding="utf-8")


def test_la_migracion_035_crea_la_tabla_etf_flows():
    sql = _sql()
    assert "create table if not exists public.etf_flows" in sql
    for columna in ("symbol", "fecha", "acciones", "nav", "flujo_usd"):
        assert columna in sql, f"falta la columna {columna}"


def test_la_migracion_035_es_idempotente():
    sql = _sql()
    assert "create table if not exists" in sql
    assert "create index if not exists" in sql
    assert "drop policy if exists" in sql
    assert "drop trigger if exists" in sql
    # No debe haber DROP TABLE ni CREATE TABLE sin IF NOT EXISTS.
    assert "drop table" not in sql
    assert "create table public." not in sql
    # Una sola vez el trigger y la policy (drop + create = reejecutable).
    assert sql.count("create trigger set_etf_flows_updated_at") == 1
    assert sql.count('create policy "etf_flows public read"') == 1


def test_la_migracion_035_tiene_restriccion_unica():
    sql = _sql()
    assert "unique (symbol, fecha)" in sql
