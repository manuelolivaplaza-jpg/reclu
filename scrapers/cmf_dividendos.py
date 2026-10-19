"""Dividendos de emisores chilenos desde la CMF (calendario `cl_dividends`).

Pagina: `institucional/estadisticas/acc_dividendos_index.php` (formulario) y
`acc_dividendos1grid.php` (resultado). El resultado es una grilla de Google
Visualization con `dataAsJson` embebido:

    {cols:[ {id:'A',label:'Cuentas',...}, {id:'B',label:'<a ...>NEMO</a> DD/MM/YYYY',...} ],
     rows:[ {c:[{v:'RUT'},{v:'96.xxx.yyy-k'},...]},
            {c:[{v:'Nemotécnico o nombre corto'},...]},
            {c:[{v:'Fecha límite'},...]},
            {c:[{v:'Fecha de pago dividendos'},...]},
            {c:[{v:'Tipo de dividendo (1)'},...]},
            {c:[{v:'Dividendo por acción'},...]}, ... ]}

Es una grilla transpuesta: cada columna B.. = un emisor, las filas son los
campos. `parse_dividendos` la da vuelta a una lista de dividendos.

El WAF de la CMF bloquea datacenters: si `cmf_client` lanza `CmfBlocked`, la
etapa registra un `scraper_error` y sigue (ver `stages/cmf_dividendos.py`).

No usa el MCP de terceros mcp-cmf-chile.
"""

from __future__ import annotations

import argparse
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path
from typing import Any, Iterable

from cmf_client import BASE_URL, CmfBlocked, CmfClient, build_url

NAME = "cmf_dividendos"
GRID_PATH = "/institucional/estadisticas/acc_dividendos1grid.php"
INDEX_PATH = "/institucional/estadisticas/acc_dividendos_index.php"
TABLE = "cl_dividends"
FUENTE = "cmf"

# on_conflict del upsert (una fila por emisor + numero de dividendo + serie + pago).
CONFLICT_COLUMNS = "nemo,fecha_pago,numero_dividendo,serie"

TIPOS = {
    "1": "provisorio",
    "2": "definitivo",
    "3": "adicional",
}

# Campos de la grilla -> alias normalizados (sin tildes ni mayusculas).
FIELD_ALIASES: dict[str, tuple[str, ...]] = {
    "rut": ("rut",),
    "razon_social": ("razon social",),
    "nemo": ("nemotecnico o nombre corto", "nemotecnico"),
    "numero_dividendo": ("numero de dividendo",),
    "tipo_codigo": ("tipo de dividendo",),
    "serie": ("serie afecta",),
    "fecha_acuerdo": ("fecha acuerdo",),
    "fecha_cierre": ("fecha de cierre",),
    "fecha_limite": ("fecha limite",),
    "fecha_pago": ("fecha de pago dividendos", "fecha de pago"),
    "moneda": ("moneda",),
    "monto": ("dividendo por accion",),
    "tasa_cambio": ("tasa de cambio",),
}

_COLS_RE = re.compile(r"cols:\[(.*?)\]\s*,\s*rows:\[", re.DOTALL)
_ROWS_RE = re.compile(r"rows:\[(.*?)\]\}\]\}", re.DOTALL)
_COL_ITEM_RE = re.compile(
    r"\{id:'([^']*)'\s*,\s*label:'((?:\\.|[^'\\])*)'\s*,\s*type:'([^']*)'\}"
)
_ROW_ITEM_RE = re.compile(r"\{c:\[(.*?)\]\}", re.DOTALL)
_CELL_RE = re.compile(
    r"\{v:(?:'((?:\\.|[^'\\])*)'|([^,}]+?))(?:\s*,\s*f:'((?:\\.|[^'\\])*)')?\}"
)
_HREF_RE = re.compile(r"<a\b[^>]*>(.*?)</a>", re.DOTALL | re.IGNORECASE)
_DATE_RE = re.compile(r"(\d{1,2})/(\d{1,2})/(\d{4})")


# --------------------------------------------------------------------------
# Utilidades de parseo
# --------------------------------------------------------------------------


def _unescape(texto: str) -> str:
    return texto.replace("\\'", "'").replace('\\"', '"').replace("\\\\", "\\")


def _norm(texto: str) -> str:
    base = unicodedata.normalize("NFKD", texto or "")
    sin_tildes = "".join(c for c in base if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", sin_tildes.strip().lower())


def _num(raw: Any) -> float | None:
    """Convierte el valor crudo de la grilla a numero (None si no aplica)."""
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    texto = str(raw).strip().replace("$", "").replace("%", "")
    if not texto:
        return None
    if re.fullmatch(r"-?\d+", texto):
        return float(int(texto))
    if re.fullmatch(r"-?\d*\.\d+", texto):
        return float(texto)
    # Formato chileno: 1.234,56
    if re.fullmatch(r"-?\d{1,3}(?:\.\d{3})*(?:,\d+)?", texto):
        return float(texto.replace(".", "").replace(",", "."))
    return None


def _fecha(raw: Any) -> str | None:
    """DD/MM/YYYY (con hora opcional) -> ISO YYYY-MM-DD."""
    if raw is None:
        return None
    match = _DATE_RE.search(str(raw))
    if not match:
        return None
    dia, mes, anio = match.groups()
    try:
        return date(int(anio), int(mes), int(dia)).isoformat()
    except ValueError:
        return None


def _celda(raw: Any) -> Any:
    if raw is None:
        return ""
    texto = _unescape(str(raw)).strip()
    numero = _num(texto)
    if numero is not None and re.fullmatch(r"-?\d+(?:\.\d+)?", texto):
        return numero
    return texto


def _texto(raw: Any) -> str:
    """Texto estable para identificadores (numero de dividendo: 79, no 79.0)."""
    if raw is None:
        return ""
    if isinstance(raw, bool):
        return str(raw)
    if isinstance(raw, float) and raw.is_integer():
        return str(int(raw))
    if isinstance(raw, int):
        return str(raw)
    return str(raw).strip()


def _split_cells(row_block: str) -> list[Any]:
    celdas: list[Any] = []
    for match in _CELL_RE.finditer(row_block):
        quoted, bare, _formatted = match.groups()
        if quoted is not None:
            celdas.append(_celda(quoted))
        elif bare is not None:
            celdas.append(_celda(bare))
    return celdas


# --------------------------------------------------------------------------
# Parseo de la grilla
# --------------------------------------------------------------------------


def parse_dividendos(html: str) -> list[dict[str, Any]]:
    """Convierte el HTML de `acc_dividendos1grid.php` en dividendos."""
    if not html:
        return []

    cols_match = _COLS_RE.search(html)
    rows_match = _ROWS_RE.search(html)
    if rows_match and not cols_match:
        # Sin `rows:` no hay datos (pagina "No se encuentran datos").
        return []
    if not cols_match or not rows_match:
        return []

    columnas: list[dict[str, str]] = []
    for match in _COL_ITEM_RE.finditer(cols_match.group(1)):
        col_id, label, _tipo = match.groups()
        columnas.append({"id": col_id, "label": _unescape(label)})

    # Primer campo de cada fila = nombre del campo; el resto son valores.
    filas: dict[str, list[Any]] = {}
    orden: list[str] = []
    for match in _ROW_ITEM_RE.finditer(rows_match.group(1)):
        celdas = _split_cells(match.group(1))
        if not celdas:
            continue
        etiqueta = _norm(str(celdas[0]))
        if not etiqueta:
            continue
        orden.append(etiqueta)
        filas[etiqueta] = celdas[1:]

    if len(columnas) <= 1 or not orden:
        return []

    def valor(campo: str, indice: int) -> Any:
        for alias in FIELD_ALIASES[campo]:
            fila = next((f for f in orden if f.startswith(alias)), None)
            if fila is not None:
                valores = filas[fila]
                # celdas[0] es la etiqueta; la columna B es valores[0].
                if 0 <= indice - 1 < len(valores):
                    return valores[indice - 1]
        return None

    registros: list[dict[str, Any]] = []
    for indice in range(1, len(columnas)):  # la columna A es "Cuentas"
        razon_social = str(valor("razon_social", indice) or "").strip()
        nemo = str(valor("nemo", indice) or "").strip() or razon_social
        if not nemo:
            continue

        fecha_pago = _fecha(valor("fecha_pago", indice))
        fecha_limite = _fecha(valor("fecha_limite", indice))
        if not fecha_pago:
            # `fecha_pago` es NOT NULL en cl_dividends y parte de la clave unica.
            continue

        tipo_codigo = _texto(valor("tipo_codigo", indice))
        monto = valor("monto", indice)
        if isinstance(monto, str):
            monto = _num(monto)

        registros.append(
            {
                "nemo": nemo,
                "razon_social": razon_social,
                "rut_emisor": _texto(valor("rut", indice)),
                "fecha_pago": fecha_pago,
                "fecha_limite": fecha_limite,
                "fecha_acuerdo": _fecha(valor("fecha_acuerdo", indice)),
                "fecha_cierre": _fecha(valor("fecha_cierre", indice)),
                "numero_dividendo": _texto(valor("numero_dividendo", indice)),
                "serie": _texto(valor("serie", indice)),
                "tipo": TIPOS.get(tipo_codigo, tipo_codigo or "desconocido"),
                "tipo_codigo": tipo_codigo,
                "moneda": _texto(valor("moneda", indice)),
                "monto": monto,
                "fuente": FUENTE,
            }
        )
    return registros


def dedupe_dividendos(registros: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Un registro por (nemo, fecha_pago, numero, serie)."""
    vistos: set[tuple] = set()
    salida: list[dict[str, Any]] = []
    for fila in registros:
        clave = (
            str(fila.get("nemo", "")).strip().lower(),
            fila.get("fecha_pago") or "",
            str(fila.get("numero_dividendo", "")).strip(),
            str(fila.get("serie", "")).strip().upper(),
        )
        if clave in vistos:
            continue
        vistos.add(clave)
        salida.append(fila)
    return salida


# --------------------------------------------------------------------------
# Adaptador
# --------------------------------------------------------------------------


def grid_params(anio: int | None = None) -> dict[str, Any]:
    """Parametros GET de la grilla; `sociedad[]=0` = todas las sociedades."""
    y = anio if anio else date.today().year
    return {
        "lang": "es",
        "sociedad[]": "0",
        "mes": "0",
        "anno": str(y),
        "mes2": "0",
        "anno2": str(y),
        "tipodiv": "0",
    }


def source_url(anio: int | None = None) -> str:
    return build_url(GRID_PATH, grid_params(anio))


class CmfDividendosAdapter:
    """Descarga y normaliza el calendario de dividendos de la CMF."""

    name = NAME
    table = TABLE

    def __init__(
        self,
        *,
        anio: int | None = None,
        dry_run: bool = False,
        client: CmfClient | None = None,
    ) -> None:
        self.anio = anio
        self.dry_run = dry_run
        self.client = client or CmfClient()

    @property
    def params(self) -> dict[str, Any]:
        return grid_params(self.anio)

    @property
    def url(self) -> str:
        return source_url(self.anio)

    def fetch_raw(self) -> str:
        """Baja la grilla (lanza `CmfBlocked` si el WAF bloquea)."""
        return self.client.get(BASE_URL + GRID_PATH, params=self.params)

    def normalize(self, html: str) -> list[dict[str, Any]]:
        return dedupe_dividendos(parse_dividendos(html))

    def run(self, db: Any = None) -> dict[str, Any]:
        html = self.fetch_raw()
        registros = self.normalize(html)
        resumen: dict[str, Any] = {
            "source": self.name,
            "anio": self.anio or date.today().year,
            "dividendos": len(registros),
            "status": "ok",
        }

        if not registros:
            resumen["status"] = "empty"
            return resumen

        if self.dry_run:
            resumen["dry_run"] = True
            return resumen

        if db is None:
            raise RuntimeError("CmfDividendosAdapter.run necesita un cliente Supabase")
        self._upsert(db, registros)
        return resumen

    def _upsert(self, db: Any, registros: list[dict[str, Any]]) -> None:
        payload = [{**fila, "source_url": self.url} for fila in registros]
        db.table(self.table).upsert(
            payload,
            on_conflict=CONFLICT_COLUMNS,
            ignore_duplicates=True,
        ).execute()


def correr(db: Any, dry_run: bool = False, *, anio: int | None = None) -> list[dict[str, Any]]:
    """Punto de entrada de la etapa `stages/cmf_dividendos.py`."""
    adapter = CmfDividendosAdapter(anio=anio, dry_run=dry_run)
    return [adapter.run(db)]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Dividendos chilenos CMF -> cl_dividends")
    parser.add_argument("--dry-run", action="store_true", help="Sin escribir en Supabase")
    parser.add_argument("--anio", type=int, default=None, help="Anio calendario (default: actual)")
    parser.add_argument("--html", type=Path, default=None, help="Parsear un HTML local (sin red)")
    args = parser.parse_args(argv)

    if args.html:
        registros = dedupe_dividendos(parse_dividendos(args.html.read_text(encoding="utf-8")))
        print(f"{len(registros)} dividendos de {args.html}")
        for fila in registros[:10]:
            print(f"  {fila['nemo']:12s} {fila['fecha_pago']} limite={fila['fecha_limite']} "
                  f"monto={fila['monto']} tipo={fila['tipo']}")
        return 0

    adapter = CmfDividendosAdapter(anio=args.anio, dry_run=args.dry_run)
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
