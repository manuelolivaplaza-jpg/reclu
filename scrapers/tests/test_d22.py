import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import compute_returns as cr  # noqa: E402
import reconstruct_house_ptr as h  # noqa: E402


def test_events_from_txs_compra_y_venta():
    txs = [
        {"ticker": "aapl", "type": "P", "date": date(2025, 1, 2)},
        {"ticker": "AAPL", "type": "S", "date": date(2025, 2, 3)},
        {"ticker": "MSFT", "type": "S", "date": date(2025, 1, 5)},  # sin compra previa
        {"ticker": "NVDA", "type": "P", "date": date(2025, 3, 1)},
    ]
    ev = h.events_from_txs(txs)
    assert ev == [
        {"ticker": "AAPL", "entry": "2025-01-02", "exit": "2025-02-03", "side": 1},
        {"ticker": "NVDA", "entry": "2025-03-01", "exit": None, "side": 1},
    ]


def test_series_from_events_reintenta_y_no_promedia_precios():
    calls = {"n": 0}
    d = ["2025-01-02", "2025-01-03"]

    def fetch(tk, days):
        if tk == "A" and calls["n"] == 0:
            calls["n"] += 1
            raise RuntimeError("Server disconnected")
        return {"A": [(d[0], 1000.0), (d[1], 1100.0)], "B": [(d[0], 10.0), (d[1], 10.0)]}[tk]

    ev = [{"ticker": t, "entry": d[0], "exit": None, "side": 1} for t in ("A", "B")]
    s = h.series_from_events(ev, fetch=fetch, sleep=lambda x: None)
    # US$1.000 en cada uno: +10% y 0% -> +5% (el promedio de precios daba +9,9%)
    assert s[-1]["value_pct"] == 5.0


class _Q:
    def __init__(self, db, table):
        self.db, self.table, self.f = db, table, {}

    def select(self, *a):
        return self

    def eq(self, c, v):
        self.f[c] = v
        return self

    def order(self, *a, **k):
        return self

    def limit(self, *a):
        return self

    def upsert(self, payload, on_conflict=None):
        self.db.upserts.append(payload)
        return self

    def execute(self):
        class R:
            pass

        r = R()
        if self.table == "portfolios":
            r.data = [{"id": "p1", "country": "US"}]
        elif self.table == "portfolio_performance":
            r.data = [{"date": "2026-01-02", "value_pct": 0}, {"date": "2026-06-01", "value_pct": 10}]
        elif self.table == "benchmark_prices":
            r.data = []
        else:
            r.data = None
        return r


class _DB:
    def __init__(self):
        self.upserts = []

    def table(self, name):
        return _Q(self, name)


def test_metricas_sin_benchmark_igual_se_guardan():
    db = _DB()
    out = cr.compute_benchmark_metrics(db)
    assert out["updated"] >= 1
    total = [p for p in db.upserts if p["period"] == "TOTAL"][0]
    assert total["return_pct"] == 10.0
    assert total["benchmark_return_pct"] is None
    assert total["benchmark_symbol"] == "^GSPC"
