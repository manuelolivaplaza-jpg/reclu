import httpx
import prices as p
import resolve_tickers as rt


def _404(sym):
    req = httpx.Request("GET", f"https://x/{sym}")
    return httpx.HTTPStatusError("404", request=req, response=httpx.Response(404, request=req))


def test_candidatos():
    c = p.yahoo_candidates
    assert c("SQM.B") == ["SQM-B", "SQM-B.SN", "SQMB.MX"]
    assert c("AGUAS.A")[1] == "AGUAS-A.SN"
    assert c("GMEXICOB")[:3] == ["GMEXICOB", "GMEXICOB.SN", "GMEXICOB.MX"]
    assert c("FUNO11", country="MX")[0] == "FUNO11.MX"
    assert "FUNO11.MX" in c("FUNO11")
    assert c("Wabtec") == ["WAB"] and c("AECOM") == ["ACM"] and c("ADYEN") == ["ADYEN.AS"]
    assert c("WATTS") == ["WTS"] and c("SATELLOGIC") == ["SATL"] and c("TECK/B") == ["TECK-B.TO"]
    assert c("4689") == ["4689.T"] and c("SQM-B.SN") == ["SQM-B.SN"] and c("USD-CASH") == []
    assert c("SAN")[0] == "SAN"


def test_fallback_404():
    def fetch(sym, days):
        if sym != "SQM-B.SN":
            raise _404(sym)
        return [("2026-10-22", 1.0)]
    assert p.fetch_candidates(["SQM-B", "SQM-B.SN", "SQMB.MX"], 5, fetch=fetch) == ("SQM-B.SN", [("2026-10-22", 1.0)])


def test_resolve_reanudable_y_limit(tmp_path):
    f = str(tmp_path / "c.json")
    calls = []
    def resolver(name, cache):
        calls.append(name); cache[name] = "T" + name[-1]; return cache[name]
    applied = []
    names = ["NAME A", "NAME B", "NAME C"]
    rt.run(None, names, dry_run=True, limit=2, batch=1, resume_file=f, resolver=resolver, applier=lambda *a: applied.append(a))
    assert calls == ["NAME A", "NAME B"] and applied == []
    rt.run(None, names, dry_run=True, batch=5, resume_file=f, resolver=resolver)
    assert calls == ["NAME A", "NAME B", "NAME C"]


def test_reintento_busqueda(monkeypatch):
    n = []
    req = httpx.Request("GET", rt.SEARCH_URL)
    def get(*a, **k):
        n.append(1)
        if len(n) < 3:
            raise httpx.ReadTimeout("t", request=req)
        return httpx.Response(200, json={"quotes": []}, request=req)
    monkeypatch.setattr(rt.httpx, "get", get)
    assert rt._get_with_retry({"q": "x"}, sleep=lambda s: None).status_code == 200 and len(n) == 3


def test_error_no_se_cachea(monkeypatch):
    monkeypatch.setattr(rt, "fetch_quotes", lambda n: (_ for _ in ()).throw(httpx.ReadTimeout("t")))
    monkeypatch.setattr(rt.time, "sleep", lambda s: None)
    cache = {}
    assert rt.resolve_name("ACME CORP", cache) is None and cache == {}
