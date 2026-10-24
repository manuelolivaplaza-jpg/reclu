import httpx, resolve_tickers as rt

def test_fetch_paged_reintenta(monkeypatch):
    monkeypatch.setattr(rt.time, "sleep", lambda s: None)
    calls = []
    class Q:
        def table(s, _): return s
        def select(s, _): return s
        def order(s, _): return s
        def eq(s, *a): return s
        def range(s, a, b): s.a = a; return s
        def execute(s):
            calls.append(s.a)
            if len(calls) == 1: raise httpx.ReadTimeout("t")
            class R: pass
            r = R(); r.data = [{"id": 1}] if s.a == 0 else []; return r
    assert rt._fetch_paged(Q(), "id") == [{"id": 1}] and calls == [0, 0]

def test_cache_por_nombre_y_error_al_aplicar(tmp_path):
    f = str(tmp_path / "c.json")
    def resolver(n, cache): cache[n.strip()] = "T"; return "T"
    def applier(db, n, t):
        if n == "B CO": raise httpx.ReadTimeout("t")
        return True
    st = rt.run(object(), ["A CO", "B CO", "C CO"], dry_run=False, batch=50, resume_file=f, resolver=resolver, applier=applier)
    assert st["applied"] == 2 and len(rt.load_cache(f)) == 3
