"""Tests de Elon Musk dice, sin red ni Supabase real.

Correr: uv run --with httpx --with pytest --with supabase python -m pytest scrapers/tests/test_musk_dice.py -q
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from musk_dice import (  # noqa: E402
    build_musk_holdings,
    detectar_candidatas,
    entry_date_from_utc,
    load_menciones,
    sync_musk_mentions,
    to_mention,
)
from trump_dice import build_trump_dice  # noqa: E402


def _precios_planos(menciones: list[dict], px: float = 100.0, as_of: str = "2026-10-16") -> dict:
    prices: dict[str, dict[str, float]] = {}
    for m in menciones:
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
            return _Resp({"id": "portfolio-musk-dice"})
        return _Resp(list(self.db.rows.get(self.table, [])))


class FakeDB:
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


def test_json_real_tiene_url_de_x_y_pesos_50():
    menciones = load_menciones()
    assert len(menciones) == 4
    for m in menciones:
        assert m["fuentes"][0].startswith("https://x.com/elonmusk/status/")
        assert m["id"] == m["fuentes"][0].rstrip("/").split("/")[-1]
        assert m["entrada"] == entry_date_from_utc(m["utc"]).isoformat()

    rows = build_musk_holdings(menciones)
    assert [(r["symbol"], r["weight"]) for r in rows] == [("ETSY", 50.0), ("GME", 50.0)]
    assert sum(r["weight"] for r in rows) == 100.0
    assert all(r["asset_class"] == "equity" for r in rows)
    assert "TSLA" not in {r["symbol"] for r in rows}
    assert "CDR" not in {r["symbol"] for r in rows}


def test_empresa_propia_no_genera_alerta_ni_holding():
    menciones = load_menciones()
    tsla = next(m for m in menciones if m["ticker"] == "TSLA")
    assert tsla["tipo"] == "empresa_propia"

    rows = build_musk_holdings(menciones)
    assert all(r["symbol"] != "TSLA" for r in rows)

    # Tampoco entra si se le pide el motor de Trump con el salto de F11.
    precios = _precios_planos(menciones)
    via_trump = build_trump_dice(
        menciones,
        precios,
        as_of=date(2026, 10, 16),
        skip_kinds={"empresa_propia"},
        skip_symbols={"CDR"},
        equal_weight=True,
    )
    assert [r["symbol"] for r in via_trump] == ["ETSY", "GME"]

    db = FakeDB()
    resumen = sync_musk_mentions(db, menciones, dry_run=False)
    assert resumen["insertadas"] == 4
    assert resumen["alertas"] == 3
    assert resumen["omitidas"] == 0
    assert {m["external_id"] for m in db.mentions} == {m["id"] for m in menciones}
    assert any(m["kind"] == "empresa_propia" and m["symbol"] == "TSLA" for m in db.mentions)
    assert all(a["payload"]["kind"] != "empresa_propia" for a in db.alerts)
    assert all(a["payload"]["symbol"] != "TSLA" for a in db.alerts)
    assert all(a["payload"]["speaker"] == "Elon Musk" for a in db.alerts)
    assert all(str(a["payload"]["source_url"]).startswith("https://x.com/") for a in db.alerts)
    assert all(a["type"] == "mention" for a in db.alerts)

    segunda = sync_musk_mentions(db, menciones, dry_run=False)
    assert segunda["alertas"] == 0
    assert segunda["insertadas"] == 0
    assert len(db.alerts) == 3


def test_entrada_antes_y_despues_de_la_apertura():
    # Antes de la apertura (06:25 ET): cierre del mismo día.
    assert entry_date_from_utc("2021-01-26T11:25:00Z") == date(2021, 1, 26)
    # Después del cierre (16:08 ET), también después de la apertura: día hábil siguiente.
    assert entry_date_from_utc("2021-01-26T21:08:00Z") == date(2021, 1, 27)
    # 02:34 UTC del 28 es 21:34 ET del 27: después del cierre, entra el 28.
    assert entry_date_from_utc("2021-01-28T02:34:00Z") == date(2021, 1, 28)
    # Tesla, 11:11 ET (ya abrió, todavía no cierra): el mismo día, como la tabla.
    assert entry_date_from_utc("2020-05-01T15:11:00Z") == date(2020, 5, 1)
    # Sábado antes del cierre de un día hábil: salta al lunes.
    assert entry_date_from_utc("2021-01-30T15:00:00Z") == date(2021, 2, 1)

    menciones = load_menciones()
    por_ticker = {m["ticker"]: m["entrada"] for m in menciones}
    assert por_ticker == {
        "ETSY": "2021-01-26",
        "GME": "2021-01-27",
        "CDR": "2021-01-28",
        "TSLA": "2020-05-01",
    }


def test_pendiente_no_genera_alerta_ni_holding():
    posts = [
        {"id": "1", "text": "Look at $ETSY today", "url": "https://x.com/elonmusk/status/1"},
        {"id": "2", "text": "Buy GameStop and hold", "url": "https://x.com/elonmusk/status/2"},
        {"id": "3", "text": "Mars looks good", "url": "https://x.com/elonmusk/status/3"},
        {"id": "4", "text": "buy nothing in particular", "url": "https://x.com/elonmusk/status/4"},
    ]
    candidatas = detectar_candidatas(posts, ["GameStop", "Etsy"])
    assert len(candidatas) == 2
    assert all(c["status"] == "pendiente" for c in candidatas)
    assert candidatas[0]["tickers"] == ["ETSY"]
    assert candidatas[1]["empresas"] == ["GameStop"]

    # Una pendiente, aunque tenga forma de mención, no entra al motor.
    pendiente = {
        "id": "pend-1",
        "fecha": "2021-01-26T11:25:00Z",
        "entrada": "2021-01-26",
        "ticker": "ETSY",
        "empresa": "Etsy",
        "tipo": "elogio",
        "canal": "X",
        "cita": "Look at $ETSY today",
        "status": "pendiente",
        "fuentes": ["https://x.com/elonmusk/status/1"],
    }
    assert build_musk_holdings([pendiente]) == []
    db = FakeDB()
    resumen = sync_musk_mentions(db, [pendiente], dry_run=False)
    assert resumen == {"insertadas": 0, "alertas": 0, "omitidas": 1}
    assert db.mentions == []
    assert db.alerts == []


def test_mencion_sin_url_de_x_se_rechaza():
    base = {
        "ticker": "ETSY",
        "texto": "I kinda love Etsy",
        "utc": "2021-01-26T11:25:00Z",
        "url": "https://x.com/elonmusk/status/1354027651468550144",
    }
    with pytest.raises(ValueError, match="URL de X"):
        to_mention({**base, "url": "https://www.cnbc.com/ejemplo"})
    with pytest.raises(ValueError, match="URL de X"):
        to_mention({**base, "url": ""})
