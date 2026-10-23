"""Rendimiento REAL por eventos: Trump dice, Musk dice e Inverse Cramer.

Cada mención/pick verificado abre una posición al cierre del día de entrada
(precio real de Yahoo). La serie se arma día a día con los precios reales:
el retorno del día es el de las posiciones abiertas el día anterior
(compra = +, corto = -). No se proyectan posiciones actuales hacia atrás:
antes de la primera mención no hay serie. Se guarda con is_estimated=false.

Uso (desde scrapers/, con variables de Supabase):
    python event_series.py --dry-run
    python event_series.py                      # los tres
    python event_series.py --slugs trump-dice
"""

from __future__ import annotations

import argparse
import sys
from datetime import date

sys.path.insert(0, ".")

MONTO = 1000.0


def compute_event_series(
    events: list[dict],
    prices: dict[str, dict[str, float]],
    mode: str = "dollar",
) -> list[dict]:
    """events: [{ticker, entry 'YYYY-MM-DD', exit 'YYYY-MM-DD'|None, side +1/-1}].

    mode 'dollar': cada evento compra US$1.000; pesos según valor de mercado.
    mode 'equal' : igual peso entre posiciones abiertas (rebalanceo diario).
    Devuelve [{date, value_pct}] desde la primera entrada (0%).
    """
    evs = [e for e in events if prices.get(e["ticker"])]
    if not evs:
        return []
    start = min(e["entry"] for e in evs)
    days = sorted({d for e in evs for d in prices[e["ticker"]] if d >= start})
    if len(days) < 2:
        return []

    last: dict[str, float] = {}

    def px(t: str, d: str) -> float | None:
        v = prices[t].get(d)
        if v is not None and v > 0:
            last[t] = v
        return last.get(t)

    # posiciones: dict con ticker, side, units (modo dollar), entry, exit
    positions: list[dict] = []
    pending = sorted(evs, key=lambda e: e["entry"])
    index = 100.0
    out: list[dict] = []
    prev: str | None = None
    for d in days:
        if prev is not None:
            prev_px = {p["ticker"]: last_at_prev[p["ticker"]] for p in positions if p["ticker"] in last_at_prev}
            today_px = {t: px(t, d) for t in {p["ticker"] for p in positions}}
            open_pos = [p for p in positions if p["ticker"] in prev_px and today_px.get(p["ticker"])]
            if open_pos:
                if mode == "dollar":
                    vals = [p["units"] * prev_px[p["ticker"]] for p in open_pos]
                else:
                    vals = [1.0] * len(open_pos)
                tot = sum(vals)
                if tot > 0:
                    r = sum(
                        v / tot * p["side"] * (today_px[p["ticker"]] / prev_px[p["ticker"]] - 1)
                        for v, p in zip(vals, open_pos)
                    )
                    index *= 1 + r
            # cierres al cierre del día de salida
            positions = [p for p in positions if not (p["exit"] and p["exit"] <= d)]
        else:
            for t in {e["ticker"] for e in evs}:
                px(t, d)
        # entradas del día (o pendientes cuya fecha ya pasó: feriado/fin de semana)
        while pending and pending[0]["entry"] <= d:
            e = pending.pop(0)
            price = px(e["ticker"], d)
            if price is None:
                continue
            if e.get("exit") and e["exit"] <= d:
                continue
            positions.append({
                "ticker": e["ticker"],
                "side": e.get("side", 1),
                "units": MONTO / price,
                "exit": e.get("exit"),
            })
        for t in {p["ticker"] for p in positions}:
            px(t, d)
        last_at_prev = dict(last)
        if positions or out:
            out.append({"date": d, "value_pct": round(index - 100.0, 4)})
        prev = d
    return out if len(out) >= 2 else []


def apply_cash_out(
    prices: dict[str, dict[str, float]],
    events: list[dict],
    cash_out: dict[str, tuple[float, str]],
) -> dict[str, dict[str, float]]:
    """Tickers deslistados por compra en efectivo -> serie plana al precio pagado.

    U.S. Steel (X): Nippon Steel cerró la compra el 2025-06-18 pagando US$55
    por acción en efectivo y X dejó de cotizar (Yahoo devuelve 404). Si no hay
    precios, la posición se valoriza a US$55 desde su entrada en todos los días
    hábiles conocidos: entra a 55 y queda plana (aproximación conservadora:
    omite el ~4% que subió X entre el 2025-05-23 y el cierre).
    """
    out = dict(prices)
    days = sorted({d for serie in prices.values() for d in serie})
    for ticker, (cash, _close_date) in cash_out.items():
        if out.get(ticker):
            continue
        entries = [e["entry"] for e in events if e["ticker"] == ticker]
        if not entries:
            continue
        start = min(entries)
        serie = {d: cash for d in days if d >= start}
        if start not in serie:
            serie[start] = cash
        out[ticker] = serie
    return out


def breakdown(events: list[dict], prices: dict[str, dict[str, float]]) -> list[dict]:
    """Desglose por evento: entrada, precio de entrada, precio hoy y retorno."""
    rows = []
    for e in sorted(events, key=lambda x: x["entry"]):
        serie = prices.get(e["ticker"]) or {}
        days = sorted(d for d in serie if d >= e["entry"])
        if not days:
            rows.append({**e, "entry_px": None, "last_px": None, "ret": None})
            continue
        p0, p1 = serie[days[0]], serie[max(serie)]
        rows.append({**e, "entry_day": days[0], "entry_px": p0, "last_px": p1,
                     "ret": (p1 / p0 - 1) * 100 * e.get("side", 1)})
    return rows


# ---- eventos por portafolio ----

def trump_events() -> list[dict]:
    from trump_dice import load_menciones

    return [
        {"ticker": m["ticker"], "entry": str(m["entrada"])[:10], "exit": None, "side": 1}
        for m in load_menciones()
        if str(m.get("status") or "verificada") == "verificada"
    ]


def musk_events() -> list[dict]:
    from musk_dice import SKIP_HOLDING_KINDS, SKIP_HOLDING_SYMBOLS, load_menciones

    return [
        {"ticker": m["ticker"], "entry": str(m["entrada"])[:10], "exit": None, "side": 1}
        for m in load_menciones()
        if str(m.get("status") or "verificada") == "verificada"
        and str(m.get("tipo") or "") not in SKIP_HOLDING_KINDS
        and m["ticker"] not in SKIP_HOLDING_SYMBOLS
    ]


def cramer_events() -> list[dict]:
    from inverse_cramer import HORIZON_BUSINESS_DAYS, _parse_day, add_business_days, load_picks

    out = []
    for p in load_picks():
        if p.get("status") != "verificada" or not p.get("side"):
            continue
        entry = _parse_day(p["entry_date"])
        out.append({
            "ticker": p["ticker"],
            "entry": entry.isoformat(),
            "exit": add_business_days(entry, HORIZON_BUSINESS_DAYS).isoformat(),
            "side": -1 if p["side"] == "corto" else 1,
        })
    return out


PORTFOLIOS = {
    "trump-dice": (trump_events, "dollar"),
    "musk-dice": (musk_events, "equal"),
    "inverse-cramer-real": (cramer_events, "equal"),
}
EVENT_SLUGS = frozenset(PORTFOLIOS)


def main(argv: list[str] | None = None) -> None:
    from etf_series import save_real
    from trump_dice import fetch_prices_yahoo

    ap = argparse.ArgumentParser()
    ap.add_argument("--slugs", nargs="*", default=None)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--desglose", action="store_true", help="imprime retorno por mención")
    args = ap.parse_args(argv or [])

    db = None
    if not args.dry_run:
        from base import get_db

        db = get_db()
    for slug, (loader, mode) in PORTFOLIOS.items():
        if args.slugs and slug not in args.slugs:
            continue
        events = loader()
        if not events:
            print(f"-- {slug}: sin eventos verificados")
            continue
        start = min(e["entry"] for e in events)
        from trump_dice import CASH_OUT

        tickers = sorted({e["ticker"] for e in events if e["ticker"] not in CASH_OUT})
        prices = apply_cash_out(fetch_prices_yahoo(tickers, start), events, CASH_OUT)
        series = compute_event_series(events, prices, mode)
        if not series:
            print(f"WARNING {slug}: sin serie (faltan precios)")
            continue
        print(f"{slug}: {len(events)} eventos, {len(series)} días reales "
              f"{series[0]['date']} a {series[-1]['date']}, acumulado {series[-1]['value_pct']:+.2f}%")
        if args.desglose:
            for r in breakdown(events, prices):
                if r["entry_px"] is None:
                    print(f"  {r['entry']} {r['ticker']:<6} sin precio")
                else:
                    print(f"  {r['entry']} {r['ticker']:<6} entrada {r['entry_px']:9.2f}  hoy {r['last_px']:9.2f}  {r['ret']:+8.1f}%")
        if args.dry_run:
            continue
        res = db.table("portfolios").select("id").eq("slug", slug).maybe_single().execute()
        data = getattr(res, "data", None) if res is not None else None
        if not data:
            print(f"-- {slug}: no está en la DB")
            continue
        save_real(db, data["id"], series)


if __name__ == "__main__":
    main(sys.argv[1:])
