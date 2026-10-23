import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import event_series as es  # noqa: E402
import perf_store  # noqa: E402


class Table:
    """portfolio_performance en memoria: {(pid, date): row}."""

    def __init__(self, rows):
        self.rows = {(r["portfolio_id"], r["date"]): dict(r) for r in rows}


class Q:
    def __init__(self, t):
        self.t, self.op, self.f, self.payload = t, None, [], None

    def upsert(self, rows, on_conflict=None):
        self.op, self.payload = "upsert", rows
        return self

    def delete(self):
        self.op = "delete"
        return self

    def eq(self, c, v):
        self.f.append(lambda r: r[c] == v)
        return self

    def gte(self, c, v):
        self.f.append(lambda r: r[c] >= v)
        return self

    def lte(self, c, v):
        self.f.append(lambda r: r[c] <= v)
        return self

    def execute(self):
        if self.op == "upsert":
            for r in self.payload:
                self.t.rows[(r["portfolio_id"], r["date"])] = dict(r)
        elif self.op == "delete":
            for k, r in list(self.t.rows.items()):
                if all(f(r) for f in self.f):
                    del self.t.rows[k]


class DB:
    def __init__(self, rows):
        self.t = Table(rows)

    def table(self, name):
        return Q(self.t)


def row(d, v, est, pid="p"):
    return {"portfolio_id": pid, "date": d, "value_pct": v, "is_estimated": est}


def test_no_borra_reales_ni_fuera_de_rango():
    db = DB([
        row("2024-01-01", 1.0, True),   # estimada fuera de rango: queda
        row("2024-02-01", 2.0, False),  # real fuera de rango: queda
        row("2024-03-05", 3.0, True),   # estimada dentro, sin fecha nueva: se borra
        row("2024-03-10", 4.0, False),  # real dentro, sin fecha nueva: queda
        row("2024-03-01", 9.0, True),   # estimada pisada por real nueva
        row("2024-03-01", 0.0, False, pid="otro"),
    ])
    n = perf_store.save_real_series(db, "p", [("2024-03-01", 0.0), {"date": "2024-03-20", "value_pct": 5.0}])
    assert n == 2
    rows = db.t.rows
    assert ("p", "2024-01-01") in rows and ("p", "2024-02-01") in rows
    assert ("p", "2024-03-05") not in rows
    assert rows[("p", "2024-03-10")]["is_estimated"] is False
    assert rows[("p", "2024-03-01")] == row("2024-03-01", 0.0, False)
    assert rows[("p", "2024-03-20")]["is_estimated"] is False
    assert ("otro", "2024-03-01") in rows


def test_serie_vacia_no_toca_nada():
    db = DB([row("2024-01-01", 1.0, True)])
    assert perf_store.save_real_series(db, "p", []) == 0
    assert len(db.t.rows) == 1


def test_cash_out_x_plano_a_55():
    prices = {"DELL": {"2025-05-23": 100.0, "2025-06-18": 110.0, "2025-06-20": 121.0}}
    filled = es.apply_cash_out(prices, [{"ticker": "X", "entry": "2025-05-23"}], {"X": (55.0, "2025-06-18")})
    assert set(filled["X"].values()) == {55.0}
    assert min(filled["X"]) == "2025-05-23"
    s = es.compute_event_series([{"ticker": "X", "entry": "2025-05-23", "exit": None, "side": 1}], filled)
    assert s[-1]["value_pct"] == 0.0
