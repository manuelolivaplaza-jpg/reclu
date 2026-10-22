"""Compute real returns for holdings from the prices table.

For every holding, look up the latest known close for its symbol and
compute return_pct = (price_current - price_at_disclosure) /
price_at_disclosure * 100 (only when a real disclosure price exists).
Holdings without a known price are skipped with a warning — never invent
a number.

Run after scrapers/prices.py has refreshed the prices table.

F5 addition: compute_benchmark_metrics() also writes the per-period
portfolio_metrics rows (return, benchmark, Sharpe, drawdown, volatility)
comparing each portfolio's series in portfolio_performance against the
benchmark series in benchmark_prices (S&P 500 / IPSA, see benchmarks.py).
"""

from __future__ import annotations

import time

import math
from datetime import date, datetime, timezone

from base import get_db


def latest_price(db, symbol: str) -> float | None:
    """Latest close for a symbol from the prices table, or None."""
    result = (
        db.table("prices")
        .select("close")
        .eq("symbol", symbol)
        .order("date", desc=True)
        .limit(1)
        .maybe_single()
        .execute()
    )
    data = result.data if result is not None else None
    return data["close"] if data else None


BATCH_SIZE = 200
MAX_ATTEMPTS = 4
BACKOFF_BASE_S = 1.0
_TRANSIENT_MARKERS = (
    "server disconnected",
    "remoteprotocolerror",
    "connection reset",
    "connecterror",
    "readtimeout",
    "readerror",
    "timed out",
)


def is_transient(exc: BaseException) -> bool:
    """Errores de red pasajeros (p. ej. httpx 'Server disconnected')."""
    text = f"{type(exc).__name__} {exc}".lower()
    return any(marker in text for marker in _TRANSIENT_MARKERS)


def with_retry(fn, attempts: int = MAX_ATTEMPTS, base_delay: float = BACKOFF_BASE_S, sleep=time.sleep):
    """Llama fn(); reintenta con backoff exponencial solo ante errores pasajeros."""
    for attempt in range(1, attempts + 1):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001
            if not is_transient(exc) or attempt == attempts:
                raise
            delay = base_delay * (2 ** (attempt - 1))
            print(f"[compute_returns] {type(exc).__name__}: reintento {attempt}/{attempts - 1} en {delay:.0f}s")
            sleep(delay)
    return None


def _process_batch(db, batch: list[dict], done: set) -> int:
    updated = 0
    for h in batch:
        if h["id"] in done:
            continue
        price = latest_price(db, h["symbol"])
        if price is None:
            print(f"WARNING {h['symbol']}: no price in prices table, skipping")
            done.add(h["id"])
            continue

        update: dict[str, float] = {"price_current": price}
        disclosure = h.get("price_at_disclosure")
        if disclosure and disclosure > 0:
            update["return_pct"] = round((price - disclosure) / disclosure * 100, 2)

        db.table("holdings").update(update).eq("id", h["id"]).execute()
        done.add(h["id"])
        updated += 1
    return updated


def compute_returns(db, batch_size: int = BATCH_SIZE, sleep=time.sleep) -> dict[str, int]:
    """Fill price_current and return_pct on every holding.

    Se procesa por lotes. Si un lote cae por un error de red pasajero
    ('Server disconnected'), se reintenta con backoff solo lo que faltó de
    ese lote; si se agotan los intentos, se registra y se sigue con el
    siguiente lote.
    """
    holdings = with_retry(
        lambda: db.table("holdings").select("id, symbol, price_at_disclosure").execute(),
        sleep=sleep,
    )
    rows = (holdings.data if holdings is not None else None) or []

    updated = 0
    failed_batches = 0
    done: set = set()
    for start in range(0, len(rows), batch_size):
        batch = rows[start : start + batch_size]
        counter = {"n": 0}

        def run(batch=batch, counter=counter):
            counter["n"] += _process_batch(db, batch, done)

        try:
            with_retry(run, sleep=sleep)
        except Exception as exc:  # noqa: BLE001
            failed_batches += 1
            print(f"WARNING lote {start // batch_size + 1}: {type(exc).__name__}: {exc}; se sigue con el siguiente")
        updated += counter["n"]

    print(f"{updated}/{len(rows)} updated" + (f", {failed_batches} lotes fallidos" if failed_batches else ""))
    return {"updated": updated, "total": len(rows), "failed_batches": failed_batches}


# ============================================================================
# F5: métricas de rendimiento por periodo vs. benchmark (S&P 500 / IPSA).
# Espejo de la lógica de src/lib/performance.ts (misma metodología) para que
# el backfill del scraper y el cálculo en vivo de la UI coincidan.
# ============================================================================

TRADING_DAYS_PER_YEAR = 252
MIN_DAYS_CAGR = 180
MIN_RETURNS_VOLATILITY = 10
MIN_RETURNS_SHARPE = 30
DEFAULT_RISK_FREE_PCT = 4.0


def _valid_iso_date(day: str) -> bool:
    try:
        date.fromisoformat(day)
        return True
    except ValueError:
        return False


def _pct_series_to_levels(rows: list[dict]) -> list[tuple[str, float]]:
    """Convierte filas {date, value_pct} (retorno acumulado %) a nivel base 100."""
    levels: list[tuple[str, float]] = []
    for row in rows:
        try:
            value_pct = float(row["value_pct"])
            day = row["date"][:10]
        except (KeyError, TypeError, ValueError):
            continue
        if not _valid_iso_date(day):
            continue
        levels.append((day, 100.0 * (1.0 + value_pct / 100.0)))
    levels.sort(key=lambda item: item[0])
    return levels


def _benchmark_levels(rows: list[dict]) -> list[tuple[str, float]]:
    """Convierte filas {date, close} a (fecha, nivel), ordenadas y válidas."""
    levels: list[tuple[str, float]] = []
    for row in rows:
        try:
            close = float(row["close"])
            day = row["date"][:10]
        except (KeyError, TypeError, ValueError):
            continue
        if close > 0 and _valid_iso_date(day):
            levels.append((day, close))
    levels.sort(key=lambda item: item[0])
    return levels


def _align_by_date(
    a: list[tuple[str, float]], b: list[tuple[str, float]]
) -> tuple[list[tuple[str, float]], list[tuple[str, float]]]:
    map_b = dict(b)
    aligned_a = [(day, value) for day, value in a if day in map_b]
    aligned_b = [(day, map_b[day]) for day, _ in aligned_a]
    return aligned_a, aligned_b


def _daily_returns(series: list[tuple[str, float]]) -> list[float]:
    returns: list[float] = []
    for i in range(1, len(series)):
        prev = series[i - 1][1]
        if prev > 0:
            returns.append(series[i][1] / prev - 1.0)
    return returns


def _sample_std(values: list[float]) -> float:
    n = len(values)
    if n < 2:
        return 0.0
    mean = sum(values) / n
    variance = sum((v - mean) ** 2 for v in values) / (n - 1)
    return math.sqrt(variance)


def _days_between(first: str, last: str) -> int:
    d0 = datetime.strptime(first, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    d1 = datetime.strptime(last, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    return (d1 - d0).days


def _cumulative_return_pct(series: list[tuple[str, float]]) -> float | None:
    if len(series) < 2:
        return None
    first = series[0][1]
    if first <= 0:
        return None
    return (series[-1][1] / first - 1.0) * 100.0


def _cagr_pct(series: list[tuple[str, float]]) -> float | None:
    if len(series) < 2:
        return None
    days = _days_between(series[0][0], series[-1][0])
    if days < MIN_DAYS_CAGR:
        return None
    ratio = series[-1][1] / series[0][1]
    if ratio <= 0:
        return None
    years = days / 365.25
    return (ratio ** (1.0 / years) - 1.0) * 100.0


def _volatility_pct(series: list[tuple[str, float]]) -> float | None:
    returns = _daily_returns(series)
    if len(returns) < MIN_RETURNS_VOLATILITY:
        return None
    return _sample_std(returns) * math.sqrt(TRADING_DAYS_PER_YEAR) * 100.0


def _sharpe(series: list[tuple[str, float]], risk_free_pct: float) -> float | None:
    returns = _daily_returns(series)
    if len(returns) < MIN_RETURNS_SHARPE:
        return None
    cagr = _cagr_pct(series)
    vol = _volatility_pct(series)
    if cagr is None or vol is None or vol == 0:
        return None
    return (cagr - risk_free_pct) / vol


def _max_drawdown_pct(series: list[tuple[str, float]]) -> float | None:
    if len(series) < 2:
        return None
    peak = series[0][1]
    max_dd = 0.0
    for _, value in series:
        if value > peak:
            peak = value
        if peak > 0:
            dd = 1.0 - value / peak
            if dd > max_dd:
                max_dd = dd
    return max_dd * 100.0


def _safe_date(year: int, month: int, day: int) -> date:
    """Fecha con clamp de día (31 de abril => 30 de abril), a prueba de Feb 29."""
    # Día máximo real del mes/año pedido.
    while month > 12:
        month -= 12
        year += 1
    while month < 1:
        month += 12
        year -= 1
    if month == 12:
        last = 31
    else:
        last = (date(year, month + 1, 1) - date(year, month, 1)).days
    return date(year, month, min(day, last))


def _period_return_pct(series: list[tuple[str, float]], period: str) -> float | None:
    """Retorno de la ventana 1M/3M/YTD/1A hasta el último punto."""
    if len(series) < 2:
        return None
    last_day, last_value = series[-1]
    d = date.fromisoformat(last_day)
    if period == "1M":
        start = _safe_date(d.year, d.month - 1, d.day)
    elif period == "3M":
        start = _safe_date(d.year, d.month - 3, d.day)
    elif period == "YTD":
        start = date(d.year, 1, 1)
    elif period == "1A":
        start = _safe_date(d.year - 1, d.month, d.day)
    else:
        raise ValueError(f"periodo desconocido: {period}")

    base = None
    for day, value in series:
        if day <= start.isoformat():
            base = (day, value)
        elif day > start.isoformat():
            break
    if base is None:
        base = series[0]
    # Ventana insuficiente: no inventar.
    span = _days_between(base[0], last_day)
    minimum = {"1M": 14, "3M": 45, "YTD": 14, "1A": 150}[period]
    if span < minimum:
        return None
    if base[1] <= 0:
        return None
    return (last_value / base[1] - 1.0) * 100.0


def _round(value: float | None, digits: int = 4) -> float | None:
    if value is None:
        return None
    return round(value, digits)


def compute_benchmark_metrics(db, benchmark_symbols: list[str] | None = None) -> dict[str, int]:
    """Calcula y guarda métricas por periodo en portfolio_metrics.

    Para cada portafolio activo con serie en portfolio_performance y cada
    benchmark con serie en benchmark_prices: retorna acumulado, retorno vs
    benchmark (exceso), Sharpe, volatilidad y máxima caída.
    Regla del catálogo: portafolios US/Global se comparan con ^GSPC y los CL
    con ^IPSA (si no hay serie del índice, se omite con warning).
    """
    symbols = benchmark_symbols or ["^GSPC", "^IPSA"]

    portfolios = db.table("portfolios").select("id, country").eq("is_active", True).execute()
    rows = portfolios.data or []

    updated = 0
    for portfolio in rows:
        portfolio_id = portfolio["id"]
        country = portfolio.get("country", "US")

        perf = (
            db.table("portfolio_performance")
            .select("date, value_pct")
            .eq("portfolio_id", portfolio_id)
            .order("date", desc=False)
            .limit(2000)
            .execute()
        )
        levels = _pct_series_to_levels(perf.data or [])
        if len(levels) < 2:
            continue

        benchmark_symbol = "^IPSA" if country == "CL" else "^GSPC"
        if benchmark_symbol not in symbols:
            continue
        bench_rows = (
            db.table("benchmark_prices")
            .select("date, close")
            .eq("symbol", benchmark_symbol)
            .order("date", desc=False)
            .limit(2000)
            .execute()
        )
        benchmark = _benchmark_levels(bench_rows.data or [])
        if len(benchmark) < 2:
            print(f"WARNING {portfolio_id}: sin serie de {benchmark_symbol}, se omite")
            continue

        aligned_p, aligned_b = _align_by_date(levels, benchmark)
        if len(aligned_p) < 2:
            continue

        as_of = aligned_p[-1][0]
        p_return = _cumulative_return_pct(aligned_p)
        b_return = _cumulative_return_pct(aligned_b)

        # Sharpe/vol/dd sobre la serie del portafolio (no la alineada, para
        # no castigar un benchmark con menos fechas).
        sharpe = _sharpe(levels, DEFAULT_RISK_FREE_PCT)
        volatility = _volatility_pct(levels)
        max_dd = _max_drawdown_pct(levels)

        payload = {
            "portfolio_id": portfolio_id,
            "as_of": as_of,
            "period": "TOTAL",
            "return_pct": _round(p_return),
            "benchmark_symbol": benchmark_symbol,
            "benchmark_return_pct": _round(b_return),
            "sharpe": _round(sharpe),
            "max_drawdown": _round(max_dd),
            "volatility": _round(volatility),
            "alpha_pct": None,
            "win_rate": None,
            "method": "cierre-diario, pesos-actualizados",
            "data_points": len(aligned_p),
        }
        db.table("portfolio_metrics").upsert(payload, on_conflict="portfolio_id,period,benchmark_symbol").execute()
        updated += 1

        # Ventanas 1M/3M/YTD/1A: retorno del portafolio y del benchmark en
        # la misma ventana (el benchmark mide su propia ventana).
        for period in ("1M", "3M", "YTD", "1A"):
            p_window = _period_return_pct(levels, period)
            b_window = _period_return_pct(benchmark, period)
            if p_window is None:
                continue
            row = {
                "portfolio_id": portfolio_id,
                "as_of": as_of,
                "period": period,
                "return_pct": _round(p_window),
                "benchmark_symbol": benchmark_symbol,
                "benchmark_return_pct": _round(b_window),
                "sharpe": None,
                "max_drawdown": None,
                "volatility": None,
                "alpha_pct": None,
                "win_rate": None,
                "method": "cierre-diario, pesos-actualizados",
                "data_points": None,
            }
            db.table("portfolio_metrics").upsert(
                row, on_conflict="portfolio_id,period,benchmark_symbol"
            ).execute()
            updated += 1

    print(f"portfolio_metrics: {updated} rows upserted")
    return {"updated": updated}


def main() -> None:
    compute_returns(get_db())
    compute_benchmark_metrics(get_db())


if __name__ == "__main__":
    main()
