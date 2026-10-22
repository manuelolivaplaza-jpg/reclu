"""Perfil curado por ticker: sector, industria, pares, proveedores y macro.

Fuente: ``scrapers/data/peers_manual.csv``, una curaduría propia y pequeña
(unos 50 tickers de EE.UU. y Chile). No se scrapea nada: el CSV es la verdad
y este módulo solo lo valida y lo sube a Supabase.

Destino (migración 051): ``ticker_profile``
  (symbol, sector, industry, country, peers, suppliers, macro_factors).
El upsert es por ``symbol`` con el cliente service role.

Vocabulario macro cerrado: tasas, cobre, litio, dolar_clp, petroleo,
aranceles, consumo, tecnologia y credito. Un valor fuera de la lista es un
error de curaduría y corta la carga.

La etapa ``stages/ticker_profile.py`` solo corre con
``NEWS_IMPACT_ENABLED=true`` (apagada por defecto), igual que news_edgar.
En ``--dry-run`` no se lee ni se escribe nada en Supabase.

Opcional: leer los símbolos distintos de ``user_holdings`` (solo la columna
``symbol``) para reportar los que faltan en el CSV. Esa lectura se hace solo
cuando hay cliente de base y nunca en dry-run desde ``run_all``.

Uso:
    python ticker_profile.py --dry-run
    python ticker_profile.py --csv data/peers_manual.csv
    python ticker_profile.py --missing   # solo lectura, lista faltantes
"""

from __future__ import annotations

import argparse
import csv
import io
import os
import re
import tempfile
from pathlib import Path
from typing import Any, Mapping

from activists_13d import clean_symbol
from base import get_db, log

PROFILE_FLAG = "NEWS_IMPACT_ENABLED"
TABLE = "ticker_profile"
DEFAULT_CSV_PATH = Path(__file__).resolve().parent / "data" / "peers_manual.csv"

CSV_COLUMNS = (
    "symbol",
    "sector",
    "industry",
    "country",
    "peers",
    "suppliers",
    "macro_factors",
)

# Vocabulario cerrado de factores macro (ver docs/mi-portafolio-ia.md, F67).
MACRO_FACTORS = (
    "tasas",
    "cobre",
    "litio",
    "dolar_clp",
    "petroleo",
    "aranceles",
    "consumo",
    "tecnologia",
    "credito",
)
MACRO_SET = frozenset(MACRO_FACTORS)

BATCH_SIZE = 50
DRY_RUN_SAMPLE = 10
COUNTRY_RE = re.compile(r"^[A-Z]{2}$")


def profile_enabled() -> bool:
    """Flags del proyecto: solo se encienden con el valor exacto "true"."""
    return os.environ.get(PROFILE_FLAG) == "true"


def _text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def split_list(raw: str) -> list[str]:
    """Separa por ``|``, limpia espacios y quita duplicados sin perder orden."""
    values: list[str] = []
    seen: set[str] = set()
    for chunk in str(raw or "").split("|"):
        value = _text(chunk)
        if not value:
            continue
        key = value.casefold()
        if key in seen:
            continue
        seen.add(key)
        values.append(value)
    return values


def parse_macro(raw: str) -> list[str]:
    """Valida los factores macro contra el vocabulario cerrado."""
    values: list[str] = []
    for factor in split_list(raw):
        key = factor.casefold()
        if key not in MACRO_SET:
            raise ValueError(
                f"factor macro desconocido: {factor!r} "
                f"(válidos: {', '.join(MACRO_FACTORS)})"
            )
        if key not in values:
            values.append(key)
    return values


def parse_peers(raw: str, symbol: str = "") -> list[str]:
    """Pares como tickers limpios; un valor inválido es un error de curaduría."""
    peers: list[str] = []
    for peer in split_list(raw):
        clean = clean_symbol(peer)
        if not clean:
            raise ValueError(f"peer inválido: {peer!r}")
        if clean == symbol:
            raise ValueError(f"el ticker {symbol} no puede ser su propio peer")
        if clean not in peers:
            peers.append(clean)
    return peers


def normalize_profile(raw: Mapping[str, Any]) -> dict[str, Any]:
    """Fila del CSV → registro validado de ``ticker_profile``."""
    symbol = clean_symbol(str(raw.get("symbol") or ""))
    if not symbol:
        raise ValueError("symbol vacío o inválido")

    sector = _text(raw.get("sector"))
    if not sector:
        raise ValueError(f"{symbol}: sector vacío")

    country = _text(raw.get("country")).upper()
    if not country:
        raise ValueError(f"{symbol}: country vacío")
    if not COUNTRY_RE.fullmatch(country):
        raise ValueError(f"{symbol}: country inválido {country!r} (ISO de 2 letras)")

    return {
        "symbol": symbol,
        "sector": sector,
        "industry": _text(raw.get("industry")),
        "country": country,
        "peers": parse_peers(str(raw.get("peers") or ""), symbol),
        "suppliers": split_list(str(raw.get("suppliers") or "")),
        "macro_factors": parse_macro(str(raw.get("macro_factors") or "")),
    }


def parse_profiles_csv(text: str) -> list[dict[str, Any]]:
    """Parsea y valida el CSV completo. Falla ruidosamente si no cuadra."""
    body = str(text or "").lstrip("\ufeff")
    reader = csv.DictReader(io.StringIO(body))
    if not reader.fieldnames:
        raise ValueError("CSV vacío: falta el encabezado")

    header = [_text(name).lower() for name in reader.fieldnames]
    missing = [column for column in CSV_COLUMNS if column not in header]
    if missing:
        raise ValueError(f"faltan columnas en el CSV: {', '.join(missing)}")

    profiles: list[dict[str, Any]] = []
    seen: set[str] = set()
    for number, raw in enumerate(reader, start=2):
        row = {
            _text(key).lower(): value
            for key, value in raw.items()
            if key is not None
        }
        if not any(_text(value) for value in row.values()):
            continue
        try:
            profile = normalize_profile(row)
        except ValueError as error:
            raise ValueError(f"línea {number}: {error}") from error
        if profile["symbol"] in seen:
            raise ValueError(f"línea {number}: symbol duplicado {profile['symbol']}")
        seen.add(profile["symbol"])
        profiles.append(profile)

    if not profiles:
        raise ValueError("CSV sin filas")
    return profiles


def load_profiles(path: Path | str | None = None) -> list[dict[str, Any]]:
    """Lee el CSV curado desde disco (UTF-8, tolera BOM)."""
    csv_path = Path(path) if path else DEFAULT_CSV_PATH
    return parse_profiles_csv(csv_path.read_text(encoding="utf-8-sig"))


def profile_record(profile: Mapping[str, Any]) -> dict[str, Any]:
    """Columnas exactas de ``ticker_profile`` para el upsert."""
    return {
        "symbol": profile["symbol"],
        "sector": profile["sector"],
        "industry": profile.get("industry") or "",
        "country": profile["country"],
        "peers": list(profile.get("peers") or []),
        "suppliers": list(profile.get("suppliers") or []),
        "macro_factors": list(profile.get("macro_factors") or []),
    }


def symbols_from_user_holdings(db: Any, limit: int = 1000) -> list[str]:
    """Símbolos distintos de ``user_holdings``; solo la columna symbol.

    No devuelve user_id, cantidades ni pesos. El cliente debe ser service role.

    F80: los tickers de la cartera de los usuarios son datos de cartera. Esta
    función NO los imprime ni los loguea: quien la usa solo puede reportar el
    CONTOO (ver ``missing_report``). El detalle va a un artefacto local fuera
    del repo.
    """
    rows = (
        db.table("user_holdings").select("symbol").limit(limit).execute().data or []
    )
    symbols: list[str] = []
    seen: set[str] = set()
    for row in rows:
        symbol = clean_symbol(str((row or {}).get("symbol") or ""))
        if symbol and symbol not in seen:
            seen.add(symbol)
            symbols.append(symbol)
    return symbols


def missing_artifact_path() -> Path:
    """Ruta del artefacto local con el detalle de los tickers faltantes.

    Vive fuera del repo (temp del sistema) para que la lista no termine en
    un log, en un artefacto versionado ni en un proveedor de logs.
    """
    return Path(tempfile.gettempdir()) / "reclu-ticker-profile-missing.txt"


def missing_report(missing: list[str]) -> dict[str, Any]:
    """Reporte de los tickers faltantes SIN exponer la lista.

    F80: devuelve el conteo y deja el detalle en un artefacto local fuera del
    repo. El texto que se imprime o se loguea es solo ``faltan {n}``.
    """
    count = len(missing)
    artifact = missing_artifact_path()
    try:
        artifact.write_text("\n".join(missing) + "\n", encoding="utf-8")
        artifact_path = str(artifact)
    except OSError:
        artifact_path = ""
    return {
        "missing_count": count,
        "missing_artifact": artifact_path,
    }


def missing_from_profiles(
    symbols: list[str], profiles: list[dict[str, Any]]
) -> list[str]:
    """Tickers de usuario que no están en el CSV, normalizados y ordenados."""
    known = {profile["symbol"] for profile in profiles}
    missing: list[str] = []
    for raw in symbols:
        symbol = clean_symbol(str(raw or ""))
        if symbol and symbol not in known and symbol not in missing:
            missing.append(symbol)
    return sorted(missing)


class TickerProfileAdapter:
    """CSV curado → upsert en ``ticker_profile``."""

    name = "ticker_profile"

    def __init__(
        self,
        dry_run: bool = False,
        *,
        csv_path: Path | str | None = None,
        profiles: list[dict[str, Any]] | None = None,
    ) -> None:
        self.dry_run = dry_run
        self.csv_path = Path(csv_path) if csv_path else DEFAULT_CSV_PATH
        self._profiles = profiles

    def fetch_raw(self) -> list[dict[str, Any]]:
        if self._profiles is not None:
            return list(self._profiles)
        return load_profiles(self.csv_path)

    def normalize(self, raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return list(raw)

    def _summary(
        self, rows: list[dict[str, Any]], *, dry_run: bool
    ) -> dict[str, Any]:
        return {
            "source": self.name,
            "profiles": len(rows),
            "written": 0,
            "status": "ok" if rows else "empty",
            "dry_run": dry_run,
        }

    def run(self, db: Any = None) -> dict[str, Any]:
        rows = self.normalize(self.fetch_raw())
        if self.dry_run:
            for row in rows[:DRY_RUN_SAMPLE]:
                log(
                    f"[ticker_profile] DRY-RUN {row['symbol']} {row['sector']} "
                    f"peers={','.join(row.get('peers') or []) or '-'} "
                    f"macro={','.join(row.get('macro_factors') or []) or '-'}"
                )
            log(f"[ticker_profile] DRY-RUN: {len(rows)} perfiles NO escritos")
            return self._summary(rows, dry_run=True)

        if not rows:
            return self._summary(rows, dry_run=False)

        if db is None:
            db = get_db()
        payload = [profile_record(row) for row in rows]
        for start in range(0, len(payload), BATCH_SIZE):
            db.table(TABLE).upsert(
                payload[start : start + BATCH_SIZE], on_conflict="symbol"
            ).execute()

        summary = self._summary(rows, dry_run=False)
        summary["written"] = len(payload)
        log(f"[ticker_profile] {len(payload)} perfiles escritos en {TABLE}")

        try:
            symbols = symbols_from_user_holdings(db)
            missing = missing_from_profiles(symbols, rows)
            summary["user_symbols"] = len(symbols)
            # F80: nunca la lista de tickers de los usuarios. Solo el conteo.
            summary.update(missing_report(missing))
            if missing:
                log(f"[ticker_profile] faltan en el CSV: {len(missing)}")
        except Exception as error:  # noqa: BLE001 — el reporte no corta la carga
            log(f"[ticker_profile] WARNING user_holdings: {error}")

        return summary


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Carga el perfil curado por ticker (sector, peers, macro)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Valida el CSV y muestra una muestra; no escribe en Supabase.",
    )
    parser.add_argument(
        "--csv",
        default="",
        help=f"Ruta del CSV (por defecto {DEFAULT_CSV_PATH}).",
    )
    parser.add_argument(
        "--missing",
        action="store_true",
        help="Lista los símbolos de user_holdings que faltan en el CSV (solo lectura).",
    )
    args = parser.parse_args()

    try:
        rows = load_profiles(args.csv or None)
    except (OSError, ValueError) as error:
        log(f"[ticker_profile] ERROR CSV: {error}")
        raise SystemExit(1) from error

    log(f"[ticker_profile] {len(rows)} perfiles válidos en el CSV")

    # Un solo cliente: --missing lo necesita aunque sea dry-run (solo lectura).
    db = None if args.dry_run and not args.missing else get_db()

    if args.missing:
        try:
            symbols = symbols_from_user_holdings(db)
            missing = missing_from_profiles(symbols, rows)
            # F80: ni el log ni stdout muestran la lista de tickers.
            report = missing_report(missing)
            log(
                f"[ticker_profile] user_holdings: {len(symbols)} símbolos, "
                f"{report['missing_count']} sin perfil"
            )
            print(f"faltan {report['missing_count']}")
            if report["missing_artifact"]:
                print(f"detalle: {report['missing_artifact']}")
        except Exception as error:  # noqa: BLE001 — sin base solo se reporta
            log(f"[ticker_profile] WARNING user_holdings: {error}")

    result = TickerProfileAdapter(dry_run=args.dry_run, profiles=rows).run(db)
    if result.get("status") == "empty":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
