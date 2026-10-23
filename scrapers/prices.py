"""End-of-day price feed for reclu.cl.

Downloads daily closing prices from Yahoo Finance (free, no API key) and
upserts them into the `prices` table so portfolio returns and charts are
based on real market data instead of hardcoded numbers.

Usage:
    PRICE_SYMBOLS="NVDA,AAPL,^GSPC" python prices.py
    PRICE_SYMBOLS="NVDA,AAPL" python prices.py --dry-run

Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see base.get_db),
except in --dry-run mode which never writes to the database. With
USER_HOLDINGS_PRICES_ENABLED=true the dry-run only reads user_holdings to
report how many symbols would be added.
"""

from __future__ import annotations

import os
import time
from datetime import datetime, timezone

import httpx

YAHOO_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"

# Default basket: mega-cap tech + S&P 500 index. Override with PRICE_SYMBOLS.
PRICE_SYMBOLS = [
    "NVDA",
    "AAPL",
    "MSFT",
    "GOOGL",
    "AMZN",
    "META",
    "TSLA",
    "AVGO",
    "^GSPC",
]

# Nombre histórico: run_all.py y tests lo importaban antes de F63.
DEFAULT_SYMBOLS = PRICE_SYMBOLS

# Yahoo lista las acciones chilenas con sufijo .SN (ej. SQM-B.SN).
CHILE_MARKET = "CL"
CHILE_SUFFIX = ".SN"


def _flag_enabled(name: str) -> bool:
    """Flags del proyecto: solo se encienden con el valor exacto "true"."""
    return os.environ.get(name) == "true"


def user_holdings_prices_enabled() -> bool:
    """Precios de las tenencias de usuarios, apagados por defecto."""
    return _flag_enabled("USER_HOLDINGS_PRICES_ENABLED")


def normalize_symbol(symbol: str, market: str | None = None) -> str:
    """Normaliza un ticker para Yahoo Finance.

    Las acciones chilenas (market='CL') llevan sufijo .SN. No duplica el
    sufijo si el ticker ya lo trae, y devuelve "" para símbolos vacíos.
    """
    clean = (symbol or "").strip().upper()
    if not clean:
        return ""
    if market == CHILE_MARKET and not clean.endswith(CHILE_SUFFIX):
        clean = f"{clean}{CHILE_SUFFIX}"
    return clean


def merge_price_symbols(base: list[str], extra: list[str]) -> list[str]:
    """Une dos listas de símbolos sin duplicados, conservando el orden."""
    merged: list[str] = []
    seen: set[str] = set()
    for symbol in list(base) + list(extra):
        clean = normalize_symbol(symbol)
        if clean and clean not in seen:
            seen.add(clean)
            merged.append(clean)
    return merged


def symbols_from_user_holdings(db, limit: int = 500) -> list[str]:
    """Símbolos distintos de `user_holdings`, listos para Yahoo.

    Lee con el cliente service role que recibe `db` (get_db en producción).
    Devuelve solo los tickers: sin user_id, cantidades ni pesos.
    """
    rows = (
        db.table("user_holdings")
        .select("symbol, market")
        .limit(limit)
        .execute()
        .data
        or []
    )
    symbols: list[str] = []
    seen: set[str] = set()
    for row in rows:
        symbol = normalize_symbol(row.get("symbol", ""), row.get("market"))
        if symbol and symbol not in seen:
            seen.add(symbol)
            symbols.append(symbol)
    return symbols


JAPAN_EXCHANGES = {"TSE", "TYO", "JPX", "JP", "TOKYO"}
SKIP_SYMBOLS = {"USD-CASH", "CASH", "USD"}


def yahoo_symbol(symbol: str, exchange: str | None = None, currency: str | None = None) -> str:
    """Ticker de holdings -> ticker Yahoo; "" si no es cotizable.

    Salta vacios, con espacios (nombres de fondos/bonos) y caja (USD-CASH).
    Chile (exchange BCS o moneda CLP) -> .SN; Japon (bolsa TSE o codigo de
    4 digitos, ej. 4689) -> .T. Si ya trae sufijo, lo respeta.
    """
    clean = (symbol or "").strip().upper()
    if not clean or " " in clean or clean in SKIP_SYMBOLS or clean.endswith("-CASH"):
        return ""
    if "." in clean or clean.startswith("^"):
        return clean
    ex = (exchange or "").strip().upper()
    if ex in ("BCS", "SSE", "SN") or (currency or "").upper() == "CLP":
        return clean + CHILE_SUFFIX
    if ex in JAPAN_EXCHANGES or (len(clean) == 4 and clean.isdigit()):
        return clean + ".T"
    return clean


def symbols_from_portfolio_holdings(db, page: int = 1000) -> dict[str, str]:
    """{simbolo_en_holdings: simbolo_yahoo} de TODOS los snapshots de holdings.

    Todos (no solo el ultimo) porque compute_returns recorre todas las filas.
    Solo lectura, paginado.
    """
    out: dict[str, str] = {}
    start = 0
    while True:
        rows = (
            db.table("holdings").select("symbol, exchange, currency")
            .range(start, start + page - 1).execute().data or []
        )
        for r in rows:
            raw = (r.get("symbol") or "").strip()
            ysym = yahoo_symbol(raw, r.get("exchange"), r.get("currency"))
            if ysym and raw not in out:
                out[raw] = ysym
        if len(rows) < page:
            return out
        start += page


def fetch_with_retry(symbol: str, days: int, attempts: int = 3, sleep=time.sleep):
    """fetch_eod con reintentos (backoff 1/2 s); 404 no se reintenta."""
    for i in range(attempts):
        try:
            return fetch_eod(symbol, days)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404 or i == attempts - 1:
                raise
        except Exception:  # noqa: BLE001
            if i == attempts - 1:
                raise
        sleep(2 ** i)
    return []


def fetch_eod(symbol: str, days: int = 365) -> list[tuple[str, float]]:
    """Fetch end-of-day closes for a symbol from Yahoo Finance.

    Returns a list of (iso_date, close) tuples, skipping null closes.
    """
    resp = httpx.get(
        YAHOO_URL.format(symbol=symbol),
        params={"range": f"{days}d", "interval": "1d"},
        headers={"User-Agent": USER_AGENT},
        timeout=30.0,
        follow_redirects=True,
    )
    resp.raise_for_status()
    result = resp.json()["chart"]["result"][0]
    timestamps = result["timestamp"]
    closes = result["indicators"]["quote"][0]["close"]

    rows: list[tuple[str, float]] = []
    for ts, close in zip(timestamps, closes):
        if close is None:
            continue
        date = datetime.fromtimestamp(ts, tz=timezone.utc).date().isoformat()
        rows.append((date, close))
    return rows


def upsert_prices(db, symbol: str, rows: list[tuple[str, float]]) -> None:
    """Upsert (symbol, date, close) rows into the prices table."""
    if not rows:
        return
    payload = [{"symbol": symbol, "date": date, "close": close} for date, close in rows]
    db.table("prices").upsert(payload, on_conflict="symbol,date").execute()


def refresh_all(db, symbols: list[str], dry_run: bool = False, days: int = 365,
                aliases: dict[str, str] | None = None, batch: int = 50) -> dict[str, int]:
    """Refresh prices for all symbols, tolerating per-symbol failures.

    If dry_run is True, only print how many rows would be downloaded per
    symbol plus the first and last (date, close), without writing to the DB.
    """
    ok = 0
    aliases = aliases or {}
    for n, symbol in enumerate(symbols, 1):
        if n % batch == 0:
            print(f"... lote {n}/{len(symbols)}")
        fetch_sym = aliases.get(symbol, symbol)
        try:
            rows = fetch_with_retry(fetch_sym, days)
            if dry_run:
                if rows:
                    first_date, first_close = rows[0]
                    last_date, last_close = rows[-1]
                    print(
                        f"DRY-RUN {symbol}: {len(rows)} rows "
                        f"(first {first_date} @ {first_close}, "
                        f"last {last_date} @ {last_close})"
                    )
                else:
                    print(f"DRY-RUN {symbol} [{fetch_sym}]: 0 rows")
            else:
                upsert_prices(db, symbol, rows)
                print(f"OK {symbol}: {len(rows)} rows")
            ok += 1
        except Exception as e:  # noqa: BLE001 - keep going on any single-symbol error
            print(f"WARNING {symbol} [{fetch_sym}]: {e}")
        time.sleep(0.3)
    print(f"{ok}/{len(symbols)} OK")
    return {"ok": ok, "total": len(symbols)}


def base_price_symbols() -> list[str]:
    """Símbolos base: PRICE_SYMBOLS del entorno o el basket por defecto."""
    env = os.environ.get("PRICE_SYMBOLS", "")
    raw = env.split(",") if env else list(PRICE_SYMBOLS)
    return [symbol.strip() for symbol in raw if symbol.strip()]


def collect_price_symbols(db) -> tuple[list[str], int]:
    """Símbolos base + tenencias de usuarios (si el flag está encendido).

    Devuelve (símbolos sin duplicados, cuántos se agregaron por user_holdings).
    """
    base = base_price_symbols()
    merged = merge_price_symbols(base, [])
    if not user_holdings_prices_enabled() or db is None:
        return merged, 0
    user_symbols = symbols_from_user_holdings(db)
    merged = merge_price_symbols(base, user_symbols)
    base_set = set(merge_price_symbols(base, []))
    added = sum(1 for symbol in merged if symbol not in base_set)
    return merged, added


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Download EOD prices from Yahoo Finance")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only show how many prices would be downloaded per symbol "
        "(count + first/last), without writing to the database.",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=365,
        help="días de historia a descargar de Yahoo (default 365; 730 = 2 años)",
    )
    parser.add_argument("--no-holdings", action="store_true", help="No sumar simbolos de la tabla holdings")
    parser.add_argument("--limit", type=int, default=0, help="Solo los primeros N simbolos (pruebas)")
    args = parser.parse_args()

    from base import get_db

    db = None
    if not args.dry_run:
        db = get_db()
    elif user_holdings_prices_enabled():
        # Dry-run: solo lectura para contar símbolos; nunca escribe.
        try:
            db = get_db()
        except Exception as e:  # noqa: BLE001 - el dry-run sigue con la base
            print(f"WARNING user_holdings: {e}")

    symbols, added = collect_price_symbols(db)
    if user_holdings_prices_enabled():
        print(
            f"DRY-RUN user_holdings: {added} symbols would be added "
            f"({len(symbols)} total)"
            if args.dry_run
            else f"user_holdings: {added} symbols added ({len(symbols)} total)"
        )
    aliases: dict[str, str] = {}
    if db is None and args.dry_run and not args.no_holdings:
        try:
            db = get_db()  # dry-run: solo lectura de holdings
        except (Exception, SystemExit) as e:  # noqa: BLE001 - sin credenciales sigue
            print(f"WARNING holdings: {e}")
    if db is not None and not args.no_holdings:
        mapping = symbols_from_portfolio_holdings(db)
        have = set(symbols)
        extra = [s for s in mapping if s not in have]
        # Se guarda con el simbolo de holdings (lo que busca compute_returns),
        # pero se baja de Yahoo con el sufijo correcto.
        aliases = {s: mapping[s] for s in extra if mapping[s] != s}
        symbols = symbols + extra
        print(f"holdings: {len(extra)} symbols added ({len(symbols)} total, {len(aliases)} con sufijo)")
    if args.limit:
        symbols = symbols[: args.limit]
    refresh_all(db, symbols, dry_run=args.dry_run, days=args.days, aliases=aliases)


if __name__ == "__main__":
    main()
