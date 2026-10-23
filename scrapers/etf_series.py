"""Rendimiento REAL de los portafolios que replican un ETF.

Para un ETF la serie de precio del propio fondo (Yahoo, cierre diario) es su
rendimiento real: no hace falta reconstruir con posiciones. Reemplaza toda la
serie del portafolio (incluidas filas estimadas) con is_estimated = false.

Uso (desde scrapers/, con las variables de Supabase):
    python etf_series.py                 # todos, 760 días
    python etf_series.py --days 760 --slugs arkk ibit
"""

from __future__ import annotations

import argparse
import sys
import time

sys.path.insert(0, ".")

from etfs import ARK_FUNDS, GLOBALX_FUNDS, ISHARES_FUNDS, SUBVERSIVE_FUNDS, VANECK_FUNDS

SUBVERSIVE_TICKERS = {"nanc-etf": "NANC", "gop-etf": "GOP"}

ETF_TICKERS: dict[str, str] = {
    **{slug: slug.upper() for slug in ARK_FUNDS},
    **{slug: ticker.upper() for slug, ticker in GLOBALX_FUNDS.items()},
    **{slug: slug.upper() for slug in ISHARES_FUNDS},
    **{slug: ticker.upper() for slug, ticker in VANECK_FUNDS.items()},
    **{slug: SUBVERSIVE_TICKERS[slug] for slug in SUBVERSIVE_FUNDS if slug in SUBVERSIVE_TICKERS},
}

DEFAULT_DAYS = 760
CHUNK = 500


def rebase(closes: list[tuple[str, float]]) -> list[dict]:
    """[(fecha, cierre)] -> [{date, value_pct}] con el primer día en 0%."""
    pts = sorted((d, c) for d, c in closes if c and c > 0)
    if len(pts) < 2:
        return []
    base = pts[0][1]
    return [{"date": d, "value_pct": round((c / base - 1) * 100, 4)} for d, c in pts]


def save_real(db, portfolio_id: str, series: list[dict]) -> int:
    if not series:
        return 0
    db.table("portfolio_performance").delete().eq("portfolio_id", portfolio_id).execute()
    rows = [{"portfolio_id": portfolio_id, **p, "is_estimated": False} for p in series]
    for i in range(0, len(rows), CHUNK):
        db.table("portfolio_performance").upsert(rows[i : i + CHUNK], on_conflict="portfolio_id,date").execute()
    return len(rows)


def main(argv: list[str] | None = None) -> None:
    from base import get_db
    from prices import fetch_eod

    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=DEFAULT_DAYS)
    ap.add_argument("--slugs", nargs="*", default=None)
    args = ap.parse_args(argv or [])

    db = get_db()
    ok = 0
    targets = {s: t for s, t in ETF_TICKERS.items() if not args.slugs or s in args.slugs}
    for slug, ticker in targets.items():
        res = db.table("portfolios").select("id").eq("slug", slug).maybe_single().execute()
        data = getattr(res, "data", None) if res is not None else None
        if not data:
            print(f"-- {slug}: no está en la DB")
            continue
        try:
            series = rebase(fetch_eod(ticker, args.days))
        except Exception as exc:  # noqa: BLE001
            print(f"WARNING {slug} ({ticker}): {exc}")
            continue
        if not series:
            print(f"WARNING {slug} ({ticker}): sin precios, no se toca la serie")
            continue
        n = save_real(db, data["id"], series)
        print(f"OK {slug} ({ticker}): {n} puntos reales {series[0]['date']}→{series[-1]['date']}")
        ok += 1
        time.sleep(1)
    print(f"{ok}/{len(targets)} ETFs con serie real")


if __name__ == "__main__":
    main(sys.argv[1:])
