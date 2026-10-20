"""12 mayores accionistas de emisores chilenos (CMF) -> `cl_top_shareholders`.

Fuente (verificada en vivo el 2026-10-19):
  https://www.cmfchile.cl/institucional/mercados/entidad.php
      ?control=svs&grupo=&mercado=V&pestania=5&row=&rut=96766110
      &tipoentidad=RVEMI&vig=VI

  La pestania 5 de la ficha de un emisor muestra "12 Mayores Accionistas":
  periodo informado (mm / aaaa), razon social y RUT del emisor, y una tabla
  con Nombre, Numero de acciones suscritas, Numero de acciones pagadas y
  % de propiedad. Sin login ni captcha.

  El formulario de la pagina permite consultar periodos historicos con un
  POST a la misma URL (campos `mm` y `aa`). El adaptador acepta `periodo`
  ("2026-09") para reconstruir trimestre a trimestre.

RUT -> nemotecnico: se reutiliza el mapa verificado de F15
(`data/infoprobidad/rut_nemotecnico.json`). Solo se consultan las emisoras
con nemotecnico; las que no cotizan quedan fuera de la etapa.

Datos: informacion publica y oficial de la CMF. Si la CMF publica una
persona natural como accionista, se muestra tal cual la publica la fuente,
sin cruzarla con otras bases ni inferir datos adicionales (Leyes 19.628 y
21.719). Dato informativo: no ejecuta ordenes ni es recomendacion.

No usa el MCP de terceros mcp-cmf-chile.
"""

from __future__ import annotations

import argparse
import html as html_lib
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any, Iterable

from cmf_client import BASE_URL, CmfBlocked, CmfClient, build_url

NAME = "cmf_accionistas"
ENTIDAD_PATH = "/institucional/mercados/entidad.php"
TABLE = "cl_top_shareholders"
FUENTE = "cmf"
MAX_ACCIONISTAS = 12

# Una fila por emisor + periodo + accionista (on_conflict del upsert).
CONFLICT_COLUMNS = "rut_emisor,periodo,accionista"

MESES_VALIDOS = ("03", "06", "09", "12")

# La ficha usa un tipo de entidad distinto segun el emisor: los bancos
# responden con `BANCO` (RVEMI devuelve "Sin informacion"). Se prueban en
# orden y se conserva la primera ficha que trae la tabla.
TIPOS_ENTIDAD = ("RVEMI", "BANCO", "RVSOC")

_DL_RE = re.compile(r'<dl[^>]*id="datos_ent"[^>]*>(.*?)</dl>', re.DOTALL | re.IGNORECASE)
_DT_DD_RE = re.compile(
    r"<dt[^>]*>(.*?)</dt>\s*<dd[^>]*>(.*?)</dd>", re.DOTALL | re.IGNORECASE
)
_SECCION_RE = re.compile(
    r"12\s+Mayores\s+Accionistas(.*?)(?:end\s+inc/propiedad|$)",
    re.DOTALL | re.IGNORECASE,
)
_PERIODO_RE = re.compile(
    r"Per[ií]odo:\s*</strong>\s*(\d{1,2})\s*/\s*(\d{4})",
    re.DOTALL | re.IGNORECASE,
)
_TR_RE = re.compile(r"<tr\b[^>]*>(.*?)</tr>", re.DOTALL | re.IGNORECASE)
_TD_RE = re.compile(r"<td\b[^>]*>(.*?)</td>", re.DOTALL | re.IGNORECASE)
_TAG_RE = re.compile(r"<[^>]+>", re.DOTALL)
_NUM_RE = re.compile(r"-?\d[\d.,]*")


# --------------------------------------------------------------------------
# Utilidades
# --------------------------------------------------------------------------


def _clean(fragment: str) -> str:
    """Quita tags/entidades y colapsa espacios."""
    texto = _TAG_RE.sub(" ", fragment or "")
    texto = html_lib.unescape(texto)
    texto = texto.replace("\xa0", " ")
    return re.sub(r"\s+", " ", texto).strip()


def _norm(texto: str) -> str:
    base = unicodedata.normalize("NFKD", texto or "")
    sin_tildes = "".join(c for c in base if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", sin_tildes.strip().lower())


def rut_key(raw: str) -> str:
    """RUT sin puntos ni DV: '96.766.110-4' -> '96766110'.

    Es la misma clave del mapa de F15 (`infoprobidad.rut_key`). La CMF
    publica el RUT con guion y DV; el mapa guarda solo el cuerpo.
    """
    text = (raw or "").strip()
    if text.endswith(".0"):
        text = text[:-2]
    text = text.replace(".", "").replace(" ", "")
    if "-" in text:
        text = text.split("-", 1)[0]
    digits = "".join(ch for ch in text if ch.isdigit())
    if not digits:
        return ""
    # Sin guion: un cuerpo de 7-8 digitos + DV llega como 8-9 digitos.
    if len(digits) == 9:
        digits = digits[:8]
    return digits.lstrip("0") or "0"


def _entero(raw: str) -> int | None:
    """'2.022.712' -> 2022712; '' -> None."""
    match = _NUM_RE.search(_clean(raw))
    if not match:
        return None
    digits = re.sub(r"[^\d-]", "", match.group(0))
    if not digits or digits == "-":
        return None
    try:
        return int(digits)
    except ValueError:
        return None


def _porcentaje(raw: str) -> float | None:
    """'69,75%' -> 69.75. El 0 de la CMF se conserva como 0.0."""
    texto = _clean(raw).replace("%", "").strip()
    if not texto:
        return None
    if "," in texto:
        texto = texto.replace(".", "").replace(",", ".")
    else:
        # Sin coma: 69.75 o 69 (no usar separador de miles).
        texto = texto.replace(",", "")
    try:
        return float(texto)
    except ValueError:
        return None


def _periodo(mm: str, aa: str) -> str | None:
    mes = (mm or "").strip().zfill(2)
    anio = (aa or "").strip()
    if mes not in MESES_VALIDOS or not re.fullmatch(r"\d{4}", anio):
        return None
    return f"{anio}-{mes}"


def periodo_de(html: str) -> str | None:
    """Periodo informado por la CMF ('09 / 2026' -> '2026-09')."""
    match = _PERIODO_RE.search(html_lib.unescape(html or ""))
    if not match:
        return None
    return _periodo(match.group(1), match.group(2))


def _datos_emisor(html: str) -> dict[str, str]:
    bloque = _DL_RE.search(html_lib.unescape(html or ""))
    datos: dict[str, str] = {}
    if not bloque:
        return datos
    for match in _DT_DD_RE.finditer(bloque.group(1)):
        clave = _norm(_clean(match.group(1))).rstrip(":")
        valor = _clean(match.group(2))
        if clave:
            datos[clave] = valor
    return datos


# --------------------------------------------------------------------------
# Parser
# --------------------------------------------------------------------------


def parse_accionistas(
    html: str,
    *,
    rut_emisor: str | None = None,
    nemo: str | None = None,
) -> list[dict[str, Any]]:
    """Convierte la pestania 5 de la ficha CMF en filas de accionistas.

    Devuelve [] si la pagina no trae la tabla o no se puede determinar el
    periodo. El `%` queda como numero (69,75 -> 69.75); 0 de la CMF se
    conserva como 0.0 porque significa "no calculado o no significativo".
    """
    if not html:
        return []

    texto = html_lib.unescape(html)
    periodo = periodo_de(texto)
    if not periodo:
        return []

    datos = _datos_emisor(texto)
    rut = rut_key(rut_emisor or datos.get("rut", ""))
    razon_social = datos.get("razon social", "")
    if not rut:
        return []

    seccion = _SECCION_RE.search(texto)
    if not seccion:
        return []

    filas: list[dict[str, Any]] = []
    vistos: set[str] = set()
    for match in _TR_RE.finditer(seccion.group(1)):
        celdas = [_clean(c) for c in _TD_RE.findall(match.group(1))]
        if len(celdas) != 4:
            continue
        accionista = celdas[0]
        if not accionista:
            continue
        clave = _norm(accionista)
        if clave in vistos:
            continue
        vistos.add(clave)
        filas.append(
            {
                "rut_emisor": rut,
                "nemo": (nemo or "").strip().upper() or None,
                "razon_social": razon_social or None,
                "periodo": periodo,
                "ranking": len(filas) + 1,
                "accionista": accionista,
                "porcentaje_propiedad": _porcentaje(celdas[3]),
                "acciones_suscritas": _entero(celdas[1]),
                "acciones_pagadas": _entero(celdas[2]),
                "fuente": FUENTE,
            }
        )
        if len(filas) >= MAX_ACCIONISTAS:
            break
    return filas


def dedupe_accionistas(registros: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Una fila por (rut_emisor, periodo, accionista), sin distinguir mayusculas."""
    vistos: set[tuple[str, str, str]] = set()
    salida: list[dict[str, Any]] = []
    for fila in registros:
        clave = (
            str(fila.get("rut_emisor", "")).strip(),
            str(fila.get("periodo", "")).strip(),
            _norm(str(fila.get("accionista", ""))),
        )
        if not all(clave):
            continue
        if clave in vistos:
            continue
        vistos.add(clave)
        salida.append(fila)
    return salida


# --------------------------------------------------------------------------
# Adaptador
# --------------------------------------------------------------------------


def entidad_params(rut: str, tipoentidad: str = "RVEMI") -> dict[str, str]:
    """Parametros GET de la ficha CMF en la pestania 5."""
    return {
        "control": "svs",
        "grupo": "",
        "mercado": "V",
        "pestania": "5",
        "row": "",
        "rut": rut_key(rut),
        "tipoentidad": tipoentidad,
        "vig": "VI",
    }


def source_url(rut: str, tipoentidad: str = "RVEMI") -> str:
    """URL publica de la ficha (el periodo historico va por POST)."""
    return build_url(ENTIDAD_PATH, entidad_params(rut, tipoentidad))


def tiene_ficha(html: str) -> bool:
    """True si la respuesta trae la tabla de mayores accionistas con periodo."""
    return bool(periodo_de(html)) and "12 mayores accionistas" in (html or "").lower()


def _periodo_partes(periodo: str) -> tuple[str, str]:
    match = re.fullmatch(r"(\d{4})-(\d{2})", (periodo or "").strip())
    if not match:
        raise ValueError(f"periodo invalido: {periodo!r} (usa YYYY-MM)")
    anio, mes = match.groups()
    if mes not in MESES_VALIDOS:
        raise ValueError(f"periodo invalido: {periodo!r} (mes 03, 06, 09 o 12)")
    return mes, anio


def load_emisores(rut_map: dict[str, str | None] | None = None) -> list[tuple[str, str]]:
    """(rut, nemotecnico) de las emisoras con symbol del mapa de F15."""
    if rut_map is None:
        # Reutiliza el mapa verificado por F15 (incluye solo emisoras cotizadas).
        from infoprobidad import load_rut_map

        rut_map = load_rut_map()
    emisores: list[tuple[str, str]] = []
    for rut, symbol in sorted(rut_map.items()):
        if not symbol:
            continue
        emisores.append((rut_key(rut), str(symbol).strip().upper()))
    return emisores


class CmfAccionistasAdapter:
    """Descarga y normaliza los 12 mayores accionistas por emisor."""

    name = NAME
    table = TABLE

    def __init__(
        self,
        *,
        periodo: str | None = None,
        emisores: list[tuple[str, str]] | None = None,
        dry_run: bool = False,
        client: CmfClient | None = None,
        max_emisores: int | None = None,
    ) -> None:
        if periodo:
            _periodo_partes(periodo)
        self.periodo = periodo
        self.emisores = list(emisores) if emisores is not None else None
        self.dry_run = dry_run
        self.client = client or CmfClient()
        self.max_emisores = max_emisores
        self._url_por_rut: dict[str, str] = {}

    def emisores_a_consultar(self) -> list[tuple[str, str]]:
        lista = self.emisores if self.emisores is not None else load_emisores()
        if self.max_emisores is not None:
            lista = lista[: max(0, int(self.max_emisores))]
        return lista

    def url(self, rut: str) -> str:
        return self._url_por_rut.get(rut_key(rut)) or source_url(rut)

    def fetch_raw(self, rut: str) -> str:
        """Baja la ficha probando los tipos de entidad de la CMF.

        Con periodo usa POST (el formulario historico de la CMF). Guarda la
        URL que trajo la tabla para el `source_url` del upsert.
        """
        mes_anio = _periodo_partes(self.periodo) if self.periodo else None
        ultimo = ""
        for tipo in TIPOS_ENTIDAD:
            params = entidad_params(rut, tipo)
            if mes_anio:
                mes, anio = mes_anio
                ultimo = self.client.post(
                    BASE_URL + ENTIDAD_PATH,
                    data={"mm": mes, "aa": anio},
                    params=params,
                )
            else:
                ultimo = self.client.get(BASE_URL + ENTIDAD_PATH, params=params)
            if tiene_ficha(ultimo):
                self._url_por_rut[rut_key(rut)] = source_url(rut, tipo)
                return ultimo
        self._url_por_rut.setdefault(rut_key(rut), source_url(rut))
        return ultimo

    def normalize(
        self, html: str, *, rut: str, nemo: str | None = None
    ) -> list[dict[str, Any]]:
        return dedupe_accionistas(
            parse_accionistas(html, rut_emisor=rut, nemo=nemo)
        )

    def run(self, db: Any = None) -> dict[str, Any]:
        if not self.dry_run and db is None:
            raise RuntimeError("CmfAccionistasAdapter.run necesita un cliente Supabase")

        emisores = self.emisores_a_consultar()
        resumen: dict[str, Any] = {
            "source": self.name,
            "periodo": self.periodo,
            "emisores": len(emisores),
            "accionistas": 0,
            "ok": 0,
            "empty": 0,
            "errores": [],
            "status": "ok",
        }

        for rut, nemo in emisores:
            try:
                html = self.fetch_raw(rut)
            except CmfBlocked:
                raise
            except Exception as exc:  # noqa: BLE001 - una emisora no tumba la etapa
                resumen["errores"].append({"rut": rut, "error": str(exc)[:300]})
                continue

            registros = self.normalize(html, rut=rut, nemo=nemo)
            if not registros:
                resumen["empty"] += 1
                continue

            resumen["ok"] += 1
            resumen["accionistas"] += len(registros)
            if not self.dry_run:
                self._upsert(db, registros, rut)

        if not emisores:
            resumen["status"] = "empty"
        elif resumen["ok"] == 0:
            resumen["status"] = "empty"
        if resumen["errores"]:
            resumen["status"] = "partial"
        if self.dry_run:
            resumen["dry_run"] = True
        return resumen

    def _upsert(self, db: Any, registros: list[dict[str, Any]], rut: str) -> None:
        url = self.url(rut)
        payload = [{**self._record(fila), "source_url": url} for fila in registros]
        db.table(self.table).upsert(
            payload,
            on_conflict=CONFLICT_COLUMNS,
            ignore_duplicates=True,
        ).execute()

    @staticmethod
    def _record(fila: dict[str, Any]) -> dict[str, Any]:
        return {
            "rut_emisor": fila["rut_emisor"],
            "nemo": fila.get("nemo"),
            "razon_social": fila.get("razon_social"),
            "periodo": fila["periodo"],
            "ranking": fila.get("ranking"),
            "accionista": fila["accionista"],
            "porcentaje_propiedad": fila.get("porcentaje_propiedad"),
            "acciones_suscritas": fila.get("acciones_suscritas"),
            "acciones_pagadas": fila.get("acciones_pagadas"),
            "fuente": fila.get("fuente") or FUENTE,
        }


def correr(
    db: Any,
    dry_run: bool = False,
    *,
    periodo: str | None = None,
) -> list[dict[str, Any]]:
    """Punto de entrada de la etapa `stages/cmf_accionistas.py`."""
    adapter = CmfAccionistasAdapter(periodo=periodo, dry_run=dry_run)
    return [adapter.run(db)]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="12 mayores accionistas CMF -> cl_top_shareholders"
    )
    parser.add_argument("--dry-run", action="store_true", help="Sin escribir en Supabase")
    parser.add_argument("--rut", default=None, help="RUT del emisor (sin DV o con DV)")
    parser.add_argument(
        "--periodo", default=None, help="Periodo historico YYYY-MM (03, 06, 09 o 12)"
    )
    parser.add_argument("--limit", type=int, default=None, help="Maximo de emisores")
    parser.add_argument("--html", type=Path, default=None, help="Parsear un HTML local (sin red)")
    args = parser.parse_args(argv)

    if args.html:
        registros = dedupe_accionistas(
            parse_accionistas(
                args.html.read_text(encoding="utf-8"),
                rut_emisor=args.rut,
            )
        )
        print(f"{len(registros)} accionistas de {args.html}")
        for fila in registros:
            print(
                f"  {fila['ranking']:2d}. {fila['accionista']:40s} "
                f"{fila.get('porcentaje_propiedad')}% periodo={fila['periodo']}"
            )
        return 0

    emisores = None
    if args.rut:
        emisores = [(rut_key(args.rut), "")]
    adapter = CmfAccionistasAdapter(
        periodo=args.periodo,
        emisores=emisores,
        dry_run=args.dry_run,
        max_emisores=args.limit,
    )
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
