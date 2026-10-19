"""Carteras recomendadas de BICE y MBI a partir de sus PDF públicos.

Se guardan solo el nemotécnico, el peso, la fecha del informe y la URL.
El PDF no se sube a la base: no hay columna para el archivo. La migración
024 deja la foto de octubre 2026 y el portafolio agregado
`consenso-corredoras-cl`; este módulo calcula ese consenso con
`build_consenso` (solo carteras completas).

El aviso legal vive en `src/components/source-panels/corredoras-cl.tsx`
(F16/F24). Esto no ejecuta órdenes ni arma una recomendación personalizada:
es el reporte público de la corredora.
"""

from __future__ import annotations

import io
import json
import re
import unicodedata
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Iterable, Mapping

from base import Holding, SourceAdapter, log

try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover
    PdfReader = None  # type: ignore

# Fotografia de las carteras usada por el seed (024) y por los tests.
# No es la fuente en vivo: los adaptadores siguen leyendo los PDF publicos.
DATOS_CARTERAS = (
    Path(__file__).resolve().parent / "data" / "v2" / "F23" / "carteras_oct_2026.json"
)

# Carteras que no entran al consenso hasta verificar que sus pesos sigan
# vigentes. Renta 4 y BTG tienen holdings cargados por etapas antiguas:
# sus fechas de corte no son octubre 2026. Se dejan fuera a proposito.
CORREDORAS_FUERA_DEL_CONSENSO = ("renta4", "btg")

# URL fija. BICE reemplaza el archivo en el mismo path.
BICE_PDF_URL = (
    "https://mercadosenlinea.biceinversiones.cl/reportes/cartera-inversiones-bice.pdf"
)

# El listado sale de más nuevo a más viejo. La cartera es la primera nota
# cuyo slug empieza por cartera-recomendada-. El PDF vive en esa nota,
# bajo /static/uploads/docs/<fecha>_<nombre>.pdf. Un informe de compañía
# (por ejemplo BSANTANDER) tiene otro slug y no se sigue.
MBI_BASE = "https://corredores.mbi.cl"
MBI_PUBLICACIONES_URL = f"{MBI_BASE}/publicaciones"

# Nombre publicado -> nemotécnico BCS. Chile, Santander, LTM/Latam y
# Enel Chile no coinciden con el código de bolsa.
ALIAS_NEMOTECNICO: dict[str, str] = {
    "CHILE": "CHILE",
    "BANCO CHILE": "CHILE",
    "BANCO DE CHILE": "CHILE",
    "SANTANDER": "BSANTANDER",
    "BANCO SANTANDER": "BSANTANDER",
    "BSANTANDER": "BSANTANDER",
    "LTM": "LTM",
    "LATAM": "LTM",
    "LATAM AIRLINES": "LTM",
    "ENEL CHILE": "ENELCHILE",
    "ENELCHILE": "ENELCHILE",
    "FALABELLA": "FALABELLA",
    "SQM-B": "SQM-B",
    "SQM B": "SQM-B",
    "BCI": "BCI",
    "COPEC": "COPEC",
    "ITAUCL": "ITAUCL",
    "ITAU": "ITAUCL",
    "CENCOMALLS": "CENCOMALLS",
    "CENCO MALLS": "CENCOMALLS",
    "CENCOSUD SHOPPING": "CENCOMALLS",
    "PARAUCO": "PARAUCO",
    "PARQUE ARAUCO": "PARAUCO",
}

NOMBRE_VISIBLE: dict[str, str] = {
    "FALABELLA": "Falabella",
    "LTM": "LATAM Airlines",
    "SQM-B": "SQM-B",
    "CHILE": "Banco de Chile",
    "BSANTANDER": "Banco Santander",
    "BCI": "BCI",
    "ENELCHILE": "Enel Chile",
    "COPEC": "Copec",
    "ITAUCL": "Itaú Corpbanca",
    "CENCOMALLS": "Cencosud Shopping",
    "PARAUCO": "Parque Arauco",
}

# Filas que no son una acción. La columna "Actual" de BICE trae el peso
# vigente seguido de ↑ ↓ = ●. La columna "Anterior" queda a la derecha
# y no se lee: el patrón está anclado al inicio de la línea.
_FILAS_IGNORADAS = {"TOTAL", "CARTERA", "IPSA", "IPSA INDEX", "YTD"}

_MESES = {
    "enero": 1,
    "febrero": 2,
    "marzo": 3,
    "abril": 4,
    "mayo": 5,
    "junio": 6,
    "julio": 7,
    "agosto": 8,
    "septiembre": 9,
    "setiembre": 9,
    "octubre": 10,
    "noviembre": 11,
    "diciembre": 12,
}

# "Falabella 20,0% ↑" — solo la columna vigente.
_BICE_FILA_RE = re.compile(
    r"^(?P<nombre>[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 .'\-]{0,40}?)"
    r"\s+"
    r"(?P<peso>\d{1,3}(?:[.,]\d{1,2})?)"
    r"\s*%"
    r"\s*"
    r"(?P<marca>[\u2191\u2193\u25cf\u2022\u25b2\u25bc=])"
)

# Dos formas de salir del PDF, según cómo pypdf ordene las columnas.
# 1) Columna de fichas primero: "Recomendación / ITAUCL / Mantener".
# 2) Texto ya mezclado (el .txt de octubre): el nemotécnico cierra una
#    línea y, un poco más abajo, va "Recomendación Comprar".
# Sobreponderar es un informe de una sola acción y no entra aquí.
_MBI_FICHA_RE = re.compile(
    r"Recomendaci[oó]n\s+"
    r"(?P<nemotecnico>[A-Z][A-Z0-9]{1,12}(?:-[A-Z0-9]{1,4})?)"
    r"\s+"
    r"(?:Comprar|Mantener|Vender)\b"
)
_MBI_RECOMENDACION_RE = re.compile(
    r"Recomendaci[oó]n\s*:?\s+(?:Comprar|Mantener|Vender)\b"
)
_MBI_TOKEN_RE = re.compile(
    r"(?<![A-Z0-9])([A-Z][A-Z0-9]{1,12}(?:-[A-Z0-9]{1,4})?)"
)
# Siglas del relato, no de la cartera. Si caen justo antes de la
# recomendación, se salta al nemotécnico anterior.
_MBI_RUIDO = {
    "MBI",
    "IPC",
    "FOMC",
    "IPSA",
    "FED",
    "USA",
    "UF",
    "TPM",
    "PIB",
    "ROE",
    "NIM",
    "ADR",
    "USD",
    "CLP",
    "ETF",
    "CMF",
    "APV",
    "EPS",
}

_BICE_FECHA_RE = re.compile(
    r"(?P<dia>\d{1,2})\s+de\s+(?P<mes>enero|febrero|marzo|abril|mayo|junio|"
    r"julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)"
    r"\s+de\s+(?P<anio>\d{4})",
    re.IGNORECASE,
)
_MBI_FECHA_RE = re.compile(r"(?P<dia>\d{2})/(?P<mes>\d{2})/\s*(?P<anio>\d{4})")

_NOTA_CARTERA_RE = re.compile(
    r"""href=["'](?P<href>/publicaciones/cartera-recomendada-[^"'#?\s]+)["']""",
    re.IGNORECASE,
)
_PDF_NOTA_RE = re.compile(
    r"""href=["'](?P<href>/static/uploads/docs/[^"'#\s]+\.pdf(?:\?[^"']*)?)["']""",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class Posicion:
    symbol: str
    weight: float
    name: str


def _clave(nombre: str) -> str:
    """Mayúsculas, sin tildes ni 'S.A.', para buscar en el alias."""
    base = unicodedata.normalize("NFKD", nombre)
    sin_tilde = "".join(c for c in base if not unicodedata.combining(c))
    limpio = sin_tilde.upper().replace(".", " ")
    limpio = re.sub(r"\bS\s*A\b", "", limpio)
    return " ".join(limpio.split())


def nemotecnico(nombre: str) -> str:
    """Resuelve el alias. Si el nombre ya es un código, lo deja igual."""
    clave = _clave(nombre)
    if clave in ALIAS_NEMOTECNICO:
        return ALIAS_NEMOTECNICO[clave]
    compacto = clave.replace(" ", "")
    if re.fullmatch(r"[A-Z0-9]+(?:-[A-Z0-9]+)?", compacto):
        return compacto
    log(f"[corredoras_cl] sin alias: {nombre!r} -> {compacto[:12]}")
    return compacto[:12]


def _fecha(anio: int, mes: int, dia: int) -> date | None:
    try:
        return date(anio, mes, dia)
    except ValueError:
        return None


def fecha_bice(texto: str) -> date | None:
    """Primera fecha '5 de octubre de 2026' del informe."""
    if not texto:
        return None
    hallazgo = _BICE_FECHA_RE.search(texto)
    if not hallazgo:
        return None
    mes = _MESES.get(hallazgo.group("mes").lower())
    if mes is None:
        return None
    return _fecha(int(hallazgo.group("anio")), mes, int(hallazgo.group("dia")))


def fecha_mbi(texto: str) -> date | None:
    """Primera fecha DD/MM/AAAA. Tolera el espacio de '05/10/ 2026'."""
    if not texto:
        return None
    hallazgo = _MBI_FECHA_RE.search(texto)
    if not hallazgo:
        return None
    return _fecha(
        int(hallazgo.group("anio")),
        int(hallazgo.group("mes")),
        int(hallazgo.group("dia")),
    )


def parse_bice(texto: str) -> list[Posicion]:
    """Filas 'Falabella 20,0% ↑' de la columna Actual. Pesos publicados."""
    if not texto:
        return []

    posiciones: list[Posicion] = []
    vistos: set[str] = set()
    for linea in texto.splitlines():
        hallazgo = _BICE_FILA_RE.match(linea.strip())
        if not hallazgo:
            continue
        nombre = " ".join(hallazgo.group("nombre").split())
        if _clave(nombre) in _FILAS_IGNORADAS:
            continue
        simbolo = nemotecnico(nombre)
        if not simbolo or simbolo in vistos:
            continue
        peso = round(float(hallazgo.group("peso").replace(",", ".")), 2)
        if not (0 < peso <= 100):
            continue
        vistos.add(simbolo)
        posiciones.append(Posicion(symbol=simbolo, weight=peso, name=nombre))
    return posiciones


def pesos_iguales(cantidad: int) -> list[float]:
    """Reparte 100% en centésimas. El residuo queda en las primeras filas."""
    if cantidad <= 0:
        return []
    centimos = 10000
    base, residuo = divmod(centimos, cantidad)
    return [
        (base + (1 if indice < residuo else 0)) / 100
        for indice in range(cantidad)
    ]


def _nemotecnico_antes_de(texto: str, posicion: int) -> str | None:
    """Último código al cierre de una línea, en la ventana previa."""
    ventana = texto[max(0, posicion - 500) : posicion]
    candidatos: list[str] = []
    for hallazgo in _MBI_TOKEN_RE.finditer(ventana):
        resto = ventana[hallazgo.end() :].split("\n", 1)[0]
        if resto.strip() != "":
            continue
        token = hallazgo.group(1)
        if token in _MBI_RUIDO:
            continue
        candidatos.append(token)
    if not candidatos:
        return None
    return candidatos[-1]


def parse_mbi(texto: str) -> list[Posicion]:
    """Bloques 'COPEC Recomendación Comprar'. Igual peso entre ellas.

    Comprar, Mantener y Vender cuentan: la cartera de octubre trae las
    cinco, ITAUCL con Mantener. Sobreponderar queda fuera: es el vocabulario
    del informe de una sola compañía, no de la cartera.
    """
    if not texto:
        return []

    simbolos: list[str] = []
    vistos: set[str] = set()

    def _agregar(crudo: str) -> None:
        simbolo = nemotecnico(crudo)
        if not simbolo or simbolo in vistos or simbolo in _MBI_RUIDO:
            return
        vistos.add(simbolo)
        simbolos.append(simbolo)

    fichas = list(_MBI_FICHA_RE.finditer(texto))
    if fichas:
        for hallazgo in fichas:
            _agregar(hallazgo.group("nemotecnico"))
    else:
        for hallazgo in _MBI_RECOMENDACION_RE.finditer(texto):
            crudo = _nemotecnico_antes_de(texto, hallazgo.start())
            if crudo:
                _agregar(crudo)

    pesos = pesos_iguales(len(simbolos))
    return [
        Posicion(
            symbol=simbolo,
            weight=peso,
            name=NOMBRE_VISIBLE.get(simbolo, simbolo),
        )
        for simbolo, peso in zip(simbolos, pesos)
    ]


def cargar_carteras(ruta: str | Path | None = None) -> list[dict[str, Any]]:
    """Lee la fotografia JSON de carteras (por defecto, octubre 2026)."""
    archivo = Path(ruta) if ruta is not None else DATOS_CARTERAS
    data = json.loads(archivo.read_text(encoding="utf-8"))
    return list(data.get("carteras", []))


def _esta_fuera_del_consenso(corredora: str) -> bool:
    """Renta 4 y BTG quedan fuera hasta confirmar que sus pesos vigentes."""
    compacto = _clave(corredora).replace(" ", "")
    return any(compacto.startswith(fuera) for fuera in CORREDORAS_FUERA_DEL_CONSENSO)


def _pesos_de(cartera: Mapping[str, Any]) -> dict[str, float]:
    """Pesos publicados de una cartera completa, normalizados a nemotecnico."""
    pesos = cartera.get("pesos") or {}
    return {
        nemotecnico(simbolo): round(float(peso), 2)
        for simbolo, peso in pesos.items()
    }


def build_consenso(
    carteras: Iterable[Mapping[str, Any]] | str | Path | None = None,
) -> list[Posicion]:
    """Promedio simple entre las corredoras con `completa=true`.

    Cada corredora pesa lo mismo. Un simbolo ausente en una cartera completa
    cuenta como 0% para esa corredora: no se renormaliza. Las carteras
    parciales (Itau, Credicorp) se ignoran por completo; se consultan con
    `referencia_parciales`. Renta 4 y BTG tampoco entran hasta verificar que
    sus pesos esten vigentes.
    """
    if carteras is None or isinstance(carteras, (str, Path)):
        carteras = cargar_carteras(carteras)
    elif isinstance(carteras, Mapping):
        carteras = carteras.get("carteras", [])

    completas = [
        cartera
        for cartera in carteras
        if cartera.get("completa") is True
        and not _esta_fuera_del_consenso(cartera.get("corredora", ""))
    ]
    if not completas:
        return []

    totales: dict[str, float] = {}
    for cartera in completas:
        for simbolo, peso in _pesos_de(cartera).items():
            totales[simbolo] = totales.get(simbolo, 0.0) + peso

    cantidad = len(completas)
    posiciones = [
        Posicion(
            symbol=simbolo,
            weight=round(total / cantidad, 2),
            name=NOMBRE_VISIBLE.get(simbolo, simbolo),
        )
        for simbolo, total in totales.items()
        if total > 0
    ]
    posiciones.sort(key=lambda posicion: (-posicion.weight, posicion.symbol))
    return posiciones


def referencia_parciales(
    carteras: Iterable[Mapping[str, Any]] | str | Path | None = None,
) -> list[dict[str, Any]]:
    """Carteras incompletas: se muestran como referencia, no promedian."""
    if carteras is None or isinstance(carteras, (str, Path)):
        carteras = cargar_carteras(carteras)
    elif isinstance(carteras, Mapping):
        carteras = carteras.get("carteras", [])

    referencia: list[dict[str, Any]] = []
    for cartera in carteras:
        if cartera.get("completa") is not False:
            continue
        referencia.append(
            {
                "corredora": cartera.get("corredora", ""),
                "fecha": cartera.get("fecha", ""),
                "fuente": cartera.get("fuente", ""),
                "pesos": _pesos_de({"pesos": cartera.get("pesos_parciales", {})}),
                "nota": cartera.get("nota", ""),
            }
        )
    return referencia


def nota_cartera_mbi(html: str) -> str | None:
    """Primer href /publicaciones/cartera-recomendada-* del listado."""
    if not html:
        return None
    hallazgo = _NOTA_CARTERA_RE.search(html)
    return hallazgo.group("href") if hallazgo else None


def pdf_de_nota_mbi(html: str) -> str | None:
    """Href del PDF adjunto en la nota de la cartera."""
    if not html:
        return None
    hallazgo = _PDF_NOTA_RE.search(html)
    return hallazgo.group("href") if hallazgo else None


def url_absoluta_mbi(href: str) -> str:
    if href.startswith("http://") or href.startswith("https://"):
        return href
    return f"{MBI_BASE}{href}"


def texto_pdf(contenido: bytes) -> str:
    if PdfReader is None:
        log("[corredoras_cl] pypdf no instalado — pip install pypdf")
        return ""
    try:
        lector = PdfReader(io.BytesIO(contenido))
        return "\n".join(pagina.extract_text() or "" for pagina in lector.pages)
    except Exception as exc:  # noqa: BLE001 — el PDF puede venir truncado
        log(f"[corredoras_cl] no se pudo leer el PDF: {exc}")
        return ""


def _es_pdf(contenido: bytes, content_type: str) -> bool:
    if contenido.startswith(b"%PDF"):
        return True
    return "pdf" in content_type.lower()


class _CarteraPdfAdapter(SourceAdapter):
    """Descarga un PDF, lo parsea y, en seco, no escribe."""

    source_url: str | None = None

    def __init__(self, dry_run: bool = False) -> None:
        super().__init__(dry_run=dry_run)
        self.source_url = None
        self.as_of: date | None = None

    def run(self, db: Any = None) -> dict[str, Any]:
        resumen = super().run(db)
        resumen["source_url"] = self.source_url
        if self.as_of is not None:
            resumen["as_of"] = self.as_of.isoformat()
        return resumen

    def _bajar(self, url: str) -> bytes | None:
        try:
            respuesta = self.client.get(url)
            respuesta.raise_for_status()
        except Exception as exc:  # noqa: BLE001 — red frágil, la etapa no es crítica
            log(f"[{self.name}] no se pudo bajar {url}: {exc}")
            return None
        tipo = respuesta.headers.get("content-type", "")
        if not _es_pdf(respuesta.content, tipo):
            log(f"[{self.name}] {url} no es un PDF ({tipo})")
            return None
        return respuesta.content


class BiceCarteraAdapter(_CarteraPdfAdapter):
    name = "bice_cartera"
    portfolio_slug = "bice-acciones-destacadas"

    def __init__(self, dry_run: bool = False) -> None:
        super().__init__(dry_run=dry_run)
        self.source_url = BICE_PDF_URL

    def fetch_raw(self) -> str:
        contenido = self._bajar(BICE_PDF_URL)
        if contenido is None:
            return ""
        return texto_pdf(contenido)

    def normalize(self, raw: str) -> list[Holding]:
        self.as_of = fecha_bice(raw)
        corte = self.as_of or date.today()
        return [
            Holding(
                symbol=posicion.symbol,
                name=posicion.name,
                weight=posicion.weight,
                asset_class="equity",
                exchange="BCS",
                currency="CLP",
                as_of=corte,
            )
            for posicion in parse_bice(raw)
        ]


class MbiCarteraAdapter(_CarteraPdfAdapter):
    name = "mbi_cartera"
    portfolio_slug = "mbi-acciones-recomendadas"

    def fetch_raw(self) -> str:
        try:
            listado = self.client.get(MBI_PUBLICACIONES_URL)
            listado.raise_for_status()
        except Exception as exc:  # noqa: BLE001
            log(f"[{self.name}] listado de publicaciones: {exc}")
            return ""

        nota = nota_cartera_mbi(listado.text)
        if not nota:
            log(f"[{self.name}] no hay nota cartera-recomendada en el listado")
            return ""

        nota_url = url_absoluta_mbi(nota)
        try:
            pagina = self.client.get(nota_url)
            pagina.raise_for_status()
        except Exception as exc:  # noqa: BLE001
            log(f"[{self.name}] nota {nota_url}: {exc}")
            return ""

        pdf_href = pdf_de_nota_mbi(pagina.text)
        if not pdf_href:
            log(f"[{self.name}] la nota no trae PDF en /static/uploads/docs/")
            return ""

        self.source_url = url_absoluta_mbi(pdf_href)
        contenido = self._bajar(self.source_url)
        if contenido is None:
            return ""
        return texto_pdf(contenido)

    def normalize(self, raw: str) -> list[Holding]:
        self.as_of = fecha_mbi(raw)
        corte = self.as_of or date.today()
        return [
            Holding(
                symbol=posicion.symbol,
                name=posicion.name,
                weight=posicion.weight,
                asset_class="equity",
                exchange="BCS",
                currency="CLP",
                as_of=corte,
            )
            for posicion in parse_mbi(raw)
        ]


def correr(db: Any, dry_run: bool) -> list[dict[str, Any]]:
    """BICE y MBI. Con dry_run no abre Supabase."""
    resultados: list[dict[str, Any]] = []
    for clase in (BiceCarteraAdapter, MbiCarteraAdapter):
        adaptador = clase(dry_run=dry_run)
        try:
            resultados.append(adaptador.run(db))
        except Exception as exc:  # noqa: BLE001 — etapa opcional
            log(f"[{clase.name}] {exc}")
            resultados.append(
                {
                    "source": clase.name,
                    "status": "error",
                    "dry_run": dry_run,
                    "error": str(exc),
                    "source_url": adaptador.source_url,
                }
            )
    return resultados
