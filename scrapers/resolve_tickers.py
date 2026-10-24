"""Replace 13F issuer names stored in holdings.symbol with Yahoo tickers.

Rows were saved with the issuer name as the symbol (for example
'ABBOTT LABORATORIES' instead of 'ABT'). Yahoo price history needs the
ticker. Names that Yahoo does not match clearly are left unchanged.

Usage (from the scrapers directory):
    python resolve_tickers.py --dry-run --limit 50     # solo busca, no escribe
    python resolve_tickers.py                          # resuelve y actualiza
    python resolve_tickers.py --resume-file f.json     # reanuda (cache en disco)

Busca en lotes (--batch, default 25), con timeout corto y reintentos con
backoff; guarda el cache en --resume-file tras cada lote para que una
corrida cortada siga donde quedo. En choques de clave unica NO borra.

Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see base.get_db).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import time

import httpx

from holdings_merge import US_CLASS_RE, class_dot_target, plan_merges, render_sql, us_class_hyphen

SEARCH_URL = "https://query1.finance.yahoo.com/v1/finance/search"
USER_AGENT = "Mozilla/5.0"
# More than one quote so a foreign listing can lose to NYSE/NASDAQ.
QUOTES_COUNT = 10
REQUEST_DELAY_S = 0.3
PAGE_SIZE = 200  # paginas chicas: menos ReadTimeout en holdings grandes
DB_ATTEMPTS = 4  # reintentos de lectura a Supabase (backoff 1/2/4 s)

# NYQ/NMS/NGM/NCM are Yahoo's codes for NYSE and Nasdaq.
_US_EXCHANGES = {"NYQ", "NMS", "NGM", "NCM", "NYSE", "NASDAQ"}
_FILLER = {
    "INC",
    "INCORPORATED",
    "CORP",
    "CORPORATION",
    "CO",
    "COMPANY",
    "LTD",
    "LIMITED",
    "LLC",
    "LP",
    "PLC",
    "SA",
    "AG",
    "NV",
    "DEL",
    "NEW",
    "THE",
    "CLASS",
    "COM",
    "COMMON",
    "STOCK",
    "SHARES",
    "HLDG",
    "HLDGS",
    "HOLDINGS",
    "GROUP",
    "GRP",
    "ETF",
    "FUND",
    "TRUST",
    "SHS",
    "ADS",
}
# Common stock, or a single-letter class share such as BRK-B. Rejects
# preferred lines such as JPM-PM.
_TICKER_RE = re.compile(r"^[A-Z]{1,5}(?:[.\-][A-Z])?$")


def looks_like_name(symbol: str) -> bool:
    """True when the stored symbol is an issuer name, not a ticker.

    Real tickers are short and have no spaces. Names have a space or are
    longer than 6 characters.
    """
    text = symbol.strip()
    return " " in text or len(text) > 6


def _alnum(value: str) -> str:
    return "".join(ch for ch in value.upper() if ch.isalnum())


def _significant_tokens(name: str) -> list[str]:
    raw = "".join(ch if ch.isalnum() else " " for ch in name.upper()).split()
    return [token for token in raw if len(token) >= 2 and token not in _FILLER]


def _is_us_listing(quote: dict) -> bool:
    exchange = str(quote.get("exchange") or "").upper()
    display = str(quote.get("exchDisp") or "").upper()
    if exchange in _US_EXCHANGES or display in {"NYSE", "NASDAQ"}:
        return True
    return "NASDAQ" in display or display.startswith("NYSE")


def _name_matches(name: str, quote: dict) -> bool:
    """Require the issuer's first significant word to appear on the quote."""
    tokens = _significant_tokens(name)
    if not tokens:
        return False
    blob = _alnum(f"{quote.get('longname') or ''} {quote.get('shortname') or ''}")
    if not blob:
        return False
    return tokens[0] in blob


def pick_ticker(name: str, quotes: list[dict]) -> str | None:
    """Pick a US ticker from Yahoo search quotes, or None if it is unclear."""
    matches: list[tuple[str, str]] = []
    for quote in quotes:
        if not isinstance(quote, dict):
            continue
        quote_type = str(quote.get("quoteType") or "").upper()
        if quote_type not in {"EQUITY", "ETF"}:
            continue
        if not _is_us_listing(quote):
            continue
        symbol = str(quote.get("symbol") or "").strip().upper()
        if not _TICKER_RE.fullmatch(symbol):
            continue
        if symbol == name.strip().upper():
            continue
        if not _name_matches(name, quote):
            continue
        matches.append((quote_type, symbol))
    if not matches:
        return None
    for quote_type, symbol in matches:
        if quote_type == "EQUITY":
            return us_class_hyphen(symbol)
    return us_class_hyphen(matches[0][1])


SEARCH_TIMEOUT = httpx.Timeout(15.0, connect=5.0)
SEARCH_ATTEMPTS = 3


def _get_with_retry(params: dict, attempts: int = SEARCH_ATTEMPTS, sleep=time.sleep):
    """GET a la busqueda de Yahoo con reintentos (1/2/4 s) en timeouts, red, 429 y 5xx."""
    for i in range(attempts):
        try:
            resp = httpx.get(SEARCH_URL, params=params, headers={"User-Agent": USER_AGENT},
                             timeout=SEARCH_TIMEOUT, follow_redirects=True)
            if resp.status_code == 429 or resp.status_code >= 500:
                raise httpx.HTTPStatusError(f"HTTP {resp.status_code}", request=resp.request, response=resp)
            resp.raise_for_status()
            return resp
        except (httpx.TimeoutException, httpx.TransportError, httpx.HTTPStatusError) as exc:
            status = getattr(getattr(exc, "response", None), "status_code", None)
            if (status is not None and status < 500 and status != 429) or i == attempts - 1:
                raise
            sleep(2 ** i)
    raise RuntimeError("unreachable")


def fetch_quotes(name: str) -> list[dict]:
    """Search Yahoo Finance for an issuer name (timeout corto + reintentos)."""
    resp = _get_with_retry({"q": name, "quotesCount": QUOTES_COUNT})
    payload = resp.json()
    quotes = payload.get("quotes") if isinstance(payload, dict) else None
    if not isinstance(quotes, list):
        return []
    return [quote for quote in quotes if isinstance(quote, dict)]


def resolve_name(name: str, cache: dict[str, str | None]) -> str | None:
    """Resolve one issuer name, using the in-memory cache."""
    key = name.strip()
    if key in cache:
        return cache[key]
    ticker: str | None = None
    try:
        ticker = pick_ticker(key, fetch_quotes(key))
    except Exception as exc:  # noqa: BLE001 - no se cachea: se reintenta al reanudar
        print(f"WARNING {name}: {exc}")
        time.sleep(REQUEST_DELAY_S)
        return None
    cache[key] = ticker
    time.sleep(REQUEST_DELAY_S)
    return ticker


def _execute_with_retry(call, attempts: int = DB_ATTEMPTS, sleep=time.sleep):
    """Ejecuta una consulta a Supabase con reintentos y backoff en timeouts/red."""
    for i in range(attempts):
        try:
            return call()
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            if i == attempts - 1:
                raise
            print(f"WARNING lectura holdings: {type(exc).__name__}, reintento {i + 1}/{attempts - 1}")
            sleep(2 ** i)
    raise RuntimeError("unreachable")


def _fetch_paged(db, columns: str, symbol: str | None = None) -> list[dict]:
    """Read holdings in pages. Pass symbol to limit to one stored value."""
    rows: list[dict] = []
    start = 0
    while True:
        query = db.table("holdings").select(columns).order("id")
        if symbol is not None:
            query = query.eq("symbol", symbol)
        batch = _execute_with_retry(lambda q=query, a=start: q.range(a, a + PAGE_SIZE - 1).execute()).data or []
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            return rows
        start += PAGE_SIZE


def distinct_symbols(db) -> list[str]:
    """Every distinct holdings.symbol, in sorted order."""
    found: set[str] = set()
    for row in _fetch_paged(db, "symbol"):
        symbol = row.get("symbol")
        if isinstance(symbol, str) and symbol.strip():
            found.add(symbol)
    return sorted(found)


def _is_unique_violation(exc: BaseException) -> bool:
    text = str(exc).lower()
    return "23505" in text or "duplicate key" in text or "idx_holdings_unique" in text


#: Choques de clave única registrados en esta corrida (no se borra nada).
CONFLICTS: list[dict] = []


def apply_ticker(db, name: str, ticker: str) -> bool:
    """Set symbol to ticker on each row.

    On a unique-key conflict (the portfolio already has a row with that
    ticker and as_of) the row is NOT deleted: the update is skipped and the
    conflict is logged and added to CONFLICTS for the final summary.
    Returns True only when every row was updated.
    """
    rows = _fetch_paged(db, "id, portfolio_id", symbol=name)
    if not rows:
        print(f"WARNING {name}: sin filas para actualizar")
        return False
    ok = True
    for row in rows:
        row_id = row.get("id")
        if not row_id:
            ok = False
            print(f"WARNING {name}: fila sin id")
            continue
        try:
            db.table("holdings").update({"symbol": ticker}).eq("id", row_id).execute()
        except Exception as exc:  # noqa: BLE001 - keep going row by row
            ok = False
            if not _is_unique_violation(exc):
                print(f"WARNING {name} id={row_id}: {exc}")
                continue
            conflict = {
                "portfolio_id": row.get("portfolio_id"),
                "old_symbol": name,
                "ticker": ticker,
                "id": row_id,
            }
            CONFLICTS.append(conflict)
            print(
                f"CONFLICTO portfolio={conflict['portfolio_id']} simbolo={name!r} "
                f"ticker={ticker} id={row_id}: ya existe esa fila, se omite (no se borra)"
            )
    return ok


PLAN_COLUMNS = "id, portfolio_id, as_of, weight, symbol, currency, exchange"


def build_plan(db, names: list[str], cache: dict[str, str | None], symbols: list[str]) -> dict:
    """Plan de renombres + fusiones (solo lectura). Incluye clases con punto
    de EE.UU. (BRK.B -> BRK-B); las filas chilenas (CLP/BCS) no se tocan."""
    rows: list[dict] = []
    target_by_symbol: dict[str, str] = {}
    for name in names:
        ticker = cache.get(name.strip())
        if not ticker:
            continue
        target_by_symbol[name] = us_class_hyphen(ticker)
        rows.extend(_fetch_paged(db, PLAN_COLUMNS, symbol=name))
    for symbol in symbols:
        if symbol in target_by_symbol or not US_CLASS_RE.match(symbol.strip().upper()):
            continue
        rows.extend(r for r in _fetch_paged(db, PLAN_COLUMNS, symbol=symbol) if class_dot_target(r))

    def target_for(row: dict) -> str | None:
        return target_by_symbol.get(row.get("symbol")) or class_dot_target(row)

    tickers = sorted({t for t in (target_for(r) for r in rows) if t})
    existing: list[dict] = []
    for ticker in tickers:
        existing.extend(_fetch_paged(db, "id, portfolio_id, as_of, weight, symbol", symbol=ticker))
    return plan_merges(rows, existing, target_for)


def print_plan_counts(plan: dict) -> None:
    c = plan["counts"]
    print(f"PLAN filas={c['filas']} renombrar={c['renombrar']} fusionar={c['fusionar']} "
          f"(en fila existente {c['fusionar_en_existente']}, en fila renombrada {c['fusionar_en_renombrada']}) "
          f"omitidas={c['omitidas']}")


def conflicts_summary() -> str:
    """Resumen final de choques (uno por línea)."""
    if not CONFLICTS:
        return "Sin choques de clave única."
    lines = [f"{len(CONFLICTS)} choques de clave única omitidos (revisar a mano):"]
    for c in CONFLICTS:
        lines.append(f"  portfolio={c['portfolio_id']} simbolo={c['old_symbol']!r} ticker={c['ticker']} id={c['id']}")
    return "\n".join(lines)


def load_cache(path: str | None) -> dict[str, str | None]:
    if path and os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else {}
    return {}


def save_cache(path: str | None, cache: dict[str, str | None]) -> None:
    if not path:
        return
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(cache, fh, ensure_ascii=False, indent=0, sort_keys=True)
    os.replace(tmp, path)


APPLY_ERRORS: list[str] = []


def _safe_apply(applier, db, name: str, ticker: str) -> bool:
    """Aplica un nombre; un error de red tras los reintentos no corta la corrida
    (queda en APPLY_ERRORS y el nombre sigue en cache para la proxima)."""
    try:
        return applier(db, name, ticker)
    except Exception as exc:  # noqa: BLE001
        APPLY_ERRORS.append(name)
        print(f"WARNING aplicar {name} -> {ticker}: {type(exc).__name__}: {exc}")
        return False


def run(db, names: list[str], *, dry_run: bool, limit: int = 0, batch: int = 25,
        resume_file: str | None = None, resolver=None, applier=None) -> dict[str, int]:
    """Resuelve nombres en lotes; guarda cache tras cada lote (reanudable)."""
    resolver = resolver or resolve_name
    applier = applier or apply_ticker
    cache = load_cache(resume_file)
    pending = [n for n in names if n.strip() not in cache]
    if limit:
        pending = pending[:limit]
    print(f"{len(names)} nombres, {len(names) - len([n for n in names if n.strip() not in cache])} ya en cache, "
          f"{len(pending)} a buscar ahora" + (" (dry-run, no se escribe)" if dry_run else ""))
    stats = {"resolved": 0, "unmatched": 0, "applied": 0}
    for i in range(0, len(pending), max(1, batch)):
        chunk = pending[i:i + batch]
        for name in chunk:
            ticker = resolver(name, cache)
            save_cache(resume_file, cache)  # incremental: un corte no pierde lo resuelto
            if not ticker:
                stats["unmatched"] += 1
                print(f"WARNING {name}: sin match claro, se deja el nombre")
                continue
            stats["resolved"] += 1
            if dry_run:
                print(f"DRY-RUN {name} -> {ticker}")
            elif _safe_apply(applier, db, name, ticker):
                stats["applied"] += 1
                print(f"OK {name} -> {ticker}")
        save_cache(resume_file, cache)
        print(f"... lote {min(i + batch, len(pending))}/{len(pending)}")
    # Nombres ya resueltos en corridas anteriores que siguen en holdings.
    if not dry_run:
        for name in names:
            ticker = cache.get(name.strip())
            if ticker and name not in pending and _safe_apply(applier, db, name, ticker):
                stats["applied"] += 1
                print(f"OK (cache) {name} -> {ticker}")
    print(f"{stats['resolved']} resueltos, {stats['unmatched']} sin match, {stats['applied']} aplicados")
    if APPLY_ERRORS:
        print(f"{len(APPLY_ERRORS)} nombres no se pudieron aplicar (red); re-ejecutar para reintentar")
    print(conflicts_summary())
    return stats


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description="Resuelve nombres de emisores a tickers Yahoo")
    parser.add_argument("--dry-run", action="store_true", help="Solo busca en Yahoo; no actualiza holdings")
    parser.add_argument("--limit", type=int, default=0, help="Maximo de nombres a buscar en esta corrida")
    parser.add_argument("--batch", type=int, default=25, help="Nombres por lote (cache se guarda tras cada lote)")
    parser.add_argument("--resume-file", default="resolve_tickers_cache.json",
                        help="Cache JSON para reanudar ('' para desactivar)")
    parser.add_argument("--plan-sql", default=None,
                        help="Solo lectura: arma el plan de renombres/fusiones con el cache y lo "
                             "escribe como SQL revisable en esta ruta (no busca en Yahoo ni escribe en la DB)")
    args = parser.parse_args(argv)

    from base import get_db

    db = get_db()  # tambien en dry-run: solo lectura de holdings
    symbols = distinct_symbols(db)
    names = [symbol for symbol in symbols if looks_like_name(symbol)]
    if args.plan_sql:
        plan = build_plan(db, names, load_cache(args.resume_file or None), symbols)
        print_plan_counts(plan)
        with open(args.plan_sql, "w", encoding="utf-8") as fh:
            fh.write(render_sql(plan))
        print(f"SQL revisable: {args.plan_sql} (no se aplicó nada)")
        return
    run(db, names, dry_run=args.dry_run, limit=args.limit, batch=args.batch,
        resume_file=args.resume_file or None)
    if args.dry_run:
        print_plan_counts(build_plan(db, names, load_cache(args.resume_file or None), symbols))


if __name__ == "__main__":
    main()
