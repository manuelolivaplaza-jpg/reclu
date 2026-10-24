import price_classes as pc
import price_coverage as cov
import prices
import run_all


def test_classify():
    c = pc.classify
    assert c("USD") == "efectivo" and c("USD-CASH") == "efectivo" and c("MONEY MARKET FUND") == "efectivo"
    assert c("X", asset_class="cash") == "efectivo"
    assert c("US TREASURY NOTE 4.25% 15/05/2030") == "bono"
    assert c("BILL") == "ticker"  # BILL Holdings, no es un bono
    assert c("AAPL 261218C00200000") == "opcion"
    assert c("ACME WARRANTS") == "derecho" and c("SPAC-WS") == "derecho"
    assert c("037833100") == "cusip"
    assert c("ALPHABET INC CL A") == "nombre_emisor"
    assert c("VOD", exchange="LSE") == "bolsa_extranjera"
    assert c("JPM-PC") == "ticker_raro"
    assert c("AAPL") == "ticker" and c("BRK-B") == "ticker"
    assert c("SQM-B", exchange="BCS") == "ticker"


def test_suffix_and_clean():
    assert pc.suffix_for_exchange("VOD", "LSE") == "VOD.L"
    assert pc.suffix_for_exchange("BT.A", "LSE") == "BTA.L"
    assert pc.suffix_for_exchange("SAP", "XETRA") == "SAP.DE"
    assert pc.suffix_for_exchange("X", "ZZZ") == ""
    assert pc.clean_issuer_query("ALPHABET INC CL A") == "ALPHABET"
    assert pc.clean_issuer_query("TAIWAN SEMICONDUCTOR MFG LTD SPONSORED ADR") == "TAIWAN SEMICONDUCTOR MFG"


def test_yahoo_symbol_skips_and_suffixes():
    assert prices.yahoo_symbol("US TREASURY NOTE 4% 2030") == ""
    assert prices.yahoo_symbol("AAPL 261218C00200000") == ""
    assert prices.yahoo_symbol("SHOP", "TSX") == "SHOP.TO"
    assert prices.yahoo_symbol("SQM.B", "BCS") == "SQM-B.SN"
    assert prices.yahoo_symbol("BRK.B") == "BRK-B"


def _rows():
    return [
        {"id": 1, "portfolio_id": "p", "as_of": "2026-09-30", "symbol": "AAPL", "weight": 5},
        {"id": 2, "portfolio_id": "p", "as_of": "2026-09-30", "symbol": "USD", "weight": 2},
        {"id": 3, "portfolio_id": "p", "as_of": "2026-09-30", "symbol": "ALPHABET INC CL A", "weight": 3, "asset_class": "equity"},
        {"id": 4, "portfolio_id": "p", "as_of": "2026-09-30", "symbol": "DEADCO", "weight": 1},
        {"id": 5, "portfolio_id": "p", "as_of": "2026-09-30", "symbol": "US TREASURY NOTE 4% 2030", "weight": 1, "asset_class": "equity"},
    ]


def test_coverage_before_after():
    missing = cov.group_missing(_rows(), have={"AAPL"})
    assert len(missing) == 4
    queries = []

    def by_name(q):
        queries.append(q)
        return "GOOGL"

    cov.probe(missing, fetch=lambda s: [1] if s == "GOOGL" else [], name_resolver=by_name,
              name_cache={}, cusip_cache={}, sleep=lambda s: None)
    assert queries == ["ALPHABET"]
    s = cov.summary(missing)
    assert s["antes"] == 4 and s["despues"] == 1
    assert missing["DEADCO"]["estado"] == "sin_resolver"
    assert missing["ALPHABET INC CL A"]["arreglo"] == "GOOGL"
    sql = cov.skip_sql(missing)
    assert "asset_class = 'bond'" in sql and "asset_class = 'cash'" in sql and "begin;" in sql


def test_write_csv(tmp_path):
    missing = cov.group_missing(_rows(), have=set())
    cov.classify_only(missing)
    p = tmp_path / "r.csv"
    cov.write_csv(str(p), missing)
    text = p.read_text(encoding="utf-8")
    assert text.splitlines()[0].startswith("symbol,name,clase,estado")
    assert "omitir" in text


def test_pipeline_completo_y_ordenado():
    ids = run_all.STAGE_IDS
    for s in ("prices", "etf_series", "benchmarks", "performance", "event_series", "afp_carteras", "afp_series", "trade_alerts"):
        assert s in ids
    assert ids.index("prices") < ids.index("performance") < ids.index("event_series")
    assert ids.index("spensiones") < ids.index("afp_carteras") < ids.index("afp_series")
    assert ids[-1] == "trade_alerts"
