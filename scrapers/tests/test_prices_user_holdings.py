"""Precios de las tenencias de usuarios (F63). Sin red ni Supabase real.

Correr desde scrapers/:
    uv run --with pytest --with-requirements requirements.txt pytest -q \
        tests/test_prices_user_holdings.py
"""

from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import prices  # noqa: E402
import run_all  # noqa: E402
from prices import (  # noqa: E402
    collect_price_symbols,
    merge_price_symbols,
    normalize_symbol,
    symbols_from_user_holdings,
    user_holdings_prices_enabled,
)


class FakeTable:
    """Registra selects/limits/upserts para comprobar que no se escribe."""

    def __init__(self, rows: list[dict]) -> None:
        self.rows = rows
        self.selected: str | None = None
        self.limit_value: int | None = None
        self.upserts: list[list[dict]] = []

    def select(self, columns: str) -> "FakeTable":
        self.selected = columns
        return self

    def limit(self, value: int) -> "FakeTable":
        self.limit_value = value
        return self

    def execute(self) -> SimpleNamespace:
        rows = self.rows[: self.limit_value] if self.limit_value else self.rows
        return SimpleNamespace(data=[dict(row) for row in rows])

    def upsert(self, payload, on_conflict=None) -> "FakeTable":  # noqa: ANN001
        self.upserts.append(list(payload))
        return self


class FakeDB:
    """DB mínima: solo `user_holdings` tiene filas."""

    def __init__(self, rows: list[dict]) -> None:
        self.rows = rows
        self.tables: dict[str, list[FakeTable]] = {}

    def table(self, name: str) -> FakeTable:
        table = FakeTable(self.rows if name == "user_holdings" else [])
        self.tables.setdefault(name, []).append(table)
        return table

    @property
    def writes(self) -> list[list[dict]]:
        return [payload for tables in self.tables.values() for t in tables for payload in t.upserts]


@pytest.fixture(autouse=True)
def _flags_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("USER_HOLDINGS_PRICES_ENABLED", raising=False)
    monkeypatch.delenv("PRICE_SYMBOLS", raising=False)


def test_flag_apagada_por_defecto(monkeypatch: pytest.MonkeyPatch) -> None:
    assert user_holdings_prices_enabled() is False
    monkeypatch.setenv("USER_HOLDINGS_PRICES_ENABLED", "1")
    assert user_holdings_prices_enabled() is False
    monkeypatch.setenv("USER_HOLDINGS_PRICES_ENABLED", "true")
    assert user_holdings_prices_enabled() is True
    monkeypatch.setenv("USER_HOLDINGS_PRICES_ENABLED", "TRUE")
    assert user_holdings_prices_enabled() is False


def test_normaliza_chilenos_con_sufijo_sn_sin_duplicar() -> None:
    assert normalize_symbol("SQM-B", "CL") == "SQM-B.SN"
    assert normalize_symbol("sqm-b.sn", "CL") == "SQM-B.SN"
    assert normalize_symbol("BSANTANDER", "CL") == "BSANTANDER.SN"
    assert normalize_symbol("NVDA", "US") == "NVDA"
    assert normalize_symbol("nvda") == "NVDA"
    assert normalize_symbol("   ") == ""


def test_merge_sin_duplicados_y_con_orden_estable() -> None:
    merged = merge_price_symbols(["NVDA", "AAPL"], ["aapl", "SQM-B.SN", ""])
    assert merged == ["NVDA", "AAPL", "SQM-B.SN"]


def test_symbols_from_user_holdings_solo_devuelve_tickers_distintos() -> None:
    db = FakeDB(
        [
            {"symbol": "NVDA", "market": "US"},
            {"symbol": "nvda", "market": "US"},
            {"symbol": "SQM-B", "market": "CL"},
            {"symbol": "SQM-B.SN", "market": "CL"},
            {"symbol": "", "market": "CL"},
        ]
    )

    symbols = symbols_from_user_holdings(db)

    assert symbols == ["NVDA", "SQM-B.SN"]
    assert all(isinstance(symbol, str) for symbol in symbols)
    table = db.tables["user_holdings"][0]
    assert table.selected == "symbol, market"
    assert table.limit_value == 500


def test_symbols_from_user_holdings_respeta_limit() -> None:
    db = FakeDB(
        [
            {"symbol": "A", "market": "US"},
            {"symbol": "B", "market": "US"},
            {"symbol": "C", "market": "US"},
        ]
    )

    assert symbols_from_user_holdings(db, limit=2) == ["A", "B"]
    assert db.tables["user_holdings"][0].limit_value == 2


def test_collect_ignora_user_holdings_si_la_flag_esta_apagada() -> None:
    db = FakeDB([{"symbol": "SQM-B", "market": "CL"}])

    symbols, added = collect_price_symbols(db)

    assert "user_holdings" not in db.tables
    assert symbols == prices.merge_price_symbols(prices.PRICE_SYMBOLS, [])
    assert added == 0


def test_collect_agrega_user_holdings_y_cuenta_los_nuevos(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("USER_HOLDINGS_PRICES_ENABLED", "true")
    monkeypatch.setenv("PRICE_SYMBOLS", "NVDA,AAPL")
    db = FakeDB(
        [
            {"symbol": "NVDA", "market": "US"},
            {"symbol": "SQM-B", "market": "CL"},
        ]
    )

    symbols, added = collect_price_symbols(db)

    assert symbols == ["NVDA", "AAPL", "SQM-B.SN"]
    assert added == 1


def test_run_prices_dry_run_no_escribe_y_reporta_cuantos_agregaria(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("USER_HOLDINGS_PRICES_ENABLED", "true")
    monkeypatch.setenv("PRICE_SYMBOLS", "NVDA")
    monkeypatch.setattr(prices, "fetch_eod", lambda symbol, days=365: [("2026-01-02", 100.0)])
    monkeypatch.setattr(prices.time, "sleep", lambda seconds: None)

    db = FakeDB([{"symbol": "SQM-B", "market": "CL"}])
    results = run_all.run_prices(db, dry_run=True)

    assert db.writes == []
    out = capsys.readouterr().out
    assert "1 símbolos de user_holdings se agregarían" in out
    assert "2 símbolos en total" in out
    assert results == [
        {"source": "prices", "status": "ok", "ok": 2, "total": 2},
    ]
