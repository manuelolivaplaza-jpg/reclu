import prices as p
import compute_returns as cr

class Q:
    def __init__(s, tables): s.t = tables
    def table(s, n): s.n = n; return s
    def select(s, _): return s
    def range(s, a, b): s.a, s.b = a, b; return s
    def execute(s):
        class R: pass
        r = R(); r.data = s.t[s.n][s.a:s.b + 1]; return r

def test_prioriza_visibles_y_peso_y_pais_cl():
    hold = [{"portfolio_id": "f13", "as_of": "2026-09-30", "symbol": f"A{i:03d}", "weight": 0.01} for i in range(50)]
    hold += [{"portfolio_id": "f13b", "as_of": "2026-09-30", "symbol": f"A{i:03d}", "weight": 0.01} for i in range(50)]
    hold += [{"portfolio_id": "cl", "as_of": "2026-10-01", "symbol": "COLBUN", "weight": 10, "currency": "USD"},
             {"portfolio_id": "mx", "as_of": "2026-10-01", "symbol": "WALMEX*", "weight": 5}]
    ports = [{"id": "f13", "country": "US", "is_active": False}, {"id": "f13b", "country": "US", "is_active": True, "hidden_reason": "demo"},
             {"id": "cl", "country": "CL", "is_active": True}, {"id": "mx", "country": "Global", "is_active": True}]
    m = p.symbols_from_portfolio_holdings(Q({"holdings": hold, "portfolios": ports}), page=7)
    assert list(m)[:2] == ["COLBUN", "WALMEX*"]
    assert m["COLBUN"] == ["COLBUN.SN"] and m["WALMEX*"] == ["WALMEX.MX"]

def test_claves_busqueda():
    assert cr.price_lookup_keys("WALMEX*") == ["WALMEX*", "WALMEX.MX"]
    assert cr.price_lookup_keys(" lmt ")[:3] == [" lmt ", "lmt", "LMT"]
