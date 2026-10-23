import prices as p

def test_mapeo():
    y = p.yahoo_symbol
    assert y("AGUAS.A", "BCS") == "AGUAS-A.SN"
    assert y("ANDINA.B", None, "CLP") == "ANDINA-B.SN"
    assert y("SQM.B", "BCS") == "SQM-B.SN"
    assert y("BRK.B") == "BRK-B" and y("BF.B") == "BF-B" and y("HEI.A") == "HEI-A" and y("TECK/B") == "TECK-B"
    assert y("PETR4") == "PETR4.SA" and y("VALE3") == "VALE3.SA"
    assert y("WALMEX*") == "WALMEX.MX" and y("TLEVISACPO") == "TLEVISACPO.MX" and y("GAPB", "BMV") == "GAPB.MX"
    assert y("4689") == "4689.T" and y("1211", "HKEX") == "1211.HK" and y("358", "HK") == "0358.HK"
    assert y("373220", "KRX") == "373220.KS" and y("2330", "TWSE") == "2330.TW"
    assert y("002709") == "002709.SZ" and y("251270") == ""
    for bad in ("EUR", "USD-CASH", "will-bitcoin-dip-to-50000", "Wabtec", "ETHQ/U", "CONOCOPHILLIPS", "Fondo X"):
        assert y(bad) == "", bad
    assert y("LMT") == "LMT" and y("SQM-B.SN") == "SQM-B.SN"

class Q:
    def __init__(s, rows): s.rows = rows
    def table(s, _): return s
    def select(s, _): return s
    def range(s, a, b): s.a, s.b = a, b; return s
    def execute(s):
        class R: pass
        r = R(); r.data = s.rows[s.a:s.b + 1]; return r

def test_ultimo_snapshot_y_orden():
    rows = [
        {"portfolio_id": 1, "as_of": "2025-01-01", "symbol": "OLD"},
        {"portfolio_id": 1, "as_of": "2026-01-01", "symbol": "AAA"},
        {"portfolio_id": 1, "as_of": "2026-01-01", "symbol": "BBB"},
        {"portfolio_id": 2, "as_of": "2026-02-01", "symbol": "BBB"},
    ]
    m = p.symbols_from_portfolio_holdings(Q(rows), page=2)
    assert list(m) == ["BBB", "AAA"]
    assert "OLD" in p.symbols_from_portfolio_holdings(Q(rows), page=2, all_snapshots=True)

def test_estimado():
    assert p.estimate_rows(600, 730) == 600 * 730
