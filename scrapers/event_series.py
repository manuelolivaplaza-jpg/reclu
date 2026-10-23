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
        prices = fetch_prices_yahoo(sorted({e["ticker"] for e in events}), start)
        series = compute_event_series(events, prices, mode)
        if not series:
            print(f"WARNING {slug}: sin serie (faltan precios)")
            continue
        print(f"{slug}: {len(events)} eventos, {len(series)} días reales "
              f"{series[0]['date']} a {series[-1]['date']}, acumulado {series[-1]['value_pct']:+.2f}%")
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
