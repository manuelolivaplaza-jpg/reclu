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
import re
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
SKIP_SYMBOLS = {"USD-CASH", "CASH"}
CURRENCIES = {"USD", "EUR", "CLP", "CLF", "BRL", "MXN", "JPY", "GBP", "CHF", "CAD", "AUD",
              "CNY", "HKD", "KRW", "TWD", "ARS", "COP", "PEN", "UF"}
CHILE_EXCHANGES = {"BCS", "SSE", "SN", "SANTIAGO"}
MEXICO_EXCHANGES = {"BMV", "MX", "MEX", "BIVA"}
BRAZIL_EXCHANGES = {"B3", "BVMF", "SA", "BOVESPA"}
# Bolsas asiaticas con codigo numerico: sufijo Yahoo.
ASIA_SUFFIX = {
    **{e: ".T" for e in JAPAN_EXCHANGES},
    "HK": ".HK", "HKEX": ".HK", "HKG": ".HK", "SEHK": ".HK",
    "KRX": ".KS", "KOSPI": ".KS", "KSE": ".KS", "KOSDAQ": ".KQ",
    "TWSE": ".TW", "TW": ".TW", "TPEX": ".TWO",
    "SZSE": ".SZ", "SHE": ".SZ", "SSE_CN": ".SS", "SHG": ".SS", "SHSE": ".SS",
}
BRAZIL_RE = re.compile(r"^[A-Z]{4}(3|4|5|6|11)$")
US_CLASS_RE = re.compile(r"^([A-Z]{1,5})[./]([A-Z])$")


def yahoo_symbol(symbol: str, exchange: str | None = None, currency: str | None = None) -> str:
    """Ticker de holdings -> ticker Yahoo; "" si no es cotizable o es ambiguo.

    Salta caja/monedas, nombres con espacios o minusculas (empresas escritas
    con nombre, slugs de Polymarket) y unidades /U. Mapea:
      Chile (BCS/CLP): AGUAS.A -> AGUAS-A.SN
      EE.UU. clases:   BRK.B -> BRK-B, TECK/B -> TECK-B
      Brasil:          PETR4 -> PETR4.SA (4 letras + 3/4/5/6/11)
      Mexico (BMV o '*' / CPO): WALMEX* -> WALMEX.MX
      Asia numerico segun bolsa (TSE .T, HK .HK, KRX .KS, TW .TW); sin
      bolsa: 4 digitos -> .T, 6 digitos 00/30 -> .SZ, 60/68 -> .SS.
    """
    raw = (symbol or "").strip()
    if not raw or " " in raw or raw != raw.upper():
        return ""
    clean = raw.upper()
    if clean in SKIP_SYMBOLS or clean in CURRENCIES or clean.endswith("-CASH") or clean.endswith("/U"):
        return ""
    if clean.startswith("^") or clean.endswith((".SN", ".SA", ".MX", ".T", ".HK", ".KS", ".KQ", ".TW", ".SS", ".SZ")):
        return clean
    ex = (exchange or "").strip().upper()
    cur = (currency or "").strip().upper()
    if ex in CHILE_EXCHANGES or cur == "CLP":
        return clean.replace(".", "-") + CHILE_SUFFIX
    if clean.isdigit():
        if ex in ASIA_SUFFIX:
            suf = ASIA_SUFFIX[ex]
            return (clean.zfill(4) if suf == ".HK" else clean) + suf
        if len(clean) == 4:
            return clean + ".T"
        if len(clean) == 6 and clean[:2] in ("00", "30"):
            return clean + ".SZ"
        if len(clean) == 6 and clean[:2] in ("60", "68"):
            return clean + ".SS"
        return ""  # codigo numerico sin bolsa conocida: ambiguo
    if ex in MEXICO_EXCHANGES or clean.endswith("*") or (clean.endswith("CPO") and len(clean) > 5):
        return clean.rstrip("*") + ".MX"
    if ex in BRAZIL_EXCHANGES or BRAZIL_RE.match(clean):
        return clean + ".SA"
    m = US_CLASS_RE.match(clean)
    if m:
        return f"{m.group(1)}-{m.group(2)}"
    if not re.fullmatch(r"[A-Z0-9\-]{1,10}", clean):
        return ""
    return clean


def portfolio_info(db, page: int = 1000) -> dict:
    """{portfolio_id: {"visible": bool, "country": str}} (solo lectura)."""
    out: dict = {}
    start = 0
    while True:
        rows = (
            db.table("portfolios").select("id, country, is_active, hidden_reason")
            .range(start, start + page - 1).execute().data or []
        )
        for r in rows:
            out[r.get("id")] = {
                "visible": bool(r.get("is_active", True)) and not r.get("hidden_reason"),
                "country": (r.get("country") or "").upper(),
            }
        if len(rows) < page:
            return out
        start += page


def symbols_from_portfolio_holdings(db, page: int = 1000, all_snapshots: bool = False,
                                    portfolios: dict | None = None) -> dict[str, str]:
    """{simbolo_en_holdings: simbolo_yahoo} de holdings (solo lectura, paginado).

    Por defecto solo el ultimo snapshot (max as_of) de cada portafolio.
    Orden de prioridad (para el tope --max-symbols):
      1) usado en algun portafolio visible (is_active y sin hidden_reason)
      2) mayor peso maximo dentro de un portafolio visible
      3) mas portafolios visibles, luego mas portafolios en total
    Asi un 13F/ETF con miles de posiciones chicas no desplaza a COLBUN o
    WALMEX* de un portafolio chileno/mexicano mostrado. El pais del
    portafolio (CL) sirve de pista para el sufijo .SN si falta la bolsa.
    """
    if portfolios is None:
        try:
            portfolios = portfolio_info(db, page)
        except Exception:  # noqa: BLE001 - sin tabla: todos visibles
            portfolios = {}
    rows_all: list[dict] = []
    start = 0
    while True:
        rows = (
            db.table("holdings").select("portfolio_id, as_of, symbol, exchange, currency, weight")
            .range(start, start + page - 1).execute().data or []
        )
        rows_all.extend(rows)
        if len(rows) < page:
            break
        start += page
    if not all_snapshots:
        latest: dict = {}
        for r in rows_all:
            pid, d = r.get("portfolio_id"), str(r.get("as_of") or "")
            if d > latest.get(pid, ""):
                latest[pid] = d
        rows_all = [r for r in rows_all if str(r.get("as_of") or "") == latest.get(r.get("portfolio_id"), "")]
    out: dict[str, str] = {}
    score: dict[str, list] = {}
    for r in rows_all:
        raw = (r.get("symbol") or "").strip()
        pid = r.get("portfolio_id")
        info = portfolios.get(pid, {"visible": True, "country": ""})
        cur = r.get("currency")
        if info["country"] == "CL" and not r.get("exchange") and (cur in (None, "", "USD")):
            cur = "CLP" if not raw.isdigit() and "." not in raw else cur
        ysym = yahoo_symbol(raw, r.get("exchange"), cur)
        if not ysym:
            continue
        out.setdefault(raw, ysym)
        sc = score.setdefault(raw, [0, 0.0, set(), set()])
        w = float(r.get("weight") or 0)
        if info["visible"]:
            sc[0] = 1
            sc[1] = max(sc[1], w)
            sc[2].add(pid)
        sc[3].add(pid)
    return dict(sorted(out.items(), key=lambda kv: (-score[kv[0]][0], -score[kv[0]][1],
                                                     -len(score[kv[0]][2]), -len(score[kv[0]][3]), kv[0])))


def estimate_rows(n_symbols: int, days: int) -> int:
    """Filas maximas en prices: Yahoo devuelve hasta `days` sesiones con range=Nd (730d = 730 filas)."""
    return int(n_symbols * max(1, days))


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
    parser.add_argument("--all-snapshots", action="store_true", help="Usar todos los snapshots de holdings (no solo el ultimo)")
    parser.add_argument("--max-symbols", type=int, default=int(os.environ.get("PRICES_MAX_SYMBOLS", "600")),
                        help="Tope de seguridad de simbolos (default 600, env PRICES_MAX_SYMBOLS; 0 = sin tope)")
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
        mapping = symbols_from_portfolio_holdings(db, all_snapshots=args.all_snapshots)
        have = set(symbols)
        extra = [s for s in mapping if s not in have]
        # Se guarda con el simbolo de holdings (lo que busca compute_returns),
        # pero se baja de Yahoo con el sufijo correcto.
        aliases = {s: mapping[s] for s in extra if mapping[s] != s}
        symbols = symbols + extra
        print(f"holdings: {len(extra)} symbols added ({len(symbols)} total, {len(aliases)} con sufijo)")
    if args.limit:
        symbols = symbols[: args.limit]
    if args.max_symbols and len(symbols) > args.max_symbols:
        print(f"WARNING tope: {len(symbols)} simbolos > --max-symbols {args.max_symbols}; "
              f"se dejan fuera {len(symbols) - args.max_symbols} (los usados por menos portafolios)")
        symbols = symbols[: args.max_symbols]
    print(f"ESTIMADO: {len(symbols)} simbolos x ~{estimate_rows(1, args.days)} sesiones = "
          f"~{estimate_rows(len(symbols), args.days):,} filas en prices"
          + (" (dry-run, nada se escribe)" if args.dry_run else ""))
    refresh_all(db, symbols, dry_run=args.dry_run, days=args.days, aliases=aliases)


if __name__ == "__main__":
    main()
