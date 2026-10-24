from datetime import date

import inverse_cramer_compras as icc
import politicians
from load_13f import FUND_SLUG
from sec13f import FUNDS


def _pick(t, side, entry="2026-10-01"):
    return {"status": "verificada", "side": side, "ticker": t, "entry_date": entry}


def test_solo_compras():
    picks = [_pick("AAA", "compra"), _pick("BBB", "corto"), _pick("CCC", "compra"),
             {"status": "pendiente", "side": "compra", "ticker": "DDD", "entry_date": "2026-10-01"}]
    rows = icc.build_buy_only_positions(picks, date(2026, 10, 5))
    assert [r["symbol"] for r in rows] == ["AAA", "CCC"]
    assert all(r["side"] == "compra" for r in rows)
    assert round(sum(r["weight"] for r in rows), 2) == 100.0


def test_compra_con_corto_abierto_queda_en_solo_compras():
    rows = icc.build_buy_only_positions([_pick("AAA", "compra"), _pick("AAA", "corto")], date(2026, 10, 5))
    assert [r["symbol"] for r in rows] == ["AAA"]


def test_adapter_slug():
    assert icc.InverseCramerComprasAdapter.portfolio_slug == "inverse-cramer-compras"


def test_tuberville_configurado():
    assert politicians.POLITICIANS["Tommy Tuberville"] == "tuberville-tracker"
    assert politicians.SENATORS["Tommy Tuberville"] == "tuberville-tracker"
    rows = politicians.build_politician_rows([
        {"member": "Tommy Tuberville", "ticker": "MSFT", "trade_type": "buy"},
    ])
    assert rows["Tommy Tuberville"][0]["symbol"] == "MSFT"


def test_scion_burry_configurado():
    assert FUNDS["Scion Asset Management"] == 1649339
    assert FUND_SLUG["Scion Asset Management"] == "scion-13f"
