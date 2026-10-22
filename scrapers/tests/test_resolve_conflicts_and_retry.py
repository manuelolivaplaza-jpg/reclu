import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import compute_returns as cr  # noqa: E402
import resolve_tickers as rt  # noqa: E402


class Resp:
    def __init__(self, data):
        self.data = data


class FakeDB:
    """Tabla holdings en memoria con choque de clave única y desconexiones."""

    def __init__(self, rows, conflict_ids=(), disconnect_on_update=0, prices=None):
        self.rows = {r["id"]: dict(r) for r in rows}
        self.conflict_ids = set(conflict_ids)
        self.disconnects = disconnect_on_update
        self.deleted = []
        self.prices = prices or {}

    def table(self, name):
        return Query(self, name)


class Query:
    def __init__(self, db, name):
        self.db, self.name, self.op, self.payload, self.filters = db, name, "select", None, {}

    def select(self, *a, **k):
        return self

    def update(self, payload):
        self.op, self.payload = "update", payload
        return self

    def delete(self):
        self.op = "delete"
        return self

    def eq(self, col, val):
        self.filters[col] = val
        return self

    def order(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def maybe_single(self):
        return self

    def execute(self):
        db = self.db
        if self.name == "prices":
            p = db.prices.get(self.filters.get("symbol"))
            return Resp({"close": p}) if p else None
        if self.op == "update":
            if db.disconnects > 0:
                db.disconnects -= 1
                raise RuntimeError("Server disconnected without sending a response.")
            rid = self.filters["id"]
            if rid in db.conflict_ids and "symbol" in self.payload:
                raise RuntimeError('duplicate key value violates unique constraint "idx_holdings_unique" (23505)')
            db.rows[rid].update(self.payload)
            return Resp([db.rows[rid]])
        if self.op == "delete":
            db.deleted.append(self.filters["id"])
            return Resp([])
        return Resp(list(db.rows.values()))


def test_apply_ticker_no_borra_en_choque(monkeypatch):
    db = FakeDB(
        [{"id": "a", "portfolio_id": "p1", "symbol": "MASTEC INC"}, {"id": "b", "portfolio_id": "p2", "symbol": "MASTEC INC"}],
        conflict_ids={"b"},
    )
    monkeypatch.setattr(rt, "_fetch_paged", lambda db_, cols, symbol=None: [{"id": r["id"], "portfolio_id": r["portfolio_id"]} for r in db.rows.values()])
    rt.CONFLICTS.clear()
    ok = rt.apply_ticker(db, "MASTEC INC", "MTZ")
    assert ok is False
    assert db.deleted == []
    assert db.rows["a"]["symbol"] == "MTZ"
    assert db.rows["b"]["symbol"] == "MASTEC INC"
    assert rt.CONFLICTS == [{"portfolio_id": "p2", "old_symbol": "MASTEC INC", "ticker": "MTZ", "id": "b"}]
    assert "p2" in rt.conflicts_summary() and "MTZ" in rt.conflicts_summary()


def test_compute_returns_reintenta_server_disconnected():
    rows = [{"id": i, "symbol": "AAPL", "price_at_disclosure": 100.0} for i in range(5)]
    db = FakeDB(rows, disconnect_on_update=2, prices={"AAPL": 110.0})
    sleeps = []
    out = cr.compute_returns(db, batch_size=2, sleep=sleeps.append)
    assert out["updated"] == 5 and out["failed_batches"] == 0
    assert all(r["return_pct"] == 10.0 for r in db.rows.values())
    assert sleeps == [1.0, 2.0]  # backoff exponencial dentro del mismo lote


def test_compute_returns_lote_agotado_sigue():
    rows = [{"id": i, "symbol": "AAPL", "price_at_disclosure": 100.0} for i in range(3)]
    db = FakeDB(rows, disconnect_on_update=cr.MAX_ATTEMPTS, prices={"AAPL": 110.0})
    out = cr.compute_returns(db, batch_size=2, sleep=lambda s: None)
    assert out["failed_batches"] == 1
    assert out["updated"] == 1  # el segundo lote se procesa


def test_with_retry_no_reintenta_errores_no_pasajeros():
    calls = []

    def boom():
        calls.append(1)
        raise ValueError("bad input")

    try:
        cr.with_retry(boom, sleep=lambda s: None)
    except ValueError:
        pass
    assert len(calls) == 1
