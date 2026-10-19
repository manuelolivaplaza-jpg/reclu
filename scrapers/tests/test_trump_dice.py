"""Tests de Trump dice sin red ni Supabase real.

Correr: uv run --with httpx --with pytest --with supabase python -m pytest scrapers/tests -q
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from trump_dice import (  # noqa: E402
    CASH_SYMBOL,
    build_trump_dice,
    entry_price,
    load_menciones,
    sync_mentions,
    validate_menciones,
)


def _mencion(
    mid: str,
    ticker: str,
    entrada: str,
    *,
    tipo: str = "compra_directa",
    status: str = "verificada",
    empresa: str | None = None,
    fuentes: list[str] | None = None,
) -> dict:
    row = {
        "id": mid,
        "fecha": entrada,
        "entrada": entrada,
        "ticker": ticker,
        "empresa": empresa or ticker,
        "tipo": tipo,
        "canal": "test",
        "cita": f"Cita de prueba {mid} sobre {ticker}.",
        "status": status,
    }
    if fuentes is not None:
        row["fuentes"] = fuentes
    else:
        row["fuentes"] = [f"https://example.com/{mid}"]
    return row


def _precios_planos(menciones: list[dict], px: float = 100.0, as_of: str = "2026-10-16") -> dict:
    prices: dict[str, dict[str, float]] = {}
    for m in menciones:
        if m["ticker"] == "X":
            continue
        serie = prices.setdefault(m["ticker"], {})
        serie[str(m["entrada"])[:10]] = px
        serie[as_of] = px
    return prices


class _Resp:
    def __init__(self, data) -> None:
        self.data = data


class _Query:
    def __init__(self, db: "FakeDB", table: str) -> None:
        self.db = db
        self.table = table
        self.op = "select"
        self.payload = None

    def select(self, *_args, **_kwargs):
        self.op = "select"
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def maybe_single(self):
        return self

    def insert(self, row):
        self.op = "insert"
        self.payload = row
        return self

    def execute(self):
        if self.op == "insert":
            self.db.rows.setdefault(self.table, []).append(self.payload)
            return _Resp(self.payload)
        if self.table == "portfolios":
            return _Resp({"id": "portfolio-trump-dice"})
        return _Resp(list(self.db.rows.get(self.table, [])))


class FakeDB:
    """Mock mínimo del cliente supabase usado por sync_mentions."""

    def __init__(self) -> None:
        self.rows: dict[str, list] = {"mentions": [], "alerts": []}

    def table(self, name: str) -> _Query:
        self.rows.setdefault(name, [])
        return _Query(self, name)

    @property
    def mentions(self) -> list:
        return self.rows["mentions"]

    @property
    def alerts(self) -> list:
        return self.rows["alerts"]


def test_json_real_pesos_suman_100_cash_out_y_dell_x5():
    menciones = load_menciones()
    assert len(menciones) == 15
    assert all(any(str(u).startswith("https://") for u in m["fuentes"]) for m in menciones)
    dell = [m for m in menciones if m["ticker"] == "DELL"]
    assert len(dell) == 5

    as_of = date(2026, 10, 16)
    rows = build_trump_dice(menciones, _precios_planos(menciones), as_of=as_of)
    by_symbol = {r["symbol"]: r for r in rows}

    assert round(sum(r["weight"] for r in rows), 2) == 100.0
    assert set(by_symbol) == {"DELL", "INTC", "MU", "AAPL", "TSLA", "PLTR", "SPY", CASH_SYMBOL}
    # 5 compras de DELL a US$100, último cierre US$100 → 50 unidades y 5/15 del valor.
    assert by_symbol["DELL"]["units"] == 50.0
    assert by_symbol["DELL"]["weight"] == 33.33
    assert by_symbol["INTC"]["units"] == 40.0
    assert by_symbol["INTC"]["weight"] == 26.67
    # X deslistada: US$1.000 / 55, valorizada a US$55 → efectivo, no el ticker X.
    cash = by_symbol[CASH_SYMBOL]
    assert cash["asset_class"] == "cash"
    assert cash["units"] == round(1000 / 55, 6)
    assert cash["value"] == 1000.0
    assert "X" not in by_symbol


def test_cash_out_solo_x_pesa_100():
    rows = build_trump_dice(
        [_mencion("M03", "X", "2025-05-23", tipo="elogio_acuerdo", empresa="United States Steel")],
        {},
        as_of=date(2026, 10, 16),
    )
    assert len(rows) == 1
    assert rows[0]["symbol"] == CASH_SYMBOL
    assert rows[0]["asset_class"] == "cash"
    assert rows[0]["weight"] == 100.0
    assert rows[0]["value"] == 1000.0


def test_dell_x5_suma_unidades_no_reemplaza():
    fechas = ["2025-12-10", "2026-02-19", "2026-05-08", "2026-07-06", "2026-07-22"]
    precios = {"DELL": {f: 100.0 + i * 10 for i, f in enumerate(fechas)}}
    precios["DELL"]["2026-10-16"] = 200.0
    cinco = [
        _mencion(f"D{i}", "DELL", f, empresa="Dell Technologies")
        for i, f in enumerate(fechas, start=1)
    ]
    una = build_trump_dice([cinco[0]], precios, as_of=date(2026, 10, 16))
    todas = build_trump_dice(cinco, precios, as_of=date(2026, 10, 16))
    esperadas = sum(1000.0 / precios["DELL"][f] for f in fechas)

    assert len(todas) == 1
    assert todas[0]["units"] == round(esperadas, 6)
    assert todas[0]["units"] > una[0]["units"] * 4
    assert todas[0]["weight"] == 100.0


def test_entrada_al_siguiente_dia_habil():
    # 2026-01-03 es sábado; el primer cierre está el lunes 05.
    precios = {"AAPL": {"2026-01-05": 100.0, "2026-01-06": 110.0}}
    mencion = _mencion("H1", "AAPL", "2026-01-03", tipo="elogio", empresa="Apple")
    assert entry_price(precios, mencion) == (date(2026, 1, 5), 100.0)

    rows = build_trump_dice([mencion], precios, as_of=date(2026, 1, 6))
    assert rows[0]["units"] == 10.0
    assert rows[0]["value"] == 1100.0
    assert rows[0]["weight"] == 100.0


def test_pendiente_no_genera_holding_ni_alerta():
    precios = {
        "DELL": {"2026-02-19": 100.0, "2026-10-16": 100.0},
        "INTC": {"2026-02-19": 50.0, "2026-10-16": 50.0},
    }
    menciones = [
        _mencion("P1", "DELL", "2026-02-19", status="pendiente"),
        _mencion("V1", "INTC", "2026-02-19", tipo="elogio", empresa="Intel"),
    ]
    rows = build_trump_dice(menciones, precios, as_of=date(2026, 10, 16))
    assert [r["symbol"] for r in rows] == ["INTC"]

    db = FakeDB()
    resumen = sync_mentions(db, menciones, dry_run=False)
    assert resumen["alertas"] == 1
    assert resumen["omitidas"] == 1
    assert [a["type"] for a in db.alerts] == ["mention"]
    assert db.alerts[0]["severity"] == "medium"
    assert [m["external_id"] for m in db.mentions] == ["V1"]


def test_mencion_verificada_nueva_una_alerta_y_no_repite():
    db = FakeDB()
    menciones = [_mencion("M99", "DELL", "2026-02-19", empresa="Dell Technologies")]

    primera = sync_mentions(db, menciones, dry_run=False)
    assert primera == {"insertadas": 1, "alertas": 1, "omitidas": 0}
    assert len(db.alerts) == 1
    alerta = db.alerts[0]
    assert alerta["type"] == "mention"
    assert alerta["severity"] == "high"
    assert alerta["is_published"] is True
    assert alerta["payload"]["symbol"] == "DELL"
    assert alerta["payload"]["speaker"] == "Donald Trump"
    assert db.mentions[0]["external_id"] == "M99"
    assert db.mentions[0]["status"] == "verificada"

    segunda = sync_mentions(db, menciones, dry_run=False)
    assert segunda["alertas"] == 0
    assert segunda["insertadas"] == 0
    assert len(db.alerts) == 1
    assert len(db.mentions) == 1


def test_json_sin_source_urls_se_rechaza():
    base = _mencion("M01", "DELL", "2026-02-19")
    vacia = {**base, "fuentes": []}
    with pytest.raises(ValueError, match="source_urls"):
        validate_menciones([vacia])

    sin_clave = {k: v for k, v in base.items() if k != "fuentes"}
    with pytest.raises(ValueError, match="source_urls"):
        validate_menciones([sin_clave])

    no_url = {**base, "fuentes": ["sin-url"]}
    with pytest.raises(ValueError, match="source_urls"):
        validate_menciones([no_url])
