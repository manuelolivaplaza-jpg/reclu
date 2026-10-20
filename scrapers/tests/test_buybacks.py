"""Recompras de acciones (XBRL frames de la SEC). Sin red y sin Supabase.

Correr:
  uv run --python 3.11 --with httpx --with pytest --with supabase \
    python -m pytest scrapers/tests/test_buybacks.py
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from buybacks import (  # noqa: E402
    BuybackAdapter,
    buyback_record,
    enrich_with_market_cap,
    holdings_from_buybacks,
    parse_company_tickers,
    parse_frame,
    quarter_periods,
    rank_buybacks,
)

FIXTURE = (
    Path(__file__).resolve().parent / "fixtures" / "frames_buybacks_CY2026Q2.json"
)
PERIOD = "CY2026Q2"
AS_OF = date(2026, 10, 19)

# Solo los tres primeros CIK del fixture, con el ticker principal que publica
# company_tickers.json. El archivo real repite T-Mobile como TMUSZ/TMUSI/TMUSL.
TOP3_TICKERS = {
    "1065280": {"ticker": "NFLX", "title": "NETFLIX INC"},
    "927653": {"ticker": "MCK", "title": "MCKESSON CORP"},
    "1283699": {"ticker": "TMUS", "title": "T-Mobile US, Inc."},
}


@pytest.fixture(scope="module")
def payload() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def rows(payload: dict) -> list[dict]:
    return parse_frame(payload)


def test_fixture_parsea_114_recompras_positivas(rows: list[dict]) -> None:
    assert len(rows) == 114
    assert all(row["amount_usd"] > 0 for row in rows)
    assert all(row["period"] == PERIOD for row in rows)
    assert all(row["cik"] and row["name"] for row in rows)


def test_top_3_es_netflix_mckesson_y_tmobile(rows: list[dict]) -> None:
    top = rank_buybacks(rows, TOP3_TICKERS, top_n=3)

    assert [row["name"] for row in top] == [
        "Netflix, Inc.",
        "McKESSON CORPORATION",
        "T-MOBILE US, INC.",
    ]
    assert [row["ticker"] for row in top] == ["NFLX", "MCK", "TMUS"]
    assert [row["amount_usd"] for row in top] == [
        4714403000.0,
        2530000000.0,
        2320000000.0,
    ]


def test_url_publica_del_filing(rows: list[dict]) -> None:
    netflix = next(row for row in rows if row["cik"] == "1065280")
    assert netflix["source_url"].startswith(
        "https://www.sec.gov/Archives/edgar/data/1065280/000106528026000212/"
    )
    assert netflix["source_url"].endswith("-index.htm")


def test_parse_company_tickers_conserva_el_ticker_principal() -> None:
    mapping = parse_company_tickers(
        {
            "0": {"cik_str": 1283699, "ticker": "TMUS", "title": "T-Mobile US, Inc."},
            "1": {"cik_str": 1283699, "ticker": "TMUSZ", "title": "T-Mobile US, Inc."},
            "2": {"cik_str": 1283699, "ticker": "TMUSL", "title": "T-Mobile US, Inc."},
            "3": {"cik_str": 1065280, "ticker": "NFLX", "title": "NETFLIX INC"},
        }
    )

    assert mapping["1283699"]["ticker"] == "TMUS"
    assert mapping["1065280"]["ticker"] == "NFLX"
    assert set(mapping) == {"1283699", "1065280"}


def test_trimestres_candidatos() -> None:
    # Octubre ya es Q4; el trimestre cerrado más reciente es Q3.
    assert quarter_periods(date(2026, 10, 19))[:3] == [
        "CY2026Q4",
        "CY2026Q3",
        "CY2026Q2",
    ]
    assert quarter_periods(date(2026, 1, 15))[:2] == ["CY2026Q1", "CY2025Q4"]
    assert quarter_periods(date(2026, 1, 15), count=1) == ["CY2026Q1"]


def test_market_cap_y_pct_de_capitalizacion(rows: list[dict]) -> None:
    netflix = [row for row in rows if row["cik"] == "1065280"]
    ranked = rank_buybacks(netflix, TOP3_TICKERS, top_n=1)
    enriched = enrich_with_market_cap(
        ranked,
        {"1065280": 4163939676},
        {"NFLX": 69.85},
    )

    assert enriched[0]["market_cap_usd"] == round(4163939676 * 69.85, 2)
    assert enriched[0]["pct_capitalization"] == 1.6209


def test_sin_precio_o_acciones_queda_en_none(rows: list[dict]) -> None:
    netflix = rank_buybacks(
        [row for row in rows if row["cik"] == "1065280"],
        TOP3_TICKERS,
        top_n=1,
    )

    sin_precio = enrich_with_market_cap(netflix, {"1065280": 4163939676}, {})
    assert sin_precio[0]["market_cap_usd"] is None
    assert sin_precio[0]["pct_capitalization"] is None

    sin_acciones = enrich_with_market_cap(netflix, {}, {"NFLX": 69.85})
    assert sin_acciones[0]["pct_capitalization"] is None


def test_portafolio_top_20_igual_pesado() -> None:
    rows = [
        {
            "cik": str(index),
            "ticker": f"T{index}",
            "name": f"Empresa {index}",
            "amount_usd": float(1000 - index),
            "period": PERIOD,
            "source_url": "",
        }
        for index in range(25)
    ]

    ranked = rank_buybacks(rows, {}, top_n=20)
    holdings = holdings_from_buybacks(ranked, as_of=AS_OF)

    assert len(ranked) == 20
    assert len(holdings) == 20
    assert [holding.symbol for holding in holdings] == [f"T{index}" for index in range(20)]
    assert all(holding.weight == 5.0 for holding in holdings)
    assert all(holding.asset_class == "equity" for holding in holdings)
    assert all(holding.as_of == AS_OF for holding in holdings)


def test_rank_sin_tope_devuelve_todas_las_filas(rows: list[dict]) -> None:
    ranked = rank_buybacks(rows, {}, top_n=0, require_ticker=False)
    assert len(ranked) == len(rows)
    assert ranked[0]["cik"] == "1065280"


def test_registro_de_tabla(rows: list[dict]) -> None:
    netflix = next(row for row in rows if row["cik"] == "1065280")
    record = buyback_record(netflix)

    assert record["cik"] == "1065280"
    assert record["ticker"] is None  # parse_frame no inventa ticker
    assert record["period"] == PERIOD
    assert record["amount_usd"] == 4714403000.0
    assert record["source_url"].endswith("-index.htm")


class _ExplodingDB:
    """Si el dry-run toca la base, el test falla con un error claro."""

    def __getattr__(self, name: str):
        raise AssertionError(f"dry-run no debe tocar la base ({name})")


def test_dry_run_no_toca_la_base(
    monkeypatch: pytest.MonkeyPatch, rows: list[dict]
) -> None:
    adapter = BuybackAdapter(dry_run=True)
    monkeypatch.setattr(
        adapter,
        "fetch_raw",
        lambda: {"period": PERIOD, "rows": rows},
    )
    monkeypatch.setattr(adapter, "fetch_ticker_map", lambda: TOP3_TICKERS)
    monkeypatch.setattr(adapter, "fetch_shares", lambda cik: 1_000_000_000)
    monkeypatch.setattr(adapter, "fetch_price", lambda ticker: 100.0)

    result = adapter.run(db=_ExplodingDB())

    assert result["dry_run"] is True
    assert result["source"] == "buybacks"
    assert result["portfolio"] == "recompras-top20"
    assert result["period"] == PERIOD
    assert result["companies"] == 114
    assert result["ranked"] == 3
    assert result["holdings"] == 3
    assert result["with_market_cap"] == 3
    assert result["status"] == "ok"
