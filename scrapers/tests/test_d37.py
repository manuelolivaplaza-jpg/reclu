import json
import os

import name_resolution as nr
import price_classes as pc
import prices
import resolve_tickers as rt


def Q(sym, name, exch="NMS", t="EQUITY"):
    return {"symbol": sym, "longname": name, "shortname": name, "exchange": exch, "quoteType": t}


def test_expand_abbrev_13f():
    assert nr.expand_abbrev("FIRST NATL BK ALASKA") == "FIRST NATIONAL BANK ALASKA"
    assert "MANAGEMENT" in nr.expand_abbrev("WASTE MGMT INC")
    assert nr.expand_abbrev("TRIP COM GROUP LTD").startswith("TRIPCOM")


def test_name_score_rechaza_matches_falsos():
    assert nr.name_score("SEA LTD", "Seagate Technology Holdings plc") == 0
    assert nr.name_score("SEA LTD", "Sea Limited") == 1
    assert nr.name_score("TRIP COM GROUP LTD", "Tripadvisor, Inc.") == 0
    assert nr.name_score("TRIP COM GROUP LTD", "Trip.com Group Limited") == 1


def test_resolve_issuer_elige_por_nombre():
    quotes = [Q("STX", "Seagate Technology Holdings plc"), Q("SE", "Sea Limited", "NYQ")]
    assert nr.resolve_issuer("SEA LTD", lambda q: quotes)[0] == "SE"
    pdd = [Q("KPDD", "Kurv Yield Premium Strategy PDD ETF", t="ETF"), Q("PDD", "PDD Holdings Inc.")]
    assert nr.resolve_issuer("PDD HOLDINGS INC", lambda q: pdd)[0] == "PDD"


def test_resolve_issuer_extranjero_y_errores():
    q = [Q("ADYEN.AS", "Adyen N.V.", "AMS")]
    assert nr.resolve_issuer("ADYEN NV", lambda _: q)[0] == "ADYEN.AS"
    assert nr.resolve_issuer("ADYEN NV", lambda _: q, allow_foreign=False)[0] is None

    def boom(_):
        raise RuntimeError("429")

    try:
        nr.resolve_issuer("ADYEN NV", boom)
        assert False
    except RuntimeError:
        pass


def test_resolve_foreign_ticker():
    q = [Q("BOL.ST", "Boliden AB (publ)", "STO"), Q("BOLT", "Bolt Biotherapeutics")]
    assert nr.resolve_foreign_ticker("BOL", "BOLIDEN AB", lambda _: q)[0] == "BOL.ST"
    assert nr.resolve_foreign_ticker("XYZ", "BOLIDEN AB", lambda _: q)[0] is None


def test_polymarket_es_prediccion_y_se_omite():
    c = pc.classify("will-trump-win-2028")
    assert c == "prediccion" and pc.is_skip(c)
    assert pc.classify("ALPHABET INC CL A") == "nombre_emisor"
    assert prices.yahoo_symbol("will-trump-win-2028") == ""


def test_manual_map_json_valido_y_watts_chile():
    path = os.path.join(os.path.dirname(prices.__file__), "data", "yahoo_manual_map.json")
    data = json.load(open(path, encoding="utf-8"))
    assert isinstance(data, dict) and len(data) > 100
    assert all(k == k.upper() and v for k, v in data.items())
    assert prices.yahoo_candidates("WATTS", "BCS", "CLP") == ["WATTS.SN"]
    if "SEA LTD" in data:
        assert data["SEA LTD"] == "SE"


def test_refresh_all_paralelo_e_incremental(monkeypatch):
    calls = []

    def fake(cands, days):
        calls.append((cands, days))
        return (cands if isinstance(cands, str) else cands[0]), [("2026-10-01", 1.0)]

    monkeypatch.setattr(prices, "fetch_candidates", fake)
    up = []
    monkeypatch.setattr(prices, "upsert_prices", lambda db, s, r: up.append(s))
    res = prices.refresh_all(object(), ["A", "B", "C"], workers=4, days=365, days_for={"B": 10})
    assert res == {"ok": 3, "total": 3}
    assert up == ["A", "B", "C"]  # escrituras en orden, hilo principal
    assert sorted(calls) == [("A", 365), ("B", 10), ("C", 365)]


def test_cache_viejo_se_descarta(tmp_path):
    p = tmp_path / "c.json"
    p.write_text(json.dumps({"SEA LTD": "STX"}))
    assert rt.load_cache(str(p)) == {}
    rt.save_cache(str(p), {"SEA LTD": "SE"})
    assert rt.load_cache(str(p)) == {"SEA LTD": "SE"}
