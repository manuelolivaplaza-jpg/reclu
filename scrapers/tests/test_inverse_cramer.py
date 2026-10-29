"""Tests de Inverse Cramer sin red ni Supabase real.

Correr: uv run --with httpx --with pytest --with supabase python -m pytest scrapers/tests/test_inverse_cramer.py -q
"""

from __future__ import annotations

import sys
from datetime import date, timedelta
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from inverse_cramer import (  # noqa: E402
    MAX_QUOTE_WORDS,
    SEED_AS_OF,
    SLUG,
    alerts_for,
    build_positions,
    classify_quote,
    entry_date_for,
    load_picks,
    position_is_open,
    prepare_pick,
    quote_word_count,
    rss_candidates,
)


def _raw(**over) -> dict:
    base = {
        "fecha": "2026-10-15",
        "ticker": "RDDT",
        "sentido": "compra",
        "cita": "buy",
        "url": "https://www.cnbc.com/2026/10/15/cramers-lightning-round-buy-reddit.html",
    }
    base.update(over)
    return base


def test_slug_no_pisa_el_proxy():
    assert SLUG == "inverse-cramer-real"


def test_clasifica_frases_reales_del_json():
    picks = load_picks()
    assert picks, "el JSON curado no puede venir vacío"
    vistos = {classify_quote(pick["cita"]) for pick in picks}
    assert "compra" in vistos
    assert "venta" in vistos
    assert "pendiente" in vistos  # "so great", "excellent", "negativo", "hold" suelto no entra aquí

    esperadas = {
        "hold on to it or buy some": "compra",
        "pull the trigger": "compra",
        "you should own it": "compra",
        "I'm a buyer": "compra",
        "buy, buy, buy": "compra",
        "is a buy": "compra",
        "you can buy it": "compra",
        "buy MasTec": "compra",
        "buy": "compra",
        "not going to put my money": "venta",
        "not going to get in front": "venta",
        "don't want to own": "venta",
        "sell, sell, sell": "venta",
        "so great": "pendiente",
        "excellent": "pendiente",
        "negativo": "pendiente",
        "never liked": "pendiente",
        "can go higher": "pendiente",
        "very good": "pendiente",
        "winner": "pendiente",
        "hold": "pendiente",
        "wait": "pendiente",
    }
    citas = {pick["cita"] for pick in picks}
    for cita, lado in esperadas.items():
        assert classify_quote(cita) == lado
        if cita not in ("hold", "wait"):
            assert cita in citas

    for pick in picks:
        auto = classify_quote(pick["cita"])
        if auto != "pendiente":
            assert auto == pick["sentido"]
        assert quote_word_count(pick["cita"]) <= MAX_QUOTE_WORDS


def test_entrada_al_dia_habil_siguiente():
    # Miércoles 2 sep 2026 → jueves 3.
    assert entry_date_for(date(2026, 9, 2)) == date(2026, 9, 3)
    # Viernes 4 sep → martes 8: el lunes 7 es Labor Day.
    assert entry_date_for(date(2026, 9, 4)) == date(2026, 9, 8)
    # Jueves 15 oct → viernes 16.
    assert entry_date_for(date(2026, 10, 15)) == date(2026, 10, 16)
    # Viernes 16 oct → lunes 19.
    assert entry_date_for(date(2026, 10, 16)) == date(2026, 10, 19)
    # Sábado → lunes.
    assert entry_date_for(date(2026, 10, 17)) == date(2026, 10, 19)


def test_pick_pendiente_no_genera_alerta_ni_posicion():
    pick = prepare_pick(_raw(status="pendiente", cita="buy"))
    assert pick is not None
    assert pick["status"] == "pendiente"
    assert alerts_for([pick]) == []
    assert build_positions([pick], date(2026, 10, 16)) == []


def test_url_incompleta_y_cita_larga_se_descartan():
    assert prepare_pick(_raw(url="https://www.cnbc.com/2026/10/06/")) is None
    larga = "one two three four five six seven eight nine ten eleven"
    assert quote_word_count(larga) == 11
    assert prepare_pick(_raw(cita=larga)) is None


def test_posiciones_igual_peso_corto_con_nombre_y_peso_positivo():
    picks = load_picks()
    rows = build_positions(picks, SEED_AS_OF)
    assert rows
    assert round(sum(row["weight"] for row in rows), 2) == 100.00
    for row in rows:
        assert row["weight"] > 0
        assert row["weight"] <= 100
        if row["side"] == "corto":
            assert row["name"].startswith("Corto: ")
        else:
            assert not row["name"].startswith("Corto:")
    # MTZ tiene una venta (largo) el 6 oct y una compra (corto) el 13 oct.
    # Las dos siguen abiertas al corte: se netean y no hay fila.
    assert all(row["symbol"] != "MTZ" for row in rows)


def test_la_ventana_dura_30_dias_habiles():
    entry = date(2026, 9, 3)
    assert position_is_open(entry, entry)
    assert not position_is_open(entry, entry - timedelta(days=1))
    # 30 días hábiles después todavía está abierta; el siguiente hábil no.
    from inverse_cramer import add_business_days

    last = add_business_days(entry, 30)
    assert position_is_open(entry, last)
    assert not position_is_open(entry, add_business_days(last, 1))


def test_rss_nuevo_queda_pendiente_sin_cita():
    known = {"https://www.cnbc.com/2026/10/15/cramers-lightning-round-buy-reddit.html"}
    nuevo = "https://www.cnbc.com/2026/10/14/cramers-lightning-round-mckesson-is-a-winner.html"
    found = rss_candidates([nuevo, nuevo, known.copy().pop()], known)
    assert found == [{"url": nuevo, "status": "pendiente", "ticker": None, "cita": None}]
    assert alerts_for(found) == []


def test_alerta_de_una_verificada_lleva_lado_y_fuente():
    pick = prepare_pick(_raw())
    assert pick is not None
    alerts = alerts_for([pick], "pf")
    assert len(alerts) == 1
    alert = alerts[0]
    assert alert["type"] == "mention"
    assert alert["title"] == "Inverse Cramer: corto RDDT"
    assert alert["payload"] == {
        "symbol": "RDDT",
        "quote": "buy",
        "said_at": "2026-10-15T22:55:00+00:00",
        "side": "corto",
        "source_url": pick["url"],
    }
    assert quote_word_count(alert["payload"]["quote"]) <= MAX_QUOTE_WORDS


def test_venta_de_cramer_es_compra_de_reclu():
    pick = prepare_pick(_raw(ticker="RKLB", sentido="venta", cita="sell, sell, sell"))
    assert pick is not None
    assert pick["kind"] == "recomienda_venta"
    assert pick["side"] == "compra"
    assert pick["external_id"] == "2026-10-15-RKLB"
    alert = alerts_for([pick])[0]
    assert alert["title"] == "Inverse Cramer: compra RKLB"


def test_json_curado_tiene_38_picks_completos():
    picks = load_picks()
    assert len(picks) == 38
    assert all(pick["status"] == "verificada" for pick in picks)
    assert sum(1 for pick in picks if pick["sentido"] == "compra") == 22
    assert sum(1 for pick in picks if pick["sentido"] == "venta") == 16
