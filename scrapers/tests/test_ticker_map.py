import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ticker_map import TickerResolver, normalize_issuer, pick_figi_ticker, resolve_cusips


def test_normalize_issuer():
    assert normalize_issuer("MasTec, Inc.") == "MASTEC"
    assert normalize_issuer("AFYA LTD CL A") == "AFYA"


def test_pick_figi_ticker_unico_y_ambiguo():
    assert pick_figi_ticker([{"ticker": "MTZ", "securityType": "Common Stock", "marketSector": "Equity"}]) == "MTZ"
    assert pick_figi_ticker([{"ticker": "AAA", "securityType": "Common Stock"}, {"ticker": "BBB", "securityType": "Common Stock"}]) is None
    assert pick_figi_ticker([{"ticker": "X 5 01/01/30", "securityType": "Corp", "marketSector": "Corp"}]) is None
    assert pick_figi_ticker([]) is None


def test_resolve_cusips_lotes_y_cache():
    calls = []

    def fake_post(jobs):
        calls.append(len(jobs))
        return [{"data": [{"ticker": "MTZ", "securityType": "Common Stock", "marketSector": "Equity"}]} if j["idValue"] == "576323109" else {"warning": "No identifier found."} for j in jobs]

    cache = {"037833100": "AAPL"}
    resolve_cusips(["576323109", "037833100", "000000000", "bad"], cache, post=fake_post, delay_s=0)
    assert cache["576323109"] == "MTZ"
    assert cache["000000000"] is None
    assert "BAD" not in cache
    assert calls == [2]  # AAPL ya estaba en caché


def test_resolver_orden_y_no_inventa():
    r = TickerResolver(curated={"AFYA": "AFYA"}, cusip_cache={"576323109": "MTZ"})
    assert r.resolve("MASTEC INC", "576323109") == "MTZ"
    assert r.resolve("AFYA LTD", "") == "AFYA"
    assert r.resolve("NVDA", "") == "NVDA"
    assert r.resolve("EMPRESA DESCONOCIDA SA", "999999999") is None
    assert r.unresolved == ["EMPRESA DESCONOCIDA SA"]


def test_resolver_falla_de_red_no_corta():
    def boom(jobs):
        raise RuntimeError("red")

    r = TickerResolver(curated={}, cusip_cache={})
    r.prefetch([{"cusip": "576323109"}], post=boom, delay_s=0)
    assert r.resolve("MASTEC INC", "576323109") is None
