import trade_alerts as ta


def test_snapshots_y_diff():
    rows = [
        {"as_of": "2026-09-30", "symbol": "AAPL", "weight": 10},
        {"as_of": "2026-09-30", "symbol": "KO", "weight": 5},
        {"as_of": "2026-06-30", "symbol": "AAPL", "weight": 9},
        {"as_of": "2026-06-30", "symbol": "OXY", "weight": 4},
        {"as_of": "2026-06-30", "symbol": "USD-CASH", "weight": 1},
    ]
    cur_d, cur, prev_d, prev = ta.latest_two_snapshots(rows)
    assert (cur_d, prev_d) == ("2026-09-30", "2026-06-30")
    ev = ta.diff_snapshots(prev, cur)
    assert [(e["action"], e["symbol"]) for e in ev] == [("buy", "KO"), ("sell", "OXY")]
    assert ta.diff_snapshots({}, cur) == []


def test_preferencias():
    follows = [{"user_id": "u1"}, {"user_id": "u2"}, {"user_id": "u3"}]
    prefs = {"u2": {"email_buys": False, "email_sells": True}}
    emails = {"u1": "a@x", "u2": "b@x"}
    assert ta.recipients_for(follows, prefs, emails, "buy") == [("u1", "a@x")]
    assert ta.recipients_for(follows, prefs, emails, "sell") == [("u1", "a@x"), ("u2", "b@x")]


def test_envio_apagado_por_defecto(monkeypatch):
    monkeypatch.delenv("TRADE_ALERTS_SEND_ENABLED", raising=False)
    monkeypatch.setenv("RESEND_API_KEY", "x")
    called = []
    assert ta.send_email("a@x", "s", "h", post=lambda *a, **k: called.append(1)) is False and called == []
    monkeypatch.setenv("TRADE_ALERTS_SEND_ENABLED", "1")
    assert ta.send_email("a@x", "s", "h", post=lambda *a, **k: called.append(1)) is False and called == []


def test_email_texto():
    subject, html = ta.render_email("Berkshire", "berkshire-hathaway", [{"action": "buy", "symbol": "KO"}, {"action": "sell", "symbol": "OXY"}])
    assert subject == "Berkshire: 1 compra y 1 venta nuevas"
    assert "/portfolio/berkshire-hathaway" in html and "No es asesoria" in html
