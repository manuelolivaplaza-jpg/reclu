"""Hechos esenciales de la CMF (listado diario, tabla `cl_material_events`).

Fuente (verificada en vivo el 2026-10-19):
  https://www.cmfchile.cl/institucional/hechos/hechos_portada.php
  "Hechos Esenciales recibidos en los últimos 7 días": tabla publica SIN
  captcha con cuatro columnas: Fecha - Hora, Número de Documento (link al
  PDF en ver_sgd.php), Entidad y Materia.

  El buscador completo (hechos.php -> hechos2.php) SI exige captcha
  validado del lado servidor (probado: texto falso responde 302 a la
  portada), asi que esta etapa usa la portada de 7 dias, que no lo pide.
  Correr 1 vez al dia es suficiente para no perder hechos entre corridas.

  El link al documento es permanente y no requiere sesion: ver_sgd.php?s567=...
  (s567 = base64 triple del numero de documento).

Clasificacion: `classify(materia)` es una funcion PURA por palabras clave,
sin red ni IA. La IA (OpenRouter) queda opcional y solo para el resumen de la
alerta, igual que el resto del pipeline.

Legal: informacion publica y oficial de la CMF. Sin datos personales (Leyes
19.628 y 21.719). Dato informativo: no ejecuta ordenes ni es recomendacion
(Ley Fintec).
"""

from __future__ import annotations

import argparse
import html as _html
import re
import sys
import unicodedata
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterable

from cmf_client import BASE_URL, CmfBlocked, CmfClient, build_url

NAME = "cmf_hechos"
PORTADA_PATH = "/institucional/hechos/hechos_portada.php"
TABLE = "cl_material_events"
FUENTE = "cmf"

# Clave unica: un registro por numero de documento (la CMF no lo repite).
CONFLICT_COLUMNS = "numero_documento"

PORTFOLIO_SLUG = "hechos-esenciales-cl"

# ---------------------------------------------------------------------------
# Clasificacion pura por palabras clave sobre la "Materia" del hecho.
# ---------------------------------------------------------------------------

# (categoria, palabras clave normalizadas sin tildes, en minusculas).
# El orden importa: se devuelve la primera categoria que matchea.
KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        "opa",
        (
            "oferta publica de adquisicion",
            "opa",
        ),
    ),
    (
        "aumento_capital",
        (
            "aumento de capital",
            "aumentos de capital",
        ),
    ),
    (
        "dividendo",
        (
            "reparto de utilidades",
            "pago de dividendos",
            "dividendos",
        ),
    ),
    (
        "cambio_control",
        (
            "cambio de control",
            "adquisicion o enajenacion de activos o paquetes accionarios",
            "paquetes accionarios",
            "activos o paquetes accionarios",
        ),
    ),
    (
        "compra_venta_acciones",
        (
            "compra o venta de acciones",
            "compra y venta de acciones",
            "enajenacion de acciones",
            "adquisicion de acciones",
            "compra de acciones propias",
        ),
    ),
    (
        "colocacion",
        (
            "colocacion de valores",
            "colocaciones relacionadas",
        ),
    ),
    (
        "fusion",
        (
            "division, fusion o constitucion de sociedades",
            "fusion",
            "division de sociedades",
        ),
    ),
    (
        "junta_accionistas",
        (
            "junta de accionistas",
            "junta ordinaria de accionistas",
            "junta extraordinaria de accionistas",
        ),
    ),
)

CATEGORIAS = tuple(cat for cat, _ in KEYWORDS) + ("otro",)


def _norm(texto: str) -> str:
    """Minusculas sin tildes y espacios normalizados (igual que F31)."""
    base = unicodedata.normalize("NFKD", texto or "")
    sin_tildes = "".join(c for c in base if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", sin_tildes.strip().lower())


def classify(materia: str) -> str:
    """Clasifica la materia del hecho esencial en una categoria.

    Funcion PURA: sin red, sin IA, sin estado. Devuelve la categoria en
    minusculas ('opa', 'aumento_capital', 'dividendo', 'cambio_control',
    'compra_venta_acciones', 'colocacion', 'fusion', 'junta_accionistas')
    o 'otro' si ninguna palabra clave matchea.
    """
    normalizada = _norm(materia)
    if not normalizada:
        return "otro"
    for categoria, palabras in KEYWORDS:
        for palabra in palabras:
            if palabra in normalizada:
                return categoria
    return "otro"


# ---------------------------------------------------------------------------
# Parseo de la portada (tabla de los ultimos 7 dias)
# ---------------------------------------------------------------------------

_TR_RE = re.compile(r"<tr[^>]*>(.*?)</tr>", re.DOTALL)
_TD_RE = re.compile(r"<td[^>]*>(.*?)</td>", re.DOTALL)
_HREF_RE = re.compile(r'<a\b[^>]*href="([^"]+)"[^>]*>', re.IGNORECASE)
_DATE_RE = re.compile(r"(\d{2})/(\d{2})/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})")
_NUMDOC_RE = re.compile(r"\b(\d{12,13})\b")
_ENTITY_RE = re.compile(r"<[^>]+>")


def _entity_name(raw: str) -> str:
    return _ENTITY_RE.sub(" ", raw or "").strip()


def _unescape(texto: str) -> str:
    return _html.unescape(texto or "").strip()


def parse_hechos(html: str) -> list[dict[str, Any]]:
    """Convierte el HTML de hechos_portada.php en registros normalizados.

    Una fila por hecho: fecha_hora, numero_documento, url, emisor, materia.
    El titulo se arma como '{entidad}: {materia}' (la portada no trae el
    titulo completo del PDF, que es imagen escaneada).
    """
    if not html:
        return []
    registros: list[dict[str, Any]] = []
    for match in _TR_RE.finditer(html):
        fila = match.group(1)
        tds = _TD_RE.findall(fila)
        if len(tds) != 4:
            continue
        fecha_raw, numdoc_raw, entidad_raw, materia_raw = tds

        m = _DATE_RE.search(fecha_raw)
        if not m:
            continue
        dia, mes, anio, hora, minuto, seg = m.groups()
        try:
            fecha_hora = datetime(
                int(anio), int(mes), int(dia), int(hora), int(minuto), int(seg)
            )
        except ValueError:
            continue
        fecha = fecha_hora.date().isoformat()

        href = _HREF_RE.search(numdoc_raw)
        numero_documento = ""
        mnum = _NUMDOC_RE.search(numdoc_raw)
        if mnum:
            numero_documento = mnum.group(1)
        if not href or not numero_documento:
            continue
        url = _unescape(href.group(1))
        if url.startswith("/"):
            url = BASE_URL + url

        emisor = _unescape(_entity_name(entidad_raw))
        materia = _unescape(_entity_name(materia_raw))
        if not emisor or not materia:
            continue

        registros.append(
            {
                "fecha": fecha,
                "fecha_hora": fecha_hora.isoformat(),
                "numero_documento": numero_documento,
                "emisor": emisor,
                "materia": materia,
                "titulo": f"{emisor}: {materia}",
                "categoria": classify(materia),
                "url": url,
            }
        )
    return registros


def dedupe_hechos(registros: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Un registro por numero de documento (la CMF no lo repite)."""
    vistos: set[str] = set()
    salida: list[dict[str, Any]] = []
    for fila in registros:
        clave = str(fila.get("numero_documento") or "").strip()
        if not clave or clave in vistos:
            continue
        vistos.add(clave)
        salida.append(fila)
    return salida


# ---------------------------------------------------------------------------
# RUT del emisor (opcional, desde cl_dividends de F31; vacio si no hay)
# ---------------------------------------------------------------------------


def rut_map_from_dividendos(rows: Iterable[dict[str, Any]]) -> dict[str, str]:
    """Map razon_social normalizada -> rut_emisor desde filas de cl_dividends."""
    mapa: dict[str, str] = {}
    for fila in rows:
        rut = str(fila.get("rut_emisor") or "").strip()
        razon = _norm(str(fila.get("razon_social") or ""))
        nemo = _norm(str(fila.get("nemo") or ""))
        if rut:
            if razon:
                mapa[razon] = rut
            if nemo:
                mapa.setdefault(nemo, rut)
    return mapa


def match_rut(emisor: str, mapa: dict[str, str]) -> str:
    """RUT si el emisor aparece en cl_dividends; '' si no hay match."""
    if not mapa or not emisor:
        return ""
    clave = _norm(emisor)
    if clave in mapa:
        return mapa[clave]
    # Match por prefijo: la portada a veces trunca ("SOCIEDAD DE INVERSIONES
    # NORTE SUR S.A." vs "SOCIEDAD DE INVERSIONES NORTE SUR S.A.").
    for nombre, rut in mapa.items():
        if nombre and (clave.startswith(nombre) or nombre.startswith(clave)):
            return rut
    return ""


# ---------------------------------------------------------------------------
# Adaptador
# ---------------------------------------------------------------------------


def source_url() -> str:
    return build_url(PORTADA_PATH)


class CmfHechosAdapter:
    """Descarga la portada de hechos esenciales y la normaliza."""

    name = NAME
    table = TABLE

    def __init__(
        self,
        *,
        dias: int = 7,
        dry_run: bool = False,
        client: CmfClient | None = None,
    ) -> None:
        self.dias = dias
        self.dry_run = dry_run
        self.client = client or CmfClient()

    @property
    def url(self) -> str:
        return source_url()

    def fetch_raw(self) -> str:
        """Baja la portada (lanza `CmfBlocked` si el WAF bloquea)."""
        return self.client.get(self.url)

    def normalize(self, html: str) -> list[dict[str, Any]]:
        return dedupe_hechos(parse_hechos(html))

    def run(self, db: Any = None) -> dict[str, Any]:
        html = self.fetch_raw()
        registros = self.normalize(html)
        resumen: dict[str, Any] = {
            "source": self.name,
            "hechos": len(registros),
            "status": "ok",
        }
        if not registros:
            resumen["status"] = "empty"
            return resumen

        if self.dry_run:
            resumen["dry_run"] = True
            return resumen

        if db is None:
            raise RuntimeError("CmfHechosAdapter.run necesita un cliente Supabase")
        self._upsert(db, registros)
        resumen["upsert"] = len(registros)
        return resumen

    def _upsert(self, db: Any, registros: list[dict[str, Any]]) -> None:
        payload = [self._record(fila) for fila in registros]
        db.table(self.table).upsert(
            payload,
            on_conflict=CONFLICT_COLUMNS,
            ignore_duplicates=True,
        ).execute()

    @staticmethod
    def _record(fila: dict[str, Any]) -> dict[str, Any]:
        return {
            "fecha": fila.get("fecha"),
            "numero_documento": fila["numero_documento"],
            "emisor": fila["emisor"],
            "rut_emisor": fila.get("rut_emisor") or "",
            "materia": fila["materia"],
            "categoria": fila.get("categoria") or classify(fila.get("materia", "")),
            "titulo": fila.get("titulo") or f"{fila['emisor']}: {fila['materia']}",
            "url": fila.get("url") or "",
        }


def correr(db: Any, dry_run: bool = False, *, dias: int = 7) -> list[dict[str, Any]]:
    """Punto de entrada de la etapa `stages/cmf_hechos.py`."""
    adapter = CmfHechosAdapter(dias=dias, dry_run=dry_run)
    return [adapter.run(db)]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Hechos esenciales CMF -> cl_material_events")
    parser.add_argument("--dry-run", action="store_true", help="Sin escribir en Supabase")
    parser.add_argument("--html", type=Path, default=None, help="Parsear un HTML local (sin red)")
    args = parser.parse_args(argv)

    if args.html:
        registros = dedupe_hechos(parse_hechos(args.html.read_text(encoding="utf-8")))
        print(f"{len(registros)} hechos de {args.html}")
        for fila in registros[:10]:
            print(
                f"  {fila['fecha']} {fila['numero_documento']} "
                f"[{fila['categoria']}] {fila['titulo'][:70]}"
            )
        return 0

    adapter = CmfHechosAdapter(dry_run=args.dry_run)
    try:
        resumen = adapter.run(None if args.dry_run else _db())
    except CmfBlocked as exc:
        print(f"[{NAME}] CmfBlocked: {exc}", file=sys.stderr)
        return 2
    print(resumen)
    return 0


def _db() -> Any:
    raiz = Path(__file__).resolve().parent
    if str(raiz) not in sys.path:
        sys.path.insert(0, str(raiz))
    from base import get_db

    return get_db()


if __name__ == "__main__":
    raise SystemExit(main())
