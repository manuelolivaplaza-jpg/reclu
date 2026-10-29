# Idempotent DDL — run once in the Supabase SQL editor before this scraper.
# The scraper only upserts; it assumes the table already exists.
#
# create table if not exists public.portfolio_performance (
#   id uuid primary key default uuid_generate_v4(),
#   portfolio_id uuid not null references public.portfolios(id) on delete cascade,
#   date date not null,
#   value_pct numeric(12, 4) not null,
#   created_at timestamptz not null default now(),
#   unique (portfolio_id, date)
# );
#
# create index if not exists idx_portfolio_performance_portfolio_date
#   on public.portfolio_performance (portfolio_id, date);
#
# alter table public.portfolio_performance enable row level security;
#
# drop policy if exists "performance public read" on public.portfolio_performance;
# create policy "performance public read"
#   on public.portfolio_performance for select using (true);

"""Historical portfolio performance from current holdings and Yahoo EOD prices.

Daily value = sum(normalized weight * close). The series is rebased so the
first aligned day is 0%. One second between Yahoo symbol requests.

Usage (from the scrapers directory, with Supabase env vars set):
    python performance.py
"""

from __future__ import annotations

import sys

import os
import time
from typing import Any

from holdings_merge import us_class_hyphen
from prices import fetch_eod, yahoo_symbol

PAGE_SIZE = 1000
SYMBOL_DELAY_SECONDS = 1
MAX_HOLDINGS = 40


def _paged(build_query) -> list[dict[str, Any]]:
    """Read every row from a Supabase query, one page at a time."""
    rows: list[dict[str, Any]] = []
    start = 0
    while True:
        result = build_query().range(start, start + PAGE_SIZE - 1).execute()
        batch = result.data or []
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            return rows
        start += PAGE_SIZE


def _holding_rows(db, portfolio_id: str) -> list[dict[str, Any]]:
    def query():
        return (
            db.table("holdings")
            .select("symbol, weight, as_of, exchange, currency")
            .eq("portfolio_id", portfolio_id)
            .order("as_of", desc=True)
            .order("symbol")
        )

    return _paged(query)


def _snapshot_from_rows(rows: list[dict[str, Any]], equal_if_missing: bool) -> list[tuple[str, float]]:
    latest: dict[str, float | None] = {}
    for row in rows:
        symbol = str(row.get("symbol") or "").strip()
        if not symbol:
            continue
        # D70: el ticker Yahoo depende de la bolsa/moneda (SQM-B -> SQM-B.SN).
        yahoo = yahoo_symbol(symbol, row.get("exchange"), row.get("currency")) if " " not in symbol else ""
        key = yahoo or symbol
        weight = row.get("weight")
        weight = None if weight is None else float(weight)
        if key in latest and latest[key] is not None and weight is not None:
            latest[key] += weight  # mismo emisor dos veces en la foto
            continue
        latest.setdefault(key, weight)
    if equal_if_missing and latest and all(w is None for w in latest.values()):
        # D70: carteras sin pesos publicados: pesos iguales (is_estimated).
        return [(symbol, 1.0) for symbol in sorted(latest)]
    return [(symbol, float(latest[symbol])) for symbol in sorted(latest) if latest[symbol] is not None]


def get_holdings_snapshots(
    db, portfolio_id: str, *, equal_if_missing: bool = False
) -> list[tuple[str, list[tuple[str, float]]]]:
    """D74: una foto por as_of [(as_of, [(simbolo, peso)])], de la mas antigua a la mas nueva."""
    by_date: dict[str, list[dict[str, Any]]] = {}
    for row in _holding_rows(db, portfolio_id):
        by_date.setdefault(str(row.get("as_of") or "")[:10], []).append(row)
    out = []
    for as_of in sorted(by_date):
        snap = _snapshot_from_rows(by_date[as_of], equal_if_missing)
        if snap:
            out.append((as_of, snap))
    return out


def get_portfolio_holdings(db, portfolio_id: str, *, equal_if_missing: bool = False) -> list[tuple[str, float]]:
    """Current (symbol, weight) pairs: SOLO la foto mas reciente (as_of maximo).

    D74: antes se unian todas las fotos (la ultima ganaba por simbolo), asi que
    posiciones vendidas hace trimestres seguian en la cartera con su peso viejo.
    """
    snaps = get_holdings_snapshots(db, portfolio_id, equal_if_missing=equal_if_missing)
    return snaps[-1][1] if snaps else []


def _align_prices(
    series_by_symbol: dict[str, list[tuple[str, float]]],
) -> list[tuple[str, dict[str, float]]]:
    """Align closes by date and forward-fill gaps.

    A date is kept only when every symbol has a price on that date or a
    last-known price carried forward from an earlier date. Dates before a
    symbol's first print are dropped. No price is invented backward.
    """
    if not series_by_symbol or any(not rows for rows in series_by_symbol.values()):
        return []

    by_symbol: dict[str, dict[str, float]] = {}
    all_dates: set[str] = set()
    for symbol, rows in series_by_symbol.items():
        prices: dict[str, float] = {}
        for day, close in sorted(rows):
            prices[day] = float(close)
        by_symbol[symbol] = prices
        all_dates.update(prices)

    symbols = list(series_by_symbol)
    last: dict[str, float | None] = {symbol: None for symbol in symbols}
    aligned: list[tuple[str, dict[str, float]]] = []

    for day in sorted(all_dates):
        point: dict[str, float] = {}
        complete = True
        for symbol in symbols:
            raw = by_symbol[symbol].get(day)
            if raw is not None:
                last[symbol] = raw
            if last[symbol] is None:
                complete = False
            else:
                point[symbol] = last[symbol]
        if complete:
            aligned.append((day, point))
    return aligned


NAME_CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "resolve_tickers_cache.json")
MAX_NAME_LOOKUPS = int(os.environ.get("PERFORMANCE_MAX_NAME_LOOKUPS", "60"))


def resolve_named_holdings(holdings, resolver=None, cache=None, max_lookups: int = MAX_NAME_LOOKUPS):
    """Cambia nombres de emisor (13F, con espacios) por su ticker Yahoo.

    Solo en memoria: la base no cambia. Busca primero los de mayor peso y
    a lo mas `max_lookups` nombres nuevos por portafolio (los del cache no
    cuentan). Si dos nombres dan el mismo ticker, se suman los pesos.
    """
    named = sorted([(s, w) for s, w in holdings if " " in s.strip()], key=lambda x: -x[1])
    if not named:
        return holdings
    if resolver is None or cache is None:
        import resolve_tickers as rt

        resolver = resolver or rt.resolve_name
        cache = cache if cache is not None else rt.load_cache(NAME_CACHE_FILE)
    lookups = 0
    mapping: dict[str, str] = {}
    for symbol, _ in named:
        key = symbol.strip()
        if key not in cache:
            if lookups >= max_lookups:
                continue
            lookups += 1
        ticker = resolver(key, cache)
        if ticker:
            mapping[symbol] = ticker
    merged: dict[str, float] = {}
    for symbol, weight in holdings:
        target = mapping.get(symbol, symbol)
        merged[target] = merged.get(target, 0.0) + weight
    if mapping:
        print(f"[performance] {len(mapping)}/{len(named)} nombres resueltos a ticker (en memoria)")
    return list(merged.items())


def _prepare_weights(holdings: list[tuple[str, float]]) -> dict[str, float]:
    holdings = [(symbol, weight) for symbol, weight in holdings if weight > 0]
    # Nombres de emisor sin resolver (13F) no son tickers: se intenta resolver
    # (D28, solo en memoria) y los que quedan se omiten.
    holdings = resolve_named_holdings(holdings)
    skipped = [symbol for symbol, _ in holdings if " " in symbol.strip()]
    if skipped:
        print(f"[performance] {len(skipped)} holdings sin ticker omitidos: " + "; ".join(skipped[:20]))
        holdings = [(symbol, weight) for symbol, weight in holdings if symbol not in skipped]
    holdings.sort(key=lambda item: item[1], reverse=True)
    holdings = holdings[:MAX_HOLDINGS]
    total = sum(weight for _, weight in holdings)
    if total <= 0:
        return {}
    return {symbol: weight / total for symbol, weight in holdings}


def _window_snapshots(snapshots, start: str):
    """Fotos del periodo + la ultima vigente antes del inicio de la ventana."""
    before = [s for s in snapshots if s[0] <= start]
    after = [s for s in snapshots if s[0] > start]
    return (before[-1:] if before else []) + after


def build_performance_series(
    db, portfolio_id: str, days: int = 365, fetch=None
) -> list[dict[str, Any]]:
    """Cumulative return points {date, value_pct} for one portfolio.

    D74: la serie encadena las fotos de cartera (as_of) con chain.chain_series:
    retorno por precio relativo (no se suman precios en distintas monedas),
    forward-fill en feriados y NAV continuo en cada rebalanceo. Un simbolo sin
    precios queda fuera y los pesos se renormalizan. Nada se inventa.
    """
    from datetime import date as _date, timedelta

    from chain import chain_series, to_pct

    default_fetch = fetch is None
    fetch = fetch or (lambda symbol: fetch_eod(us_class_hyphen(symbol), days))  # BRK.B -> BRK-B
    start = (_date.today() - timedelta(days=days)).isoformat()
    snapshots = get_holdings_snapshots(db, portfolio_id, equal_if_missing=True)
    snapshots = _window_snapshots(snapshots, start)
    weighted = [(as_of, _prepare_weights(h)) for as_of, h in snapshots]
    weighted = [(as_of, w) for as_of, w in weighted if w]
    if not weighted:
        return []

    prices: dict[str, list[tuple[str, float]]] = {}
    symbols = sorted({s for _, w in weighted for s in w})
    for index, symbol in enumerate(symbols):
        if index and default_fetch:
            time.sleep(SYMBOL_DELAY_SECONDS)
        try:
            rows = fetch(symbol)
        except Exception as exc:  # noqa: BLE001 - un simbolo malo queda fuera
            print(f"WARNING {symbol}: {exc}")
            continue
        if not rows:
            print(f"WARNING {symbol}: no prices")
            continue
        prices[symbol] = rows
    return to_pct(chain_series(weighted, prices))


def _is_missing_table(exc: Exception) -> bool:
    text = str(exc).lower()
    if "42p01" in text or "pgrst205" in text:
        return True
    mentions_table = "portfolio_performance" in text
    missing = "does not exist" in text or "schema cache" in text or "could not find" in text
    return mentions_table and missing


def stitch_estimated(
    est: list[dict[str, Any]],
    real: list[dict[str, Any]],
    existing: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Puntos estimados que se pueden escribir sin pisar historia real.

    - Con historia real: solo fechas anteriores al primer punto real, y la
      proyección se reescala para empalmar en ese punto (misma base).
    - Sin historia real: toda la proyección; si ya hay filas estimadas más
      antiguas, se reescala para empalmar con la fila existente en su primera
      fecha (evita un salto al rebasar a 0% en cada corrida).
    """
    if not est:
        return []
    est = sorted(est, key=lambda p: p["date"])

    def level(p: dict[str, Any]) -> float:
        return 1 + float(p["value_pct"]) / 100

    def scaled(points: list[dict[str, Any]], factor: float) -> list[dict[str, Any]]:
        return [
            {"date": p["date"], "value_pct": round((level(p) * factor - 1) * 100, 4)}
            for p in points
        ]

    real = sorted(real or [], key=lambda p: p["date"])
    if real:
        first = real[0]
        out: list[dict[str, Any]] = []
        before = [p for p in est if p["date"] < first["date"]]
        if before:
            upto = [p for p in est if p["date"] <= first["date"]]
            join = upto[-1]
            if level(join) > 0:
                out.extend(scaled(before, level(first) / level(join)))
        # D70: tramo DESPUES del ultimo punto real (13F trimestral, eventos).
        # Antes quedaban filas estimadas viejas con otra base y aparecia un
        # salto de un dia (-20% a -51% el 17-ago en los 13F). Se encadena:
        # la proyeccion arranca en el nivel del ultimo punto real (NAV continuo).
        last = real[-1]
        after = [p for p in est if p["date"] > last["date"]]
        if after:
            upto = [p for p in est if p["date"] <= last["date"]]
            join = upto[-1] if upto else None
            if join is not None and level(join) > 0:
                out.extend(scaled(after, level(last) / level(join)))
        return out

    prior = sorted(
        (p for p in (existing or []) if p["date"] <= est[0]["date"]),
        key=lambda p: p["date"],
    )
    if prior and level(est[0]) > 0:
        return scaled(est, level(prior[-1]) / level(est[0]))
    return est


def _existing_rows(db, portfolio_id: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]] | None:
    """(reales, estimadas) actuales; None si la columna is_estimated no existe."""
    try:
        res = (
            db.table("portfolio_performance")
            .select("date,value_pct,is_estimated")
            .eq("portfolio_id", portfolio_id)
            .order("date")
            .limit(5000)
            .execute()
        )
    except Exception as exc:  # noqa: BLE001
        print(f"WARNING is_estimated no disponible (aplica la 057): {exc}")
        return None
    rows = getattr(res, "data", None) or []
    real = [r for r in rows if r.get("is_estimated") is False]
    est = [r for r in rows if r.get("is_estimated") is not False]
    return real, est


def save_snapshots(db, portfolio_id: str, series: list[dict[str, Any]]) -> bool:
    """Upsert {date, value_pct} into portfolio_performance.

    Returns False when the table is missing so the caller can keep going.
    portfolio_snapshots is not used: it stores symbol weights, not returns.
    """
    if not series:
        return True

    payload = [
        {
            "portfolio_id": portfolio_id,
            "date": point["date"],
            "value_pct": point["value_pct"],
            **({"is_estimated": True} if point.get("is_estimated") else {}),
        }
        for point in series
    ]
    try:
        db.table("portfolio_performance").upsert(
            payload, on_conflict="portfolio_id,date"
        ).execute()
    except Exception as exc:  # noqa: BLE001 — missing table must not abort the run
        if _is_missing_table(exc):
            print(
                "WARNING: table portfolio_performance does not exist. "
                "Run the SQL at the top of scrapers/performance.py, then re-run. "
                f"Skipping save ({exc})."
            )
            return False
        raise
    return True


def stale_estimated_dates(
    series: list[dict[str, Any]], est_rows: list[dict[str, Any]]
) -> list[str]:
    """D74: fechas estimadas viejas dentro del tramo recien escrito que la
    corrida nueva ya no trae (feriados de la cartera vieja, otra base, etc.).

    Esas filas quedaban entre puntos nuevos y daban saltos de un dia (bice
    2026-09-18 y 2026-10-12: feriados CL que solo existian en la serie vieja
    con tickers de EE.UU.). Nunca toca filas reales.
    """
    if not series:
        return []
    written = {str(p["date"])[:10] for p in series}
    lo, hi = min(written), max(written)
    return sorted(
        {
            str(r["date"])[:10]
            for r in est_rows
            if r.get("is_estimated") is not False
            and lo <= str(r["date"])[:10] <= hi
            and str(r["date"])[:10] not in written
        }
    )


def prune_stale_estimated(db, portfolio_id: str, series, est_rows) -> int:
    dates = stale_estimated_dates(series, est_rows)
    for i in range(0, len(dates), 200):
        (
            db.table("portfolio_performance")
            .delete()
            .eq("portfolio_id", portfolio_id)
            .eq("is_estimated", True)
            .in_("date", dates[i : i + 200])
            .execute()
        )
    return len(dates)


def _active_portfolios(db) -> list[dict[str, Any]]:
    def query():
        return (
            db.table("portfolios")
            .select("id, slug")
            .eq("is_active", True)
            .order("slug")
        )

    return _paged(query)


DEFAULT_LOOKBACK_DAYS = 365

# ETFs: su serie real es el precio del propio fondo (etf_series.py).
try:
    from etf_series import ETF_TICKERS as _ETF_TICKERS

    ETF_REAL_SLUGS = frozenset(_ETF_TICKERS)
except Exception:  # noqa: BLE001
    ETF_REAL_SLUGS = frozenset()

# Portafolios por eventos: serie real en event_series.py (nunca se proyectan).
EVENT_REAL_SLUGS = frozenset({"trump-dice", "musk-dice", "inverse-cramer-real", "inverse-cramer-compras"})

# D34: carteras AFP con serie real mensual (afp_series.py); no se proyectan.
AFP_REAL_SLUGS = frozenset({
    "afp-consenso-chile", "afp-modelo-acciones-cl", "afp-capital-acciones-cl",
    "afp-cuprum-acciones-cl", "afp-habitat-acciones-cl", "afp-planvital-acciones-cl",
    "afp-provida-acciones-cl", "afp-uno-acciones-cl",
})


def lookback_days(days: int | None = None, since: str | None = None, today=None) -> int:
    """Días de historia a reconstruir. --since (YYYY-MM-DD) manda sobre --days.

    Sin argumentos devuelve el default de siempre (365).
    """
    from datetime import date as _date

    if since:
        start = _date.fromisoformat(since)
        ref = today or _date.today()
        delta = (ref - start).days
        if delta <= 0:
            raise ValueError(f"--since {since} no es anterior a hoy")
        return delta
    if days is not None:
        if days <= 0:
            raise ValueError("--days debe ser > 0")
        return days
    return DEFAULT_LOOKBACK_DAYS


def main(argv: list[str] | None = None) -> None:
    """argv=None (llamado desde run_all) usa los defaults, sin leer sys.argv."""
    import argparse

    from base import get_db

    parser = argparse.ArgumentParser(description="Series de rendimiento históricas")
    parser.add_argument("--days", type=int, default=None, help="días de historia (default 365)")
    parser.add_argument("--since", default=None, help="fecha inicial YYYY-MM-DD (manda sobre --days)")
    parser.add_argument("--slugs", nargs="*", default=None, help="limitar a estos slugs")
    args = parser.parse_args(argv or [])
    days = lookback_days(args.days, args.since)
    print(f"[performance] lookback {days} días")

    db = get_db()
    portfolios = _active_portfolios(db)
    if args.slugs:
        wanted = set(args.slugs)
        portfolios = [p for p in portfolios if p.get("slug") in wanted]
    ok = 0
    for portfolio in portfolios:
        portfolio_id = portfolio["id"]
        slug = portfolio.get("slug") or portfolio_id
        try:
            if slug in EVENT_REAL_SLUGS:
                print(f"-- {slug}: serie real por eventos (event_series.py), no se proyecta")
                continue
            if slug in AFP_REAL_SLUGS:
                print(f"-- {slug}: serie real mensual (afp_series.py), no se proyecta")
                continue
            if slug in ETF_REAL_SLUGS:
                print(f"-- {slug}: ETF con serie real (etf_series.py), no se proyecta")
                continue
            series = build_performance_series(db, portfolio_id, days)
            existing = _existing_rows(db, portfolio_id)
            if existing is not None:
                real_rows, est_rows = existing
                series = [
                    {**p, "is_estimated": True}
                    for p in stitch_estimated(series, real_rows, est_rows)
                ]
            saved = save_snapshots(db, portfolio_id, series)
            if saved and existing is not None:
                pruned = prune_stale_estimated(db, portfolio_id, series, existing[1])
                if pruned:
                    print(f"-- {slug}: {pruned} filas estimadas viejas borradas")
            if not saved:
                print(f"WARNING {slug}: series built ({len(series)} points) but not saved")
                continue
            print(f"OK {slug}: {len(series)} points")
            ok += 1
        except Exception as exc:  # noqa: BLE001 — one portfolio must not stop the rest
            print(f"WARNING {slug}: {exc}")
    print(f"{ok}/{len(portfolios)} portfolios")


if __name__ == "__main__":
    main(sys.argv[1:])
