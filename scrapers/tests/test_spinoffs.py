"""Parsers de Form 10-12B (spin-offs). Sin red y sin Supabase.

Correr:
  uv run --python 3.11 --with httpx --with pytest --with supabase \
    python -m pytest scrapers/tests/test_spinoffs.py
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from spinoffs import (  # noqa: E402
    STATUS_PENDING,
    STATUS_TRADING,
    SpinoffsAdapter,
    group_by_cik,
    holdings_from_spinoffs,
    parse_efts_payload,
    spinoff_record,
)

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "efts_10-12B_2026H2.json"
AS_OF = date(2026, 10, 19)


@pytest.fixture(scope="module")
def payload() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def filings(payload: dict) -> list[dict]:
    return parse_efts_payload(payload)


@pytest.fixture(scope="module")
def rows(filings: list[dict]) -> list[dict]:
    return group_by_cik(filings)


def test_fixture_tiene_los_17_filings(filings: list[dict]) -> None:
    assert len(filings) == 17


def test_parsea_ticker_y_cik_del_display_name(filings: list[dict]) -> None:
    msgs = [filing for filing in filings if filing["cik"] == "2132873"]
    assert msgs
    assert all(filing["name"] == "MSGS Spinco, Inc." for filing in msgs)
    assert any(filing["ticker"] == "MSGR" for filing in msgs)
    assert any(filing["is_amendment"] for filing in msgs)
    assert all(filing["form"].startswith("10-12B") for filing in msgs)


def test_agrupa_enmiendas_por_cik(rows: list[dict]) -> None:
    assert len(rows) == 9

    msgs = next(row for row in rows if row["cik"] == "2132873")
    assert msgs["filings"] == 5
    assert msgs["first_filed_at"] == "2026-08-14"
    assert msgs["last_filed_at"] == "2026-09-30"
    assert msgs["ticker"] == "MSGR"
    assert msgs["status"] == STATUS_TRADING

    vylor = next(row for row in rows if row["cik"] == "2128626")
    assert vylor["filings"] == 3
    assert vylor["ticker"] == "VYLR"
    assert vylor["first_filed_at"] == "2026-08-14"


def test_sin_ticker_queda_en_curso(rows: list[dict]) -> None:
    trinzic = next(row for row in rows if row["cik"] == "2101664")
    assert trinzic["ticker"] == ""
    assert trinzic["status"] == STATUS_PENDING
    assert trinzic["first_filed_at"] == trinzic["last_filed_at"] == "2026-09-30"

    archer = next(row for row in rows if row["cik"] == "2130999")
    assert archer["ticker"] == ""
    assert archer["status"] == STATUS_PENDING


def test_registro_de_tabla_sin_ticker_es_null(rows: list[dict]) -> None:
    trinzic = next(row for row in rows if row["cik"] == "2101664")
    record = spinoff_record(trinzic)
    assert record["cik"] == "2101664"
    assert record["name"] == "Trinzic, Inc."
    assert record["ticker"] is None
    assert record["status"] == STATUS_PENDING
    assert record["first_filed_at"] == "2026-09-30"


def test_portafolio_solo_con_ticker_e_igual_pesado(rows: list[dict]) -> None:
    holdings = holdings_from_spinoffs(rows, as_of=AS_OF)

    assert {holding.symbol for holding in holdings} == {"MSGR", "VYLR", "BSEM", "ADIG"}
    assert [holding.symbol for holding in holdings] == ["ADIG", "BSEM", "MSGR", "VYLR"]
    assert all(holding.weight == 25.0 for holding in holdings)
    assert all(holding.asset_class == "equity" for holding in holdings)
    assert all(holding.as_of == AS_OF for holding in holdings)


def test_portafolio_ignora_filings_de_mas_de_12_meses(rows: list[dict]) -> None:
    holdings = holdings_from_spinoffs(rows, as_of=date(2028, 1, 1))
    assert holdings == []


def test_dry_run_no_toca_la_base(monkeypatch: pytest.MonkeyPatch, filings: list[dict]) -> None:
    adapter = SpinoffsAdapter(dry_run=True)
    monkeypatch.setattr(adapter, "fetch_efts", lambda today=None: filings)

    result = adapter.run(db=None)

    assert result["dry_run"] is True
    assert result["source"] == "spinoffs"
    assert result["portfolio"] == "spinoffs-12m"
    assert result["filings"] == 17
    assert result["spinoffs"] == 9
    assert result["trading"] == 4
    assert result["holdings"] == 4
    assert result["status"] == "ok"


def test_url_publica_del_filing(filings: list[dict]) -> None:
    msgs = next(filing for filing in filings if filing["cik"] == "2132873")
    assert msgs["source_url"].startswith(
        "https://www.sec.gov/Archives/edgar/data/2132873/000119312526409182/"
    )
    assert msgs["source_url"].endswith(".htm")
