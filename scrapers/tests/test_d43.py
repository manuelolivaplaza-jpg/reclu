from datetime import date

import radar_ia
from base import Holding, SourceAdapter


class _Res:
    def __init__(self, data): self.data = data


class _Q:
    def __init__(self, db, table): self.db, self.table, self.f, self.op = db, table, {}, "select"
    def select(self, *_): return self
    def eq(self, k, v): self.f[k] = v; return self
    def maybe_single(self): self.single = True; return self
    def delete(self): self.op = "delete"; return self
    def in_(self, k, v): self.f["in"] = list(v); return self
    def insert(self, row): self.db.rows.append({**row, "id": f"n{len(self.db.rows)}"}); return self
    def update(self, row): self.op = "update"; return self

    def execute(self):
        db = self.db
        if self.table == "portfolios":
            return _Res({"id": "p1"})
        if self.op == "delete":
            db.rows = [r for r in db.rows if r["id"] not in self.f["in"]]
            return _Res([])
        if self.op == "update":
            return _Res([])
        rows = [r for r in db.rows if all(r.get(k) == v for k, v in self.f.items())]
        if getattr(self, "single", False):
            return _Res(rows[0] if rows else None)
        return _Res(rows)


class _DB:
    def __init__(self, rows): self.rows = rows
    def table(self, name): return _Q(self, name)


class _A(SourceAdapter):
    name = "t"
    portfolio_slug = "radar-ia"
    def fetch_raw(self): return None
    def normalize(self, raw):
        d = date(2026, 10, 22)
        return [Holding("NVDA", "NVDA", 60.0, as_of=d), Holding("MSFT", "MSFT", 40.0, as_of=d)]
    def _resolve_portfolio_id(self, db): return "p1"


def test_run_borra_filas_viejas_del_mismo_snapshot():
    db = _DB([
        {"id": "a", "portfolio_id": "p1", "symbol": "NVDA", "as_of": "2026-10-22", "weight": 30.0},
        {"id": "b", "portfolio_id": "p1", "symbol": "AMAZON COM INC", "as_of": "2026-10-22", "weight": 16.0},
        {"id": "c", "portfolio_id": "p1", "symbol": "TSLA", "as_of": "2026-10-21", "weight": 6.0},
    ])
    out = _A().run(db)
    assert out["removed"] == 1
    assert sorted((r["symbol"], r["as_of"]) for r in db.rows) == [
        ("MSFT", "2026-10-22"), ("NVDA", "2026-10-22"), ("TSLA", "2026-10-21")]


def test_radar_ignora_simbolos_que_son_nombres():
    rows = [{"portfolio_id": f"p{i}", "symbol": s, "weight": 1, "return_pct": 0}
            for i in range(4) for s in ("AMAZON COM INC", "NVDA")]
    assert [p[0] for p in radar_ia.build_radar(rows, min_holders=3)] == ["NVDA"]
