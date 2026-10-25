import httpx
import price_coverage as cov


class Q:
    def __init__(self, db, kind, args=None):
        self.db, self.kind, self.args, self.f = db, kind, args or {}, {}

    def select(self, *_): return self
    def gte(self, k, v): self.f["gte"] = v; return self
    def eq(self, k, v): self.f["eq"] = v; return self
    def order(self, *_ , **__): return self
    def limit(self, n): self.f["limit"] = n; return self
    def range(self, a, b): self.f["range"] = (a, b); return self

    def execute(self):
        db = self.db
        db.calls.append(self.kind)
        if db.fail_first and len(db.calls) == 1:
            raise httpx.ReadTimeout("timeout")
        if self.kind == "rpc":
            if not db.rpc_ok:
                raise RuntimeError("PGRST202 function not found")
            o, n = self.args["p_offset"], self.args["p_limit"]
            data = [{"symbol": s} for s in db.all[o:o + n]]
        elif "eq" in self.f:
            data = [{"symbol": self.f["eq"]}] if self.f["eq"] in db.all else []
        else:
            a, b = self.f["range"]
            data = [{"symbol": s} for s in db.recent[a:b + 1]]
        return type("R", (), {"data": data})()


class DB:
    def __init__(self, all_, recent=(), rpc_ok=True, fail_first=False):
        self.all, self.recent, self.rpc_ok, self.fail_first = sorted(all_), list(recent), rpc_ok, fail_first
        self.calls = []

    def rpc(self, name, args): return Q(self, "rpc", args)
    def table(self, name): return Q(self, "table")


def test_rpc_paginada_sin_consulta_por_simbolo():
    syms = [f"S{i:04d}" for i in range(2500)]
    db = DB(syms)
    have = cov.symbols_with_prices(db, syms[:10] + ["NOPE"], sleep=lambda s: None)
    assert have == set(syms[:10])
    assert db.calls == ["rpc", "rpc", "rpc"]  # 2500 -> 3 paginas, no 11 consultas sueltas


def test_reintenta_readtimeout():
    db = DB(["A", "B"], fail_first=True)
    slept = []
    assert cov.symbols_with_prices(db, ["A", "C"], sleep=slept.append) == {"A"}
    assert slept == [1]


def test_respaldo_sin_rpc():
    db = DB(["A", "B", "OLD"], recent=["A", "A", "B"], rpc_ok=False)
    assert cov.symbols_with_prices(db, ["A", "B", "OLD", "X"], sleep=lambda s: None) == {"A", "B", "OLD"}
    # solo OLD y X se consultan de a uno
    assert db.calls.count("table") == 1 + 2
