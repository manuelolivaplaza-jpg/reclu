import httpx, prices as p

def test_yahoo_symbol():
    assert p.yahoo_symbol("ANDINA-B", "BCS") == "ANDINA-B.SN"
    assert p.yahoo_symbol("CHILE", None, "CLP") == "CHILE.SN"
    assert p.yahoo_symbol("4689") == "4689.T"
    assert p.yahoo_symbol("LMT", "NYSE") == "LMT"
    assert p.yahoo_symbol("USD-CASH") == "" and p.yahoo_symbol("Fondo X A") == ""
    assert p.yahoo_symbol("SQM-B.SN", "BCS") == "SQM-B.SN"

class Q:
    def __init__(s, rows): s.rows=rows
    def table(s,_): return s
    def select(s,_): return s
    def range(s,a,b): s.a,s.b=a,b; return s
    def execute(s):
        class R: pass
        r=R(); r.data=s.rows[s.a:s.b+1]; return r

def test_holdings_paginado():
    rows=[{"symbol":f"T{i}"} for i in range(5)]+[{"symbol":"4689"},{"symbol":"USD-CASH"},{"symbol":"T1"}]
    m=p.symbols_from_portfolio_holdings(Q(rows), page=3)
    assert len(m)==6 and m["4689"]==["4689.T"]

def test_retry(monkeypatch):
    calls=[]
    def f(sym,days):
        calls.append(1)
        if len(calls)<3: raise httpx.ConnectError("x")
        return [("2026-01-01",1.0)]
    monkeypatch.setattr(p,"fetch_eod",f)
    assert p.fetch_with_retry("A",5,sleep=lambda s:None)==[("2026-01-01",1.0)] and len(calls)==3

def test_alias_guarda_simbolo_original(monkeypatch):
    seen=[]
    monkeypatch.setattr(p,"fetch_with_retry",lambda s,d: seen.append(s) or [("2026-01-01",1.0)])
    monkeypatch.setattr(p.time,"sleep",lambda s:None)
    up=[]
    monkeypatch.setattr(p,"upsert_prices",lambda db,s,r: up.append(s))
    p.refresh_all(object(),["4689"],aliases={"4689":"4689.T"})
    assert seen==["4689.T"] and up==["4689"]
