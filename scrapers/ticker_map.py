"""Resolución nombre de emisor → ticker para holdings de 13F.

Orden: (1) CUSIP → ticker con OpenFIGI (API pública, sin clave) y caché en
disco; (2) mapa curado por nombre normalizado (data/issuer_tickers.csv);
(3) sin resolver → None. Nunca se inventa un ticker: lo que no se resuelve
se omite de los cálculos y se registra.
"""
from __future__ import annotations

import csv
import json
import re
import time
from pathlib import Path
from typing import Any, Callable, Iterable

DATA_DIR = Path(__file__).resolve().parent / "data"
CURATED_CSV = DATA_DIR / "issuer_tickers.csv"
CUSIP_CACHE = DATA_DIR / "cusip_tickers.json"
OPENFIGI_URL = "https://api.openfigi.com/v3/mapping"
OPENFIGI_BATCH = 10  # máximo por pedido sin API key
OPENFIGI_DELAY_S = 2.6  # 25 pedidos/minuto sin API key

TICKER_RE = re.compile(r"^[A-Z]{1,5}(?:[.\-][A-Z])?$")
CUSIP_RE = re.compile(r"^[0-9A-Z]{8}[0-9]$")
_FILLER = {
    "INC", "INCORPORATED", "CORP", "CORPORATION", "CO", "COMPANY", "LTD", "LIMITED",
    "LLC", "LP", "PLC", "SA", "AG", "NV", "DEL", "NEW", "THE", "CL", "CLASS", "COM",
    "COMMON", "STOCK", "SHS", "ORD", "ADR", "ADS", "SPONSORED", "SPON", "A", "B", "C",
}
_GOOD_TYPES = {"COMMON STOCK", "ADR", "REIT", "ETP", "MLP", "DEPOSITARY RECEIPT", "EQUITY WRNT"}


def normalize_issuer(name: str) -> str:
    """Nombre normalizado: mayúsculas, sin puntuación ni sufijos societarios."""
    tokens = "".join(ch if ch.isalnum() else " " for ch in (name or "").upper()).split()
    kept = [t for t in tokens if t not in _FILLER]
    return " ".join(kept or tokens)


def is_ticker(value: str) -> bool:
    return bool(TICKER_RE.fullmatch((value or "").strip().upper()))


def load_curated(path: Path = CURATED_CSV) -> dict[str, str]:
    """Mapa curado nombre normalizado → ticker (solo entradas válidas)."""
    out: dict[str, str] = {}
    if not path.exists():
        return out
    with path.open(encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            name = normalize_issuer(row.get("issuer", ""))
            ticker = (row.get("ticker") or "").strip().upper()
            if name and is_ticker(ticker):
                out[name] = ticker
    return out


def load_cusip_cache(path: Path = CUSIP_CACHE) -> dict[str, str | None]:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return {k: v for k, v in data.items() if v is None or is_ticker(v)} if isinstance(data, dict) else {}


def save_cusip_cache(cache: dict[str, str | None], path: Path = CUSIP_CACHE) -> None:
    try:
        path.write_text(json.dumps(dict(sorted(cache.items())), indent=1) + "\n", encoding="utf-8")
    except OSError:
        pass


def pick_figi_ticker(entries: Iterable[dict[str, Any]]) -> str | None:
    """Ticker de una respuesta de OpenFIGI: listado de EE.UU. con ticker válido.

    Si hay varios tickers distintos plausibles, no se elige (None).
    """
    found: list[str] = []
    for entry in entries or []:
        if not isinstance(entry, dict):
            continue
        ticker = str(entry.get("ticker") or "").strip().upper().replace("/", ".")
        sec_type = str(entry.get("securityType") or "").upper()
        sector = str(entry.get("marketSector") or "").upper()
        if sector and sector != "EQUITY":
            continue
        if sec_type and sec_type not in _GOOD_TYPES:
            continue
        if is_ticker(ticker) and ticker not in found:
            found.append(ticker)
    return found[0] if len(found) == 1 else None


def _openfigi_post(jobs: list[dict[str, str]]) -> list[Any]:
    import httpx

    resp = httpx.post(OPENFIGI_URL, json=jobs, timeout=30.0)
    resp.raise_for_status()
    data = resp.json()
    return data if isinstance(data, list) else []


def resolve_cusips(
    cusips: Iterable[str],
    cache: dict[str, str | None],
    post: Callable[[list[dict[str, str]]], list[Any]] = _openfigi_post,
    delay_s: float = OPENFIGI_DELAY_S,
) -> dict[str, str | None]:
    """Resuelve CUSIPs pendientes en lotes; actualiza y devuelve el caché."""
    pending = sorted({c.strip().upper() for c in cusips if CUSIP_RE.fullmatch((c or "").strip().upper())} - set(cache))
    for i in range(0, len(pending), OPENFIGI_BATCH):
        batch = pending[i : i + OPENFIGI_BATCH]
        if i:
            time.sleep(delay_s)
        try:
            answers = post([{"idType": "ID_CUSIP", "idValue": c, "exchCode": "US"} for c in batch])
        except Exception as exc:  # noqa: BLE001 - un lote fallido no corta la corrida
            print(f"[ticker_map] WARNING OpenFIGI: {type(exc).__name__}")
            continue
        for cusip, answer in zip(batch, answers):
            entries = answer.get("data") if isinstance(answer, dict) else None
            cache[cusip] = pick_figi_ticker(entries or [])
    return cache


class TickerResolver:
    """Resuelve (issuer, cusip) → ticker y registra lo no resuelto."""

    def __init__(self, curated: dict[str, str] | None = None, cusip_cache: dict[str, str | None] | None = None):
        self.curated = load_curated() if curated is None else curated
        self.cusip_cache = load_cusip_cache() if cusip_cache is None else cusip_cache
        self.unresolved: list[str] = []

    def prefetch(self, holdings: Iterable[dict[str, Any]], **kwargs: Any) -> None:
        resolve_cusips((h.get("cusip") or "" for h in holdings), self.cusip_cache, **kwargs)

    def resolve(self, issuer: str, cusip: str = "") -> str | None:
        if is_ticker(issuer) and len(issuer.strip()) <= 5:
            return issuer.strip().upper()
        ticker = self.cusip_cache.get((cusip or "").strip().upper())
        if ticker:
            return ticker
        ticker = self.curated.get(normalize_issuer(issuer))
        if ticker:
            return ticker
        self.unresolved.append(issuer)
        return None
