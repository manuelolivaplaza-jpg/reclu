"""Hechos esenciales de la CMF -> `news_items` / `news_tickers` (F65).

Reutiliza los hechos ya descargados en `cl_material_events` (migracion 032)
y los convierte en noticias normalizadas de la tabla de la migracion 051:

  * `news_items`: source='cmf_hechos', url, title (la materia o el titulo),
    published_at (la fecha) y un resumen propio y corto (max 500 chars).
    El hash es sha256 de la URL, asi que reingerir no duplica.
  * `news_tickers`: emisor -> nemotecnico BCS, siempre con relation='direct'.
    Confidence 1.0 cuando el nombre calza exacto con un alias verificado
    (`data/infoprobidad/rut_nemotecnico.json`) y 0.7 cuando lo resuelve
    `resolve_tickers.resolve_name` (mapeo aproximado via Yahoo).

Los hechos sin nemotecnico se guardan igual, sin fila en `news_tickers`.
No se guarda el texto del documento: solo titular, URL y resumen propio.

La resolucion de nemotecnicos se puede inyectar (`resolver=`) para los
tests; asi el test no toca la red. En `--dry-run` no se lee ni escribe
Supabase: la etapa debe poder correr con cualquier cliente trampa.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any, Callable, Iterable

SOURCE = "cmf_hechos"
TABLE_EVENTS = "cl_material_events"
TABLE_NEWS = "news_items"
TABLE_TICKERS = "news_tickers"
NEWS_CONFLICT = "hash"
TICKERS_CONFLICT = "news_id,symbol,relation"
RELATION = "direct"
DEFAULT_LIMIT = 200
SUMMARY_MAX = 500
EXACT_CONFIDENCE = 1.0
APPROX_CONFIDENCE = 0.7

EVENT_COLUMNS = (
    "fecha",
    "numero_documento",
    "emisor",
    "materia",
    "titulo",
    "categoria",
    "url",
)

# (nombre normalizado -> nemotecnico) de emisoras verificadas de la CMF.
ALIASES_PATH = (
    Path(__file__).resolve().parent / "data" / "infoprobidad" / "rut_nemotecnico.json"
)

# Sufijos societarios que no cambian la identidad del emisor.
_LEGAL_SUFFIXES = ("S.A.", "SA", "S.P.A.", "SPA", "S.A", "LTDA")

Resolver = Callable[[str], "str | None"]


def news_enabled() -> bool:
    """Flag de producto: apagado salvo NEWS_IMPACT_ENABLED='true'."""
    return os.environ.get("NEWS_IMPACT_ENABLED", "") == "true"


def _norm(texto: str) -> str:
    """Minusculas, sin tildes y con espacios/puntuacion normalizados."""
    base = unicodedata.normalize("NFKD", texto or "")
    sin_tildes = "".join(c for c in base if not unicodedata.combining(c))
    limpio = re.sub(r"[^a-z0-9]+", " ", sin_tildes.lower())
    return re.sub(r"\s+", " ", limpio).strip()


def _sin_sufijo(normalizado: str) -> str:
    """Quita el sufijo societario final ('s a', 'sa', 'spa', 'ltda')."""
    palabras = normalizado.split()
    while palabras and palabras[-1] in {"s", "a", "sa", "spa", "ltda"}:
        palabras.pop()
    return " ".join(palabras)


def load_aliases(path: Path | None = None) -> dict[str, str]:
    """Alias nombre normalizado -> nemotecnico desde el mapa verificado.

    Si el archivo no existe o esta mal formado devuelve {}: la etapa sigue,
    solo que sin mapeos exactos.
    """
    ruta = path or ALIASES_PATH
    try:
        payload = json.loads(ruta.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}

    alias: dict[str, str] = {}
    empresas = payload.get("empresas") if isinstance(payload, dict) else None
    if not isinstance(empresas, list):
        return {}
    for empresa in empresas:
        if not isinstance(empresa, dict):
            continue
        symbol = str(empresa.get("symbol") or "").strip().upper()
        nombre = _norm(str(empresa.get("nombre") or ""))
        if not symbol or not nombre:
            continue
        alias.setdefault(nombre, symbol)
        corto = _sin_sufijo(nombre)
        if corto:
            alias.setdefault(corto, symbol)
    return alias


def news_hash(url: str) -> str:
    """sha256 de la URL: clave estable para no duplicar en reingestas."""
    return hashlib.sha256((url or "").strip().encode("utf-8")).hexdigest()


def resolve_nemo(
    emisor: str,
    *,
    aliases: dict[str, str] | None = None,
    resolver: Resolver | None = None,
) -> tuple[str | None, float | None]:
    """Emisor CMF -> (nemotecnico, confidence).

    Primero busca un alias verificado (exacto, 1.0). Si no hay, delega en
    `resolve_tickers` (aproximado, 0.7). Sin match devuelve (None, None).
    """
    clave = _norm(emisor)
    if not clave:
        return None, None

    mapa = aliases if aliases is not None else load_aliases()
    symbol = mapa.get(clave)
    if not symbol:
        symbol = mapa.get(_sin_sufijo(clave))
    if symbol:
        return symbol, EXACT_CONFIDENCE

    if resolver is None:
        return None, None
    try:
        aproximado = resolver(emisor)
    except Exception as exc:  # noqa: BLE001 - un fallo de red no tumba la etapa
        print(f"[{SOURCE}] WARNING no pude resolver {emisor!r}: {exc}")
        return None, None
    if not aproximado:
        return None, None
    return str(aproximado).strip().upper(), APPROX_CONFIDENCE


def _categoria(evento: dict[str, Any]) -> str:
    from cmf_hechos import classify

    return str(evento.get("categoria") or "").strip() or classify(
        str(evento.get("materia") or "")
    )


def _label(categoria: str) -> str:
    from cmf_hechos import CATEGORY_LABELS

    return CATEGORY_LABELS.get(categoria, "Hecho esencial")


def event_to_news(evento: dict[str, Any]) -> dict[str, Any] | None:
    """Fila de `news_items` para un hecho, o None si le falta URL/fecha.

    `title` es la materia (o el titulo de la portada si falta la materia).
    El resumen es propio, corto, y nunca copia el documento completo.
    """
    url = str(evento.get("url") or "").strip()
    fecha = str(evento.get("fecha") or "").strip()
    if not fecha:
        fecha = str(evento.get("fecha_hora") or "").strip()[:10]
    if not url or not fecha:
        return None

    emisor = str(evento.get("emisor") or "").strip()
    materia = str(evento.get("materia") or "").strip()
    titulo = materia or str(evento.get("titulo") or "").strip() or f"Hecho esencial: {emisor}"
    categoria = _categoria(evento)
    numero = str(evento.get("numero_documento") or "").strip()

    resumen = (
        f"Hecho esencial de {emisor or 'un emisor'} sobre {materia.lower() or titulo.lower()} "
        f"({_label(categoria)}). Publicado el {fecha}."
    )
    if numero:
        resumen += f" Documento CMF {numero}."
    resumen = resumen[:SUMMARY_MAX]

    return {
        "source": SOURCE,
        "url": url,
        "title": titulo[:300],
        "summary": resumen,
        "published_at": fecha,
        "lang": "es",
        "hash": news_hash(url),
    }


def prepare_news(
    eventos: Iterable[dict[str, Any]],
    *,
    aliases: dict[str, str] | None = None,
    resolver: Resolver | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, int]]:
    """Convierte hechos en noticias y vinculos noticia->ticker.

    Devuelve `(news, vinculos, metricas)`. `vinculos` no trae `news_id`:
    el adaptador lo completa despues del upsert. Deduplica por hash de URL.
    """
    mapa = aliases if aliases is not None else load_aliases()
    noticias: list[dict[str, Any]] = []
    vinculos: list[dict[str, Any]] = []
    vistos: set[str] = set()
    metricas = {"omitidos": 0, "sin_nemo": 0, "con_nemo": 0}

    for evento in eventos:
        item = event_to_news(evento)
        if item is None:
            metricas["omitidos"] += 1
            continue
        if item["hash"] in vistos:
            continue
        vistos.add(item["hash"])

        emisor = str(evento.get("emisor") or "").strip()
        symbol, confidence = resolve_nemo(
            emisor, aliases=mapa, resolver=resolver
        )
        if symbol:
            metricas["con_nemo"] += 1
            vinculos.append(
                {
                    "_hash": item["hash"],
                    "symbol": symbol,
                    "relation": RELATION,
                    "confidence": confidence,
                }
            )
        else:
            metricas["sin_nemo"] += 1
        noticias.append(item)

    return noticias, vinculos, metricas


class CmfNewsAdapter:
    """Lee cl_material_events y lo publica como noticias + tickers."""

    name = SOURCE

    def __init__(
        self,
        *,
        dry_run: bool = False,
        limit: int = DEFAULT_LIMIT,
        aliases: dict[str, str] | None = None,
        resolver: Resolver | None = None,
    ) -> None:
        self.dry_run = dry_run
        self.limit = max(1, int(limit))
        self.aliases = aliases if aliases is not None else load_aliases()
        self._cache: dict[str, str | None] = {}
        self.resolver = resolver or self._resolver_yahoo

    def _resolver_yahoo(self, emisor: str) -> str | None:
        """Mapeo aproximado reutilizando resolve_tickers (con cache)."""
        from resolve_tickers import resolve_name

        return resolve_name(emisor, self._cache)

    def fetch_events(self, db: Any) -> list[dict[str, Any]]:
        respuesta = (
            db.table(TABLE_EVENTS)
            .select(",".join(EVENT_COLUMNS))
            .order("fecha", desc=True)
            .limit(self.limit)
            .execute()
        )
        filas = getattr(respuesta, "data", None) or []
        return [fila for fila in filas if isinstance(fila, dict)]

    def preview(self, eventos: Iterable[dict[str, Any]]) -> dict[str, Any]:
        """Convierte sin tocar la base (para --dry-run con un JSON local)."""
        noticias, vinculos, metricas = prepare_news(
            eventos, aliases=self.aliases, resolver=self.resolver
        )
        return {
            "source": SOURCE,
            "status": "dry_run",
            "dry_run": True,
            "eventos": len(noticias) + metricas["omitidos"],
            "news": len(noticias),
            "tickers": len(vinculos),
            **metricas,
        }

    def run(self, db: Any = None, eventos: Iterable[dict[str, Any]] | None = None) -> dict[str, Any]:
        """Ingesta. En dry-run no lee ni escribe Supabase.

        `eventos` permite previsualizar con un fixture sin tocar la base.
        """
        if self.dry_run:
            if eventos is not None:
                resumen = self.preview(eventos)
                resumen["status"] = "dry_run"
                return resumen
            return {
                "source": SOURCE,
                "status": "dry_run",
                "dry_run": True,
                "eventos": 0,
                "news": 0,
                "tickers": 0,
                "omitidos": 0,
                "sin_nemo": 0,
                "con_nemo": 0,
            }

        if db is None:
            raise RuntimeError("CmfNewsAdapter.run necesita un cliente Supabase")
        if eventos is None:
            eventos = self.fetch_events(db)

        noticias, vinculos, metricas = prepare_news(
            eventos, aliases=self.aliases, resolver=self.resolver
        )
        resumen: dict[str, Any] = {
            "source": SOURCE,
            "status": "ok" if noticias else "empty",
            "eventos": len(noticias) + metricas["omitidos"],
            "news": len(noticias),
            "tickers": len(vinculos),
            **metricas,
        }
        if not noticias:
            return resumen

        self._upsert_news(db, noticias)
        ids = self._news_ids(db, [item["hash"] for item in noticias])
        tickers = self._ticker_rows(vinculos, ids)
        if tickers:
            db.table(TABLE_TICKERS).upsert(
                tickers,
                on_conflict=TICKERS_CONFLICT,
                ignore_duplicates=True,
            ).execute()
        resumen["tickers"] = len(tickers)
        return resumen

    @staticmethod
    def _upsert_news(db: Any, noticias: list[dict[str, Any]]) -> None:
        db.table(TABLE_NEWS).upsert(
            noticias,
            on_conflict=NEWS_CONFLICT,
            ignore_duplicates=True,
        ).execute()

    @staticmethod
    def _news_ids(db: Any, hashes: list[str]) -> dict[str, str]:
        if not hashes:
            return {}
        respuesta = (
            db.table(TABLE_NEWS)
            .select("id,hash")
            .in_("hash", hashes)
            .execute()
        )
        filas = getattr(respuesta, "data", None) or []
        return {
            str(fila["hash"]): str(fila["id"])
            for fila in filas
            if isinstance(fila, dict) and fila.get("hash") and fila.get("id")
        }

    @staticmethod
    def _ticker_rows(
        vinculos: list[dict[str, Any]], ids: dict[str, str]
    ) -> list[dict[str, Any]]:
        filas: list[dict[str, Any]] = []
        vistos: set[tuple[str, str, str]] = set()
        for vinculo in vinculos:
            news_id = ids.get(str(vinculo.get("_hash") or ""))
            if not news_id:
                continue
            clave = (news_id, vinculo["symbol"], vinculo["relation"])
            if clave in vistos:
                continue
            vistos.add(clave)
            filas.append(
                {
                    "news_id": news_id,
                    "symbol": vinculo["symbol"],
                    "relation": vinculo["relation"],
                    "confidence": vinculo["confidence"],
                }
            )
        return filas


def correr(db: Any, dry_run: bool = False, *, limit: int = DEFAULT_LIMIT) -> list[dict[str, Any]]:
    """Punto de entrada de la etapa `stages/news_cmf.py`."""
    adapter = CmfNewsAdapter(dry_run=dry_run, limit=limit)
    return [adapter.run(None if dry_run else db)]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Hechos esenciales CMF -> news_items / news_tickers"
    )
    parser.add_argument("--dry-run", action="store_true", help="Sin leer ni escribir Supabase")
    parser.add_argument("--json", type=Path, default=None, help="Hechos en JSON local (sin red)")
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT, help="Maximo de hechos")
    args = parser.parse_args(argv)

    if args.json:
        eventos = json.loads(args.json.read_text(encoding="utf-8"))
        adapter = CmfNewsAdapter(dry_run=True, limit=args.limit)
        print(adapter.run(None, eventos=eventos))
        return 0

    if args.dry_run:
        print(CmfNewsAdapter(dry_run=True, limit=args.limit).run())
        return 0

    if not news_enabled():
        print(
            f"[{SOURCE}] apagado: define NEWS_IMPACT_ENABLED=true para escribir"
        )
        return 0

    adapter = CmfNewsAdapter(dry_run=False, limit=args.limit)
    print(adapter.run(_db()))
    return 0


def _db() -> Any:
    raiz = Path(__file__).resolve().parent
    if str(raiz) not in sys.path:
        sys.path.insert(0, str(raiz))
    from base import get_db

    return get_db()


if __name__ == "__main__":
    raise SystemExit(main())
