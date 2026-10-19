"""
Trump dice — portafolio simulado de dichos de Donald Trump (F8).

Regla: compra simulada de US$1.000 al cierre cada vez que Trump llama a
comprar o elogia directamente una acción cotizada. Cada mención se guarda en
public.mentions (cita textual + fuente) y genera una alerta type='mention'.

Lógica pura (testeable sin red, ver scrapers/tests/test_trump_dice.py):
    build_trump_dice(menciones, precios, monto=1000) -> pesos que suman 100

Fuentes:
    - scrapers/data/trump_dice_menciones.json: 15 menciones verificadas,
      cada una con cita y al menos una URL (fuente de verdad; no se inventan
      menciones).
    - Precios: cierres ajustados de Yahoo Finance (mismo método que
      benchmarks.py). U.S. Steel (X) deslistada: cash_out a US$55 desde
      2025-06-18 (compra de Nippon Steel) -> holding 'USD-CASH' (cash).

Detección de candidatas (--detectar): marca posts públicos como 'pendiente'
(canditados a revisión manual). Las 'pendiente' NUNCA generan alerta ni
holdings: se revisan a mano y se pasan a 'verificada' en el JSON.

IMPORTANTE: es información, no recomendación. Ver /metodologia.

Uso (NO ejecutar contra la base real desde agentes):
    python trump_dice.py --dry-run     # imprime pesos y menciones nuevas
    python trump_dice.py --detectar    # agrega candidatas pendiente
    python trump_dice.py               # upserta en Supabase (requiere env vars)
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

from base import Holding, SourceAdapter, get_db, log

TRUMP_DICE_SLUG = "trump-dice"
DATA_PATH = Path(__file__).parent / "data" / "trump_dice_menciones.json"
MONTO_DEFAULT = 1000.0

# U.S. Steel (X) deslistada: Nippon pagó US$55 en efectivo el 2025-06-18.
# La posición queda valorizada a ese precio (cash-out).
CASH_OUT: dict[str, tuple[float, str]] = {
    "X": (55.0, "2025-06-18"),
}
CASH_SYMBOL = "USD-CASH"

# Yahoo Finance por símbolo (mismo endpoint que prices.py).
YAHOO_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"

KINDS = {
    "compra_directa",
    "compra_directa_mercado",
    "elogio",
    "elogio_accion",
    "elogio_con_ticker",
    "elogio_producto",
    "elogio_acuerdo",
}


def load_menciones(path: Path = DATA_PATH) -> list[dict]:
    """Lee el JSON de menciones y valida el mínimo exigido a cada una."""
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    return validate_menciones(data.get("menciones", []))


def validate_menciones(menciones: list[dict]) -> list[dict]:
    """Rechaza menciones sin id, fecha de entrada, ticker, cita o fuente."""
    validas: list[dict] = []
    for m in menciones:
        mid = str(m.get("id") or "").strip()
        if not mid:
            raise ValueError("mención sin id")
        for campo in ("entrada", "ticker", "cita"):
            if not str(m.get(campo) or "").strip():
                raise ValueError(f"{mid}: falta {campo}")
        fuentes = m.get("fuentes") or []
        urls = [u for u in fuentes if str(u).startswith(("http://", "https://"))]
        if not urls:
            raise ValueError(f"{mid}: sin source_urls (no se aceptan menciones sin fuente)")
        kind = str(m.get("tipo") or "").strip()
        if kind not in KINDS:
            raise ValueError(f"{mid}: tipo desconocido {kind!r}")
        validas.append(m)
    return validas


# ---------------------------------------------------------------------------
# Lógica pura: simulación de compras y pesos
# ---------------------------------------------------------------------------

def _parse_day(value: str) -> date:
    return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()


def next_trading_day(prices: dict[str, dict[str, float]], symbol: str, day: date) -> date | None:
    """Primer día con precio de `symbol` en o después de `day` (día hábil)."""
    series = prices.get(symbol) or {}
    if not series:
        return None
    current = day
    for _ in range(10):  # máximo 10 días de búsqueda (feriados largos)
        key = current.isoformat()
        if key in series:
            return current
        current += timedelta(days=1)
    return None


def entry_price(prices: dict[str, dict[str, float]], m: dict) -> tuple[date, float] | None:
    """(fecha, precio) de entrada de una mención, o None si no hay precio."""
    ticker = m["ticker"]
    if ticker in CASH_OUT:
        cash_price, cash_date = CASH_OUT[ticker]
        entry = _parse_day(m["entrada"])
        return (max(entry, _parse_day(cash_date)), cash_price)
    day = next_trading_day(prices, ticker, _parse_day(m["entrada"]))
    if day is None:
        return None
    return (day, float(prices[ticker][day.isoformat()]))


def build_trump_dice(
    menciones: list[dict],
    prices: dict[str, dict[str, float]],
    monto: float = MONTO_DEFAULT,
    as_of: date | None = None,
    skip_kinds: set[str] | None = None,
    skip_symbols: set[str] | None = None,
    equal_weight: bool = False,
) -> list[dict]:
    """
    Simulación pura: unidades = monto / cierre de entrada; valor actual =
    unidades x último cierre; peso por ticker = valor / total x 100 (2 dec.).

    menciones: lista validada del JSON (solo las 'verificada' cuentan).
    prices: {ticker: {iso_date: close}}; los tickers con cash_out se valorizan
    a su precio fijo. Devuelve filas [{symbol, name, weight, units, value,
    asset_class, entry_date}] ordenadas por peso descendente, suman ~100.

    skip_kinds, skip_symbols y equal_weight son la extensión de F11. Con los
    valores por defecto la simulación de Trump no cambia. equal_weight reparte
    100 entre las menciones que quedan, sin mirar precios (un cupo por mención).
    """
    hoy = as_of or date.today()
    units_by_symbol: dict[str, float] = defaultdict(float)
    names: dict[str, str] = {}
    last_price: dict[str, float] = {}
    blocked_kinds = skip_kinds or set()
    blocked_symbols = skip_symbols or set()

    for m in menciones:
        if str(m.get("status") or "verificada") != "verificada":
            continue  # pendiente/descartada: ni holdings ni alertas
        if str(m.get("tipo") or "") in blocked_kinds:
            continue
        symbol = m["ticker"]
        if symbol in blocked_symbols:
            continue
        if equal_weight:
            units_by_symbol[symbol] += 1.0
            names.setdefault(symbol, m.get("empresa") or symbol)
            last_price[symbol] = 1.0
            continue
        entry = entry_price(prices, m)
        if entry is None:
            log(f"[trump_dice] WARNING {m['id']}: sin precio de entrada para {symbol}")
            continue
        day, price = entry
        if price <= 0:
            continue
        units = monto / price
        if symbol in CASH_OUT:
            symbol = CASH_SYMBOL  # X deslistada -> efectivo
        units_by_symbol[symbol] += units
        names.setdefault(symbol, m.get("empresa") or symbol)
        if m["ticker"] in CASH_OUT:
            # Cash-out: la posición queda valorizada al precio fijo (US$55).
            last_price[symbol] = CASH_OUT[m["ticker"]][0]
        else:
            serie = prices.get(m["ticker"]) or {}
            up_to = {d: p for d, p in serie.items() if d <= hoy.isoformat()}
            if up_to:
                last_day = max(up_to)
                last_price[symbol] = float(up_to[last_day])

    if not units_by_symbol:
        return []

    values = {s: units * last_price.get(s, 0.0) for s, units in units_by_symbol.items()}
    total = sum(values.values())
    if total <= 0:
        return []

    rows: list[dict] = []
    assigned = 0.0
    ordered = sorted(values.items(), key=lambda kv: (-kv[1], kv[0]))
    for i, (symbol, value) in enumerate(ordered):
        if i == len(ordered) - 1:
            # Última fila absorbe el redondeo para que sume 100 exacto.
            weight = round(100.0 - assigned, 2)
        else:
            weight = round(value / total * 100.0, 2)
            assigned += weight
        asset_class = "cash" if symbol == CASH_SYMBOL else ("etf" if symbol == "SPY" else "equity")
        rows.append({
            "symbol": symbol,
            "name": names.get(symbol, symbol),
            "weight": weight,
            "units": round(units_by_symbol[symbol], 6),
            "value": round(value, 2),
            "asset_class": asset_class,
            "entry_date": min(
                (str(m.get("entrada") or "") for m in menciones
                 if (CASH_SYMBOL if m["ticker"] in CASH_OUT else m["ticker"]) == symbol and m.get("entrada")),
                default="",
            ),
        })
    return rows


def fetch_prices_yahoo(symbols: list[str], start: str) -> dict[str, dict[str, float]]:
    """Cierres ajustados de Yahoo (mismo endpoint que prices.py). Sin red en tests."""
    import time as _time

    import httpx

    prices: dict[str, dict[str, float]] = {}
    for symbol in symbols:
        try:
            resp = httpx.get(
                YAHOO_URL.format(symbol=symbol),
                params={"range": "730d", "interval": "1d", "events": "div,splits"},
                headers={"User-Agent": USER_AGENT},
                timeout=30.0,
                follow_redirects=True,
            )
            resp.raise_for_status()
            result = resp.json()["chart"]["result"][0]
            stamps = result.get("timestamp") or []
            closes = result["indicators"]["quote"][0].get("close") or []
            serie: dict[str, float] = {}
            for ts, close in zip(stamps, closes):
                if close is None:
                    continue
                day = datetime.fromtimestamp(ts).date().isoformat()
                if day >= start:
                    serie[day] = float(close)
            if serie:
                prices[symbol] = dict(sorted(serie.items()))
        except Exception as e:  # noqa: BLE001 — un símbolo caído no tumba la corrida
            log(f"[trump_dice] WARNING precio {symbol}: {e}")
        _time.sleep(0.5)
    return prices


# ---------------------------------------------------------------------------
# Adapter
# ---------------------------------------------------------------------------

class TrumpDiceAdapter(SourceAdapter):
    """Adapter del portafolio 'Trump dice' (source trump_mentions)."""

    name = "trump_dice"
    portfolio_slug = TRUMP_DICE_SLUG

    def __init__(self, dry_run: bool = False, data_path: Path = DATA_PATH) -> None:
        super().__init__(dry_run=dry_run)
        self.data_path = data_path

    def fetch_raw(self) -> dict:
        """Lee menciones + precios de cierre desde la primera fecha de entrada."""
        menciones = load_menciones(self.data_path)
        fechas = [str(m.get("entrada") or m.get("fecha") or "") for m in menciones]
        fechas = [f for f in fechas if f]
        start = min(fechas)[:10] if fechas else "2025-01-01"
        tickers = sorted({m["ticker"] for m in menciones if m["ticker"] not in CASH_OUT})
        prices = fetch_prices_yahoo(tickers, start) if tickers else {}
        return {"menciones": menciones, "prices": prices, "start": start}

    def normalize(self, raw: dict) -> list[Holding]:
        rows = build_trump_dice(raw["menciones"], raw["prices"])
        today = date.today()
        return [
            Holding(
                symbol=row["symbol"],
                name=row["name"],
                weight=row["weight"],
                asset_class=row["asset_class"],
                currency="USD",
                as_of=today,
            )
            for row in rows
        ]


# ---------------------------------------------------------------------------
# Alertas de mención + candidatas pendientes
# ---------------------------------------------------------------------------

def _quote_corta(quote: str, max_len: int = 80) -> str:
    quote = " ".join(str(quote).split())
    if len(quote) <= max_len:
        return quote
    return quote[: max_len - 1].rstrip() + "…"


def mention_row(portfolio_id: str, m: dict, speaker: str = "Donald Trump") -> dict:
    """Fila para public.mentions a partir de una mención del JSON."""
    hora = str(m.get("hora_et") or "")
    fecha = str(m.get("fecha") or m["entrada"])
    # Sin hora confirmada se usa mediodía ET (16:00 UTC) como referencia.
    said_at = f"{fecha}T16:00:00+00:00"
    if "09:" in hora or "10:" in hora or "11:" in hora:
        said_at = f"{fecha}T{hora[:5]}:00-04:00"
    elif "17:" in hora or "18:" in hora:
        said_at = f"{fecha}T{hora[:5]}:00-04:00"
    return {
        "portfolio_id": portfolio_id,
        "speaker": speaker,
        "said_at": said_at,
        "entry_date": str(m["entrada"])[:10],
        "symbol": m["ticker"],
        "company": m.get("empresa"),
        "kind": m.get("tipo"),
        "channel": m.get("canal"),
        "quote": m["cita"],
        "source_urls": [u for u in m.get("fuentes", []) if str(u).startswith("http")],
        "status": str(m.get("status") or "verificada"),
        "external_id": m["id"],
    }


def _alert_prefix(speaker: str) -> str:
    """Trump conserva el título de F8. Otro speaker usa «Nombre dice»."""
    if speaker == "Donald Trump":
        return "Trump dice"
    return f"{speaker} dice"


def mention_alert(portfolio_id: str, m: dict, speaker: str = "Donald Trump") -> dict:
    """Alerta type='mention' para una mención verificada."""
    kind = str(m.get("tipo") or "")
    urls = [u for u in m.get("fuentes", []) if str(u).startswith("http")]
    return {
        "portfolio_id": portfolio_id,
        "type": "mention",
        "severity": "high" if kind.startswith("compra_directa") else "medium",
        "title": f'{_alert_prefix(speaker)}: {m["ticker"]} — "{_quote_corta(m["cita"])}"',
        "summary": None,
        "payload": {
            "symbol": m["ticker"],
            "company": m.get("empresa"),
            "quote": m["cita"],
            "said_at": str(m.get("fecha") or m["entrada"]),
            "entry_date": str(m["entrada"])[:10],
            "channel": m.get("canal"),
            "kind": kind,
            "source_urls": urls,
            "source_url": urls[0] if urls else None,
            "speaker": speaker,
        },
        "is_published": True,  # ya está verificada a mano (con fuente)
    }


def sync_mentions(
    db,
    menciones: list[dict],
    dry_run: bool = False,
    *,
    speaker: str = "Donald Trump",
    slug: str | None = None,
    skip_alert_kinds: set[str] | None = None,
    log_name: str = "trump_dice",
) -> dict:
    """
    Inserta en public.mentions las menciones verificadas que no existan
    (match por external_id) y crea UNA alerta 'mention' por cada una nueva.
    Las 'pendiente' nunca se insertan ni generan alerta.
    skip_alert_kinds (F11): la fila se guarda, pero ese tipo no alerta.
    Con los valores por defecto el comportamiento de Trump no cambia.
    """
    result = {"insertadas": 0, "alertas": 0, "omitidas": 0}
    portfolio_slug = slug or TRUMP_DICE_SLUG
    blocked_alerts = skip_alert_kinds or set()
    if dry_run or db is None:
        existing: set[str] = set()
    else:
        rows = db.table("mentions").select("external_id").execute()
        existing = {(r.get("external_id") or "") for r in (rows.data or [])}

    pf = None
    if db is not None and not dry_run:
        pfr = db.table("portfolios").select("id").eq("slug", portfolio_slug).maybe_single().execute()
        pf = (pfr.data or {}).get("id") if pfr.data else None
    portfolio_id = pf or "dry-run"

    for m in menciones:
        status = str(m.get("status") or "verificada")
        if status != "verificada":
            result["omitidas"] += 1
            continue
        if m["id"] in existing:
            continue
        kind = str(m.get("tipo") or "")
        row = mention_row(portfolio_id, m, speaker)
        alert = None if kind in blocked_alerts else mention_alert(portfolio_id, m, speaker)
        if dry_run or db is None:
            if alert is None:
                log(f"[{log_name}] DRY-RUN mención {m['id']} {m['ticker']}: sin alerta ({kind})")
            else:
                log(f"[{log_name}] DRY-RUN mención {m['id']} {m['ticker']}: {alert['title']}")
        else:
            if portfolio_id == "dry-run" or portfolio_id is None:
                log(f"[{log_name}] ERROR: portfolio {portfolio_slug} no existe en DB")
                return result
            db.table("mentions").insert(row).execute()
            if alert is not None:
                db.table("alerts").insert(alert).execute()
        result["insertadas"] += 1
        if alert is not None:
            result["alertas"] += 1
    return result


def detectar_candidatas(limit: int = 50) -> list[dict]:
    """
    Lee el feed público de trumpstruth.org (RSS) y marca como 'pendiente' los
    posts que contengan un ticker entre paréntesis o con $, o 'buy' junto al
    nombre de una empresa del catálogo. NUNCA se insertan: quedan como
    candidatas impresas para revisión manual (luego se pasan a 'verificada'
    en el JSON, con su fuente).
    """
    import re

    import httpx

    candidatas: list[dict] = []
    try:
        resp = httpx.get(
            "https://www.trumpstruth.org/feed",
            headers={"User-Agent": USER_AGENT},
            timeout=30.0,
            follow_redirects=True,
        )
        resp.raise_for_status()
        items = re.findall(r"<title>(.*?)</title>", resp.text, flags=re.S)[1:]
    except Exception as e:  # noqa: BLE001 — la detección es best-effort
        log(f"[trump_dice] WARNING detectar: feed no disponible ({e})")
        return candidatas

    patron = re.compile(r"\(([A-Z]{1,5})\)|\$([A-Z]{1,5})\b")
    for item in items[:limit]:
        texto = item.strip()
        match = patron.search(texto)
        if not match:
            continue
        ticker = (match.group(1) or match.group(2) or "").upper()
        candidatas.append({
            "ticker": ticker,
            "texto": texto,
            "status": "pendiente",
            "nota": "candidata: revisar a mano y agregar al JSON con fuente si aplica",
        })
        log(f"[trump_dice] candidata pendiente: {ticker} — {texto[:80]}")
    return candidatas


def main() -> None:
    parser = argparse.ArgumentParser(description="Trump dice — menciones verificadas")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Imprime pesos y menciones nuevas sin escribir en la base",
    )
    parser.add_argument(
        "--detectar",
        action="store_true",
        help="Marca candidatas 'pendiente' desde el feed público (no inserta nada)",
    )
    args = parser.parse_args()

    adapter = TrumpDiceAdapter(dry_run=args.dry_run)
    raw = adapter.fetch_raw()
    rows = build_trump_dice(raw["menciones"], raw["prices"])

    print(f"Trump dice — {len(rows)} posiciones (corte {date.today().isoformat()}):")
    for row in rows:
        print(
            f"  {row['symbol']:<10} {row['weight']:6.2f}%  "
            f"{row['asset_class']:<5} valor=US${row['value']:,.2f}  entrada={row['entry_date']}"
        )
    total = sum(r["weight"] for r in rows)
    print(f"  total pesos: {total:.2f}%")

    if args.detectar:
        detectar_candidatas()

    if args.dry_run:
        resumen = sync_mentions(None, raw["menciones"], dry_run=True)
        print(
            f"(dry-run: no se escribió nada; menciones nuevas: {resumen['insertadas']}, "
            f"alertas: {resumen['alertas']}, omitidas por estado: {resumen['omitidas']})"
        )
        return

    db = get_db()
    summary = adapter.run(db)
    log(f"[trump_dice] holdings: {summary}")
    resumen = sync_mentions(db, raw["menciones"], dry_run=False)
    log(f"[trump_dice] menciones: {resumen}")


if __name__ == "__main__":
    main()
