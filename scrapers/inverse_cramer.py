"""
Inverse Cramer (real) — lightning round de CNBC (F12).

Regla inversa: vender en corto lo que Jim Cramer recomienda comprar y comprar
lo que recomienda vender. Igual peso. La posición dura 30 días hábiles desde
el cierre del día hábil siguiente al artículo (sale ~18:55 ET, mercado cerrado).

No se descuenta el costo de pedir prestadas las acciones. Los cortos se
guardan con weight positivo: holdings.weight exige >= 0 (schema.sql). El lado
corto va en el nombre, con prefijo "Corto: ".

Cada pick guarda solo ticker, fecha, sentido, una cita de hasta 10 palabras y
el enlace. No se copia el artículo (copyright de CNBC).

El JSON curado (scrapers/data/cramer_picks.json) es la verificación manual:
sentido compra/venta + URL completa → status verificada. El parser de una cita
nueva deja el pick en pendiente si la frase no es inequívoca (hold, wait, o
sin buy/sell). Solo las verificadas generan alerta y posición.

Uso (no escribir en Supabase real desde un agente):
    python inverse_cramer.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

from base import Holding, SourceAdapter, get_db, log

SLUG = "inverse-cramer-real"
DATA_PATH = Path(__file__).parent / "data" / "cramer_picks.json"
SPEAKER = "Jim Cramer"
HORIZON_BUSINESS_DAYS = 30
MAX_QUOTE_WORDS = 10
# Corte de la simulación documentada (cramer_resultados). La semilla SQL usa
# este día. Una corrida posterior escribe holdings con as_of = hoy.
SEED_AS_OF = date(2026, 10, 16)

# RSS público de la sección Mad Money. Verificado 2026-10-19: trae los
# lightning round (el listado HTML de /mad-money/ también responde, pero el
# RSS es el que lista los enlaces). Si falla, se sigue solo con el JSON.
MAD_MONEY_RSS = (
    "https://search.cnbc.com/rs/search/combinedcms/view.xml"
    "?partnerId=wrss01&id=15838459"
)
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) reclu-scraper/1.0"

_ARTICLE_URL = re.compile(
    r"^https://www\.cnbc\.com/\d{4}/\d{2}/\d{2}/cramers-lightning-round-.+\.html$"
)
_LIGHTNING_URL = re.compile(
    r"https://www\.cnbc\.com/\d{4}/\d{2}/\d{2}/cramers-lightning-round-[^<\s\"']+\.html"
)

# Frases que alcanzan para verificar solas. "hold" y "wait" no están: son
# ambiguas y el pick queda pendiente.
_BUY_PHRASES = ("pull the trigger", "own it", "buyer", "buy")
_SELL_PHRASES = ("don't want to own", "dont want to own", "not going to", "sell")

# Feriados de NYSE que caen entre semana, 2026. No es un calendario eterno:
# alcanza para la ventana de estos picks (sep–oct 2026 incluye Labor Day).
NYSE_HOLIDAYS = frozenset({
    date(2026, 1, 1),
    date(2026, 1, 19),
    date(2026, 2, 16),
    date(2026, 4, 3),
    date(2026, 5, 25),
    date(2026, 6, 19),
    date(2026, 7, 3),
    date(2026, 9, 7),
    date(2026, 11, 26),
    date(2026, 12, 25),
})


def _parse_day(value: str) -> date:
    return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()


def is_business_day(day: date) -> bool:
    return day.weekday() < 5 and day not in NYSE_HOLIDAYS


def next_business_day(day: date) -> date:
    """Primer día hábil estrictamente posterior a `day`."""
    current = day + timedelta(days=1)
    while not is_business_day(current):
        current += timedelta(days=1)
    return current


def add_business_days(start: date, n: int) -> date:
    """`n` días hábiles después de `start` (start no cuenta)."""
    if n < 0:
        raise ValueError("n debe ser >= 0")
    current = start
    left = n
    while left > 0:
        current += timedelta(days=1)
        if is_business_day(current):
            left -= 1
    return current


def entry_date_for(said_on: date) -> date:
    """El artículo sale con el mercado cerrado: se entra al cierre siguiente."""
    return next_business_day(said_on)


def position_is_open(entry: date, as_of: date, horizon: int = HORIZON_BUSINESS_DAYS) -> bool:
    """Abierta desde el día de entrada inclusive hasta entrada + `horizon` hábiles."""
    if as_of < entry:
        return False
    return as_of <= add_business_days(entry, horizon)


def quote_word_count(quote: str) -> int:
    return len(re.findall(r"\S+", str(quote).strip()))


def is_article_url(url: str) -> bool:
    return bool(_ARTICLE_URL.match(str(url).strip()))


def _normalize_quote(quote: str) -> str:
    text = str(quote).replace("’", "'").replace("‘", "'")
    return " ".join(text.lower().split())


def _has_phrase(text: str, phrase: str) -> bool:
    if " " in phrase or "'" in phrase:
        return phrase in text
    return re.search(rf"\b{re.escape(phrase)}\b", text) is not None


def classify_quote(quote: str) -> str:
    """compra, venta o pendiente. Si matchean los dos lados, queda pendiente."""
    text = _normalize_quote(quote)
    if not text:
        return "pendiente"
    sell = any(_has_phrase(text, phrase) for phrase in _SELL_PHRASES)
    buy = any(_has_phrase(text, phrase) for phrase in _BUY_PHRASES)
    if sell and buy:
        return "pendiente"
    if sell:
        return "venta"
    if buy:
        return "compra"
    return "pendiente"


def reclu_side(sentido: str) -> str:
    """Lado de Reclu. Cramer compra → corto. Cramer vende → compra."""
    if sentido == "compra":
        return "corto"
    if sentido == "venta":
        return "compra"
    raise ValueError(f"sentido no invertible: {sentido!r}")


def kind_for(sentido: str) -> str:
    if sentido == "compra":
        return "recomienda_compra"
    if sentido == "venta":
        return "recomienda_venta"
    raise ValueError(f"sentido sin kind: {sentido!r}")


def prepare_pick(raw: dict) -> dict | None:
    """
    Normaliza un pick del JSON.

    Se descarta (None) si la URL no es un artículo de lightning round o si la
    cita pasa de 10 palabras: no guardamos prosa de CNBC. Un status explícito
    `pendiente` se respeta y no genera alerta ni posición, aunque el sentido
    esté puesto. Sin status, un sentido compra/venta con URL y cita corta es
    la verificación manual del JSON.
    """
    fecha = str(raw.get("fecha") or "")[:10]
    ticker = str(raw.get("ticker") or "").strip().upper()
    quote = " ".join(str(raw.get("cita") or "").split())
    url = str(raw.get("url") or "").strip()
    if not fecha or not ticker or not quote:
        return None
    try:
        said_on = _parse_day(fecha)
    except ValueError:
        return None
    if quote_word_count(quote) > MAX_QUOTE_WORDS:
        return None
    if not is_article_url(url):
        return None

    sentido = str(raw.get("sentido") or "").strip()
    explicit = str(raw.get("status") or "").strip()
    if explicit == "descartada":
        return None
    if explicit == "pendiente" or sentido not in ("compra", "venta"):
        status = "pendiente"
        kind = None
        side = None
    else:
        status = "verificada"
        kind = kind_for(sentido)
        side = reclu_side(sentido)

    entry = entry_date_for(said_on)
    return {
        "fecha": said_on.isoformat(),
        "ticker": ticker,
        "sentido": sentido if sentido in ("compra", "venta") else None,
        "cita": quote,
        "url": url,
        "status": status,
        "kind": kind,
        "side": side,
        "entry_date": entry.isoformat(),
        "said_at": f"{said_on.isoformat()}T22:55:00+00:00",
        "external_id": f"{said_on.isoformat()}-{ticker}",
    }


def load_picks(path: Path = DATA_PATH) -> list[dict]:
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    picks: list[dict] = []
    for raw in data.get("picks", []):
        prepared = prepare_pick(raw)
        if prepared is not None:
            picks.append(prepared)
    return picks


def rss_candidates(urls: list[str], known_urls: set[str]) -> list[dict]:
    """
    Artículos del RSS que todavía no están en el JSON. Quedan pendiente y sin
    cita: no se lee el cuerpo (copyright) y no generan alerta ni posición.
    """
    found: list[dict] = []
    seen: set[str] = set()
    for url in urls:
        url = str(url).strip()
        if url in seen or url in known_urls or not is_article_url(url):
            continue
        seen.add(url)
        found.append({"url": url, "status": "pendiente", "ticker": None, "cita": None})
    return found


def _equal_weights(n: int) -> list[float]:
    if n <= 0:
        return []
    assigned = 0.0
    weights: list[float] = []
    for i in range(n):
        if i == n - 1:
            weights.append(round(100.0 - assigned, 2))
        else:
            weight = round(100.0 / n, 2)
            weights.append(weight)
            assigned += weight
    return weights


def build_positions(picks: list[dict], as_of: date) -> list[dict]:
    """
    Posiciones abiertas de picks verificados, igual peso, suma 100.

    Si el mismo ticker tiene un corto y una compra abiertos a la vez, se
    netea a cero y no entra (holdings es único por símbolo y día, y el peso
    no puede ser negativo). El nombre del corto lleva prefijo "Corto: ".
    """
    open_rows: list[dict] = []
    for pick in picks:
        if pick.get("status") != "verificada" or not pick.get("side"):
            continue
        entry = _parse_day(pick["entry_date"])
        if not position_is_open(entry, as_of):
            continue
        open_rows.append(pick)

    sides_by_symbol: dict[str, set[str]] = defaultdict(set)
    for pick in open_rows:
        sides_by_symbol[pick["ticker"]].add(pick["side"])

    kept: list[dict] = []
    seen: set[str] = set()
    for pick in open_rows:
        ticker = pick["ticker"]
        if sides_by_symbol[ticker] == {"corto", "compra"}:
            continue
        if ticker in seen:
            continue
        seen.add(ticker)
        kept.append(pick)

    kept.sort(key=lambda pick: pick["ticker"])
    weights = _equal_weights(len(kept))
    rows: list[dict] = []
    for pick, weight in zip(kept, weights):
        ticker = pick["ticker"]
        name = f"Corto: {ticker}" if pick["side"] == "corto" else ticker
        rows.append({
            "symbol": ticker,
            "name": name,
            "weight": weight,
            "side": pick["side"],
            "asset_class": "equity",
            "currency": "USD",
            "entry_date": pick["entry_date"],
        })
    return rows


def mention_row(portfolio_id: str, pick: dict) -> dict:
    return {
        "portfolio_id": portfolio_id,
        "speaker": SPEAKER,
        "said_at": pick["said_at"],
        "entry_date": pick["entry_date"],
        "symbol": pick["ticker"],
        "company": None,
        "kind": pick["kind"],
        "channel": "CNBC Mad Money — Lightning Round",
        "quote": pick["cita"],
        "source_urls": [pick["url"]],
        "status": pick["status"],
        "external_id": pick["external_id"],
    }


def mention_alert(portfolio_id: str, pick: dict) -> dict:
    """Alerta type=mention. Solo tiene sentido para un pick verificado."""
    side = pick["side"]
    ticker = pick["ticker"]
    verb = "corto" if side == "corto" else "compra"
    return {
        "portfolio_id": portfolio_id,
        "type": "mention",
        "severity": "medium",
        "title": f"Inverse Cramer: {verb} {ticker}",
        "summary": None,
        "payload": {
            "symbol": ticker,
            "quote": pick["cita"],
            "said_at": pick["said_at"],
            "side": side,
            "source_url": pick["url"],
        },
        "is_published": True,
    }


def alerts_for(picks: list[dict], portfolio_id: str = "dry-run") -> list[dict]:
    """Una alerta por pick verificado. Un pendiente no entra."""
    alerts: list[dict] = []
    for pick in picks:
        if pick.get("status") != "verificada" or not pick.get("side"):
            continue
        if quote_word_count(pick.get("cita") or "") > MAX_QUOTE_WORDS:
            continue
        alerts.append(mention_alert(portfolio_id, pick))
    return alerts


def sync_mentions(db, picks: list[dict], dry_run: bool = False) -> dict:
    """
    Inserta menciones verificadas que no existan (external_id) y una alerta
    mention por cada una nueva. Las pendiente no se insertan ni alertan.
    """
    result = {"insertadas": 0, "alertas": 0, "omitidas": 0}
    if dry_run or db is None:
        existing: set[str] = set()
    else:
        rows = db.table("mentions").select("external_id").execute()
        existing = {(row.get("external_id") or "") for row in (rows.data or [])}

    portfolio_id = "dry-run"
    if db is not None and not dry_run:
        found = (
            db.table("portfolios").select("id").eq("slug", SLUG).maybe_single().execute()
        )
        portfolio_id = (found.data or {}).get("id") if found.data else None

    for pick in picks:
        if pick.get("status") != "verificada":
            result["omitidas"] += 1
            continue
        if pick["external_id"] in existing:
            continue
        row = mention_row(portfolio_id or "dry-run", pick)
        alert = mention_alert(portfolio_id or "dry-run", pick)
        if dry_run or db is None:
            log(f"[inverse_cramer] DRY-RUN {pick['external_id']}: {alert['title']}")
        else:
            if not portfolio_id:
                log(f"[inverse_cramer] ERROR: portfolio {SLUG} no existe en DB")
                return result
            db.table("mentions").insert(row).execute()
            db.table("alerts").insert(alert).execute()
        result["insertadas"] += 1
        result["alertas"] += 1
    return result


def fetch_lightning_urls() -> list[str]:
    """Enlaces de lightning round en el RSS de Mad Money. Lista vacía si falla."""
    import httpx

    try:
        resp = httpx.get(
            MAD_MONEY_RSS,
            headers={"User-Agent": USER_AGENT},
            timeout=20.0,
            follow_redirects=True,
        )
        resp.raise_for_status()
    except Exception as exc:  # noqa: BLE001 — sin RSS se sigue con el JSON
        log(f"[inverse_cramer] WARNING RSS no disponible ({exc})")
        return []
    urls: list[str] = []
    seen: set[str] = set()
    for match in _LIGHTNING_URL.findall(resp.text):
        if match not in seen:
            seen.add(match)
            urls.append(match)
    return urls


class InverseCramerAdapter(SourceAdapter):
    """Adapter de inverse-cramer-real (source cnbc_lightning_round)."""

    name = "inverse_cramer"
    portfolio_slug = SLUG

    def __init__(self, dry_run: bool = False, data_path: Path = DATA_PATH) -> None:
        super().__init__(dry_run=dry_run)
        self.data_path = data_path

    def fetch_raw(self) -> dict:
        picks = load_picks(self.data_path)
        urls = fetch_lightning_urls()
        known = {pick["url"] for pick in picks}
        nuevos = rss_candidates(urls, known)
        for candidate in nuevos:
            log(f"[inverse_cramer] pendiente sin cita (no se inserta): {candidate['url']}")
        return {"picks": picks, "rss_urls": urls, "nuevos": nuevos}

    def normalize(self, raw: dict) -> list[Holding]:
        rows = build_positions(raw["picks"], date.today())
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


def _print_book(picks: list[dict], as_of: date) -> None:
    rows = build_positions(picks, as_of)
    print(f"Inverse Cramer (real) — {len(rows)} posiciones abiertas al {as_of.isoformat()}:")
    for row in rows:
        print(f"  {row['symbol']:<8} {row['weight']:6.2f}%  {row['name']}")
    total = sum(row["weight"] for row in rows)
    print(f"  total pesos: {total:.2f}%")


def main() -> None:
    parser = argparse.ArgumentParser(description="Inverse Cramer real — lightning round CNBC")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Imprime posiciones y alertas nuevas sin escribir en la base",
    )
    args = parser.parse_args()

    adapter = InverseCramerAdapter(dry_run=True)
    raw = adapter.fetch_raw()
    picks = raw["picks"]
    verified = [pick for pick in picks if pick["status"] == "verificada"]
    pending = [pick for pick in picks if pick["status"] == "pendiente"]
    print(
        f"picks en JSON usable: {len(picks)} "
        f"(verificadas {len(verified)}, pendiente {len(pending)}, "
        f"RSS nuevos sin cita: {len(raw['nuevos'])})"
    )
    _print_book(picks, SEED_AS_OF)
    if date.today() != SEED_AS_OF:
        _print_book(picks, date.today())

    if args.dry_run:
        resumen = sync_mentions(None, picks, dry_run=True)
        print(
            f"(dry-run: no se escribió nada; menciones nuevas: {resumen['insertadas']}, "
            f"alertas: {resumen['alertas']}, omitidas por estado: {resumen['omitidas']})"
        )
        return

    db = get_db()
    writer = InverseCramerAdapter(dry_run=False, data_path=adapter.data_path)
    summary = writer.run(db)
    log(f"[inverse_cramer] holdings: {summary}")
    resumen = sync_mentions(db, picks, dry_run=False)
    log(f"[inverse_cramer] menciones: {resumen}")


if __name__ == "__main__":
    main()
