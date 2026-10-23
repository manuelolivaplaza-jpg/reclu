import benchmarks as b

def test_proxy_in_clp_usa_fx_previo():
    assert b.proxy_in_clp([("2026-01-02", 10.0), ("2026-01-05", 11.0)], [("2026-01-01", 900.0), ("2026-01-05", 1000.0)]) == [("2026-01-02", 9000.0), ("2026-01-05", 11000.0)]

def test_una_fila_cae_al_proxy(monkeypatch):
    def fake(sym, days):
        if sym == "ECH": return [(f"2026-01-{i:02d}", 30.0) for i in range(1, 32)] + [(f"2026-02-{i:02d}", 30.0) for i in range(1, 10)]
        if sym == "CLP=X": return [("2025-12-31", 950.0)]
        if sym == "SPIPSA.SN": return [("2026-10-22", 11315.0)]
        raise RuntimeError("Not Found")
    monkeypatch.setattr(b, "fetch_eod", fake)
    rows = b.fetch_benchmark("^IPSA")
    assert len(rows) == 40 and rows[0][1] == 28500.0
    assert b.LAST_SOURCE["^IPSA"] == "PROXY ECH*CLP=X"
