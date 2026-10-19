"""
Elon Musk dice — menciones verificadas de @elonmusk (F11).

No es un portafolio de señales. Musk casi no nombra acciones de terceros.
Las tres que sí (ETSY, GME, CDR) se simulan; Tesla es empresa propia y solo
se muestra como contexto. Reutiliza la tabla public.mentions (migración 014)
y la lógica pura de trump_dice.build_trump_dice. No hay tabla nueva.

Regla de entrada (cierre de Nueva York, 16:00 ET):
    si el post salió antes del cierre en un día hábil, la entrada es ese día;
    si salió después del cierre, o en fin de semana, el día hábil siguiente.
Las cuatro filas verificadas calzan con esa regla (Tesla, 11:11 ET, entra
el mismo día: ya había abierto, pero todavía no había cerrado).

Detección (--detectar): posts con $TICKER o "buy" + nombre del catálogo
quedan 'pendiente'. Una pendiente no se inserta, no alerta y no es holding.
kind='empresa_propia' se guarda y se muestra, pero no alerta ni es holding.
CDR cotiza en PLN: solo mención. El check de currency no se toca.

Uso (NO ejecutar contra la base real desde agentes):
    python musk_dice.py --dry-run
    python musk_dice.py --detectar
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from base import Holding, SourceAdapter, get_db, log
from trump_dice import build_trump_dice, sync_mentions

MUSK_DICE_SLUG = "musk-dice"
SPEAKER = "Elon Musk"
DATA_PATH = Path(__file__).parent / "data" / "musk_menciones.json"

# Empresas propias: contexto, nunca señal. 'critica' entra en el check SQL
# por si una fila futura la usa; hoy Tesla se guarda como empresa_propia.
SKIP_ALERT_KINDS = {"empresa_propia"}
SKIP_HOLDING_KINDS = {"empresa_propia"}
# CDR.WA cotiza en PLN. currency no acepta PLN: no se crea el holding.
SKIP_HOLDING_SYMBOLS = {"CDR", "CDR.WA"}

EMPRESAS = {
    "ETSY": "Etsy",
    "GME": "GameStop",
    "CDR": "CD Projekt",
    "TSLA": "Tesla",
}

_TICKER_RE = re.compile(r"\$([A-Z]{1,5})\b")
_BUY_RE = re.compile(r"\bbuy\b", re.IGNORECASE)


def _nth_weekday(year: int, month: int, weekday: int, n: int) -> date:
    """weekday: lunes=0 … domingo=6. n empieza en 1."""
    first = date(year, month, 1)
    delta = (weekday - first.weekday()) % 7
    return date(year, month, 1 + delta + 7 * (n - 1))


def _us_offset(dt_utc: datetime) -> timedelta:
    """EDT (UTC-4) entre el 2.º domingo de marzo 07:00 UTC y el 1.er domingo de noviembre 06:00 UTC."""
    year = dt_utc.year
    start_day = _nth_weekday(year, 3, 6, 2)
    end_day = _nth_weekday(year, 11, 6, 1)
    start = datetime(start_day.year, start_day.month, start_day.day, 7, 0, tzinfo=timezone.utc)
    end = datetime(end_day.year, end_day.month, end_day.day, 6, 0, tzinfo=timezone.utc)
    if start <= dt_utc < end:
        return timedelta(hours=-4)
    return timedelta(hours=-5)


def _to_eastern(dt_utc: datetime) -> datetime:
    if dt_utc.tzinfo is None:
        dt_utc = dt_utc.replace(tzinfo=timezone.utc)
    else:
        dt_utc = dt_utc.astimezone(timezone.utc)
    return dt_utc.astimezone(timezone(_us_offset(dt_utc)))


def _next_weekday(day: date) -> date:
    nxt = day + timedelta(days=1)
    while nxt.weekday() >= 5:
        nxt += timedelta(days=1)
    return nxt


def entry_date_from_utc(utc_iso: str) -> date:
    """Día de entrada (cierre) a partir del timestamp UTC del post."""
    raw = str(utc_iso).strip().replace("Z", "+00:00")
    posted = _to_eastern(datetime.fromisoformat(raw))
    day = posted.date()
    close = posted.replace(hour=16, minute=0, second=0, microsecond=0)
    if posted >= close or day.weekday() >= 5:
        return _next_weekday(day)
    return day


def post_id_from_url(url: str) -> str:
    return url.rstrip("/").split("/")[-1]


def kind_for(raw: dict) -> str:
    """Tesla (y cualquier nota de empresa propia) no es un elogio de terceros."""
    nota = str(raw.get("nota") or "").lower()
    if "empresa propia" in nota:
        return "empresa_propia"
    return "elogio"


def to_mention(raw: dict) -> dict:
    """Normaliza una fila del JSON al formato que ya entiende trump_dice."""
    ticker = str(raw.get("ticker") or "").strip().upper()
    if not ticker:
        raise ValueError("mención sin ticker")
    texto = str(raw.get("texto") or "").strip()
    if not texto:
        raise ValueError(f"{ticker}: falta cita")
    utc = str(raw.get("utc") or "").strip()
    if not utc:
        raise ValueError(f"{ticker}: falta utc")
    url = str(raw.get("url") or "").strip()
    if not url.startswith(("https://x.com/", "https://twitter.com/")):
        raise ValueError(f"{ticker}: falta URL de X")
    external_id = post_id_from_url(url)
    if not external_id.isdigit():
        raise ValueError(f"{ticker}: el id del post no es numérico ({external_id})")
    entrada = entry_date_from_utc(utc)
    return {
        "id": external_id,
        "fecha": utc,
        "utc": utc,
        "entrada": entrada.isoformat(),
        "ticker": ticker,
        "empresa": EMPRESAS.get(ticker, ticker),
        "tipo": kind_for(raw),
        "canal": "X",
        "cita": texto,
        "status": "verificada",
        "fuentes": [url],
    }


def load_menciones(path: Path = DATA_PATH) -> list[dict]:
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    return [to_mention(raw) for raw in data.get("menciones", [])]


def build_musk_holdings(menciones: list[dict]) -> list[dict]:
    """ETSY y GME al 50%. Empresa propia y CDR (PLN) no entran."""
    return build_trump_dice(
        menciones,
        {},
        equal_weight=True,
        skip_kinds=SKIP_HOLDING_KINDS,
        skip_symbols=SKIP_HOLDING_SYMBOLS,
    )


def sync_musk_mentions(db, menciones: list[dict], dry_run: bool = False) -> dict:
    return sync_mentions(
        db,
        menciones,
        dry_run,
        speaker=SPEAKER,
        slug=MUSK_DICE_SLUG,
        skip_alert_kinds=SKIP_ALERT_KINDS,
        log_name="musk_dice",
    )


def detectar_candidatas(posts: list[dict], catalogo: list[str]) -> list[dict]:
    """
    Candidatas 'pendiente'. No se insertan.

    Entra un post si trae $TICKER o si dice "buy" y nombra una empresa del
    catálogo. El resto se ignora.
    """
    nombres = [n.strip() for n in catalogo if str(n).strip()]
    candidatas: list[dict] = []
    for post in posts:
        texto = str(post.get("text") or post.get("texto") or "")
        tickers = _TICKER_RE.findall(texto)
        empresas: list[str] = []
        if _BUY_RE.search(texto):
            for name in nombres:
                if re.search(rf"\b{re.escape(name)}\b", texto, flags=re.IGNORECASE):
                    empresas.append(name)
        if not tickers and not empresas:
            continue
        candidatas.append({
            "status": "pendiente",
            "tickers": tickers,
            "empresas": empresas,
            "texto": texto,
            "url": post.get("url"),
            "external_id": str(post.get("id") or "") or None,
            "nota": "candidata: revisar a mano; no genera alerta ni holding",
        })
    return candidatas


def fetch_posts_elon() -> list[dict]:
    """La API de X exige plan de pago. Este proceso no la llama."""
    log(
        "[musk_dice] --detectar: sin API de X configurada; no se consultó la red. "
        "Las candidatas se marcan con detectar_candidatas() y quedan pendiente."
    )
    return []


class MuskDiceAdapter(SourceAdapter):
    """Adapter del portafolio 'Elon Musk dice' (source musk_mentions)."""

    name = "musk_dice"
    portfolio_slug = MUSK_DICE_SLUG

    def __init__(self, dry_run: bool = False, data_path: Path = DATA_PATH) -> None:
        super().__init__(dry_run=dry_run)
        self.data_path = data_path

    def fetch_raw(self) -> dict:
        return {"menciones": load_menciones(self.data_path)}

    def normalize(self, raw: dict) -> list[Holding]:
        rows = build_musk_holdings(raw["menciones"])
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


def main() -> None:
    parser = argparse.ArgumentParser(description="Elon Musk dice — menciones verificadas")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Imprime pesos y menciones nuevas sin escribir en la base",
    )
    parser.add_argument(
        "--detectar",
        action="store_true",
        help="Marca candidatas pendiente (no inserta ni alerta; no llama a la API de X)",
    )
    args = parser.parse_args()

    menciones = load_menciones()
    rows = build_musk_holdings(menciones)
    print(f"Elon Musk dice — {len(rows)} posiciones (corte {date.today().isoformat()}):")
    for row in rows:
        print(f"  {row['symbol']:<10} {row['weight']:6.2f}%  {row['asset_class']:<6} entrada={row['entry_date']}")
    total = sum(r["weight"] for r in rows)
    print(f"  total pesos: {total:.2f}%")

    if args.detectar:
        catalogo = [m["empresa"] for m in menciones]
        candidatas = detectar_candidatas(fetch_posts_elon(), catalogo)
        print(f"candidatas pendiente: {len(candidatas)} (no se escribieron)")

    if args.dry_run:
        resumen = sync_musk_mentions(None, menciones, dry_run=True)
        print(
            f"(dry-run: no se escribió nada; menciones nuevas: {resumen['insertadas']}, "
            f"alertas: {resumen['alertas']}, omitidas por estado: {resumen['omitidas']})"
        )
        return

    db = get_db()
    summary = MuskDiceAdapter(dry_run=False).run(db)
    log(f"[musk_dice] holdings: {summary}")
    escrito = sync_musk_mentions(db, menciones, dry_run=False)
    log(f"[musk_dice] menciones: {escrito}")


if __name__ == "__main__":
    main()
