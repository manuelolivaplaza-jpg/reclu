"""Carteras de fondos mutuos chilenos de acciones nacionales (CMF).

Fuente (verificada en vivo el 2026-10-20):
  https://www.cmfchile.cl/institucional/estadisticas/ffm_cartera.php
  -> POST https://www.cmfchile.cl/institucional/estadisticas/ffm_download.php
     con `mm`, `aa` y `cartera=NACI`.

La CMF entrega un archivo de texto separado por `;` con una fila por
instrumento y fondo (Circular 1333). Las columnas que usa este adaptador:

  0  Run Fondo                  -> `run`
  1  Nombre Fondo               -> `nombre` (abreviado por la CMF)
  2  FFM_6010100 (nemotecnico)  -> `symbol`
  3  FFM_6010211 (RUT emisor)
  4  FFM_6010212 (DV emisor)
  6  FFM_6010400 (tipo)         -> `ACC` = accion
  11 FFM_6010900 (cantidad)
  19 FFM_6011200 (valorizacion) -> miles de pesos
  24 FFM_6011513 (%) activos del fondo -> `weight`

Criterio de seleccion (documentado, no hardcodeado por nombre exacto):
  - se queda con fondos cuyo nombre contiene un patron de renta variable
    nacional (`ACCIONES CHILE`, `ACCION CHILE`, `ACCIONES CHILENAS`,
    `ACCIONES NACIONAL`, `RENTA VARIABLE NAC`, `SELECCION ACCION`,
    `SEL ACCIONES`, `SELECTAS CHILE`, `DIV ACC CH`, `CHILE EQUITIES`);
  - descarta nombres con marcas extranjeras o de otro tipo de fondo
    (`USA`, `EEUU`, `GLOBAL`, `MUNDO`, `EUROPA`, `ASIA`, `LATAM`,
    `EMERGENTE`, `INTERNACIONAL`, `ESTRUCTURADO`, `DEUDA`, `MIXTO`);
  - ordena por la suma de valorizaciones de la cartera nacional informada
    (columna 19, en miles de pesos) y toma los 5 primeros. Es una
    aproximacion al patrimonio del fondo: la CMF publica el patrimonio
    exacto en otro archivo (Excel) que este scraper no descarga.

Cambios mensuales: se baja tambien el mes anterior (salvo `--sin-comparar`)
y se guarda `previous_weight` por fondo + nemotecnico. Una posicion nueva
queda con `previous_weight = 0`.

Datos: informacion publica y oficial de la CMF. Sin datos personales
(Leyes 19.628 y 21.719). Dato informativo: no ejecuta ordenes ni es
recomendacion de inversion (Ley Fintec).
"""

from __future__ import annotations

import argparse
import calendar
import csv
import io
import re
import sys
import unicodedata
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any, Iterable

from cmf_client import BASE_URL, CmfBlocked, CmfClient, build_url

NAME = "cmf_fondos"
PORTFOLIO_SLUG = "fondos-mutuos-acciones-cl"
TABLE_FUNDS = "cl_mutual_funds"
TABLE_HOLDINGS = "cl_mutual_fund_holdings"
TABLE_PORTFOLIOS = "portfolios"
TABLE_PORTFOLIO_HOLDINGS = "holdings"
FUENTE = "cmf"
CARTERA = "NACI"
DOWNLOAD_PATH = "/institucional/estadisticas/ffm_download.php"
SOURCE_URL = build_url(DOWNLOAD_PATH)
DEFAULT_LIMIT = 5

# Una fila por fondo + periodo (on_conflict del upsert).
CONFLICT_FUNDS = "run,periodo"
# Una fila por fondo + periodo + nemotecnico (on_conflict del upsert).
CONFLICT_HOLDINGS = "fund_run,periodo,symbol"
# Una fila por portafolio + nemotecnico + fecha (unique index de schema.sql).
CONFLICT_PORTFOLIO_HOLDINGS = "portfolio_id,symbol,as_of"

PATRONES_NACIONALES = (
    "ACCIONES CHILE",
    "ACCION CHILE",
    "CHILE ACCION",
    "ACCIONES CHILENAS",
    "ACCIONES NACIONAL",
    "ACCIONES NAC",
    "RENTA VARIABLE NAC",
    "SELECCION ACCION",
    "SEL ACCIONES",
    "SELECTAS CHILE",
    "DIV ACC CH",
    "CHILE EQUITIES",
)
PATRONES_EXCLUIDOS = (
    "USA",
    "EEUU",
    "GLOBAL",
    "MUNDO",
    "EUROPA",
    "ASIA",
    "LATAM",
    "EMERGENTE",
    "INTERNACIONAL",
    "EXTRANJER",
    "ESTRUCTURADO",
    "DEUDA",
    "MIXTO",
    "LIBRE",
)

TIPOS_ACCION = frozenset({"ACC"})


@dataclass(frozen=True)
class FilaCartera:
    """Una posicion informada por la CMF para un fondo y un mes."""

    run: str
    fondo: str
    periodo: str
    symbol: str
    tipo: str
    cantidad: float | None
    valorizacion_miles: int
    weight: float

    @property
    def es_accion(self) -> bool:
        return self.tipo.upper() in TIPOS_ACCION


@dataclass
class FondoCartera:
    """Fondo con su cartera nacional y el total que usa el ranking."""

    run: str
    nombre: str
    periodo: str
    cartera_nacional_clp: int
    filas: list[FilaCartera] = field(default_factory=list)

    @property
    def posiciones(self) -> int:
        return len(self.filas)

    @property
    def acciones(self) -> list[FilaCartera]:
        return [fila for fila in self.filas if fila.es_accion]


# --------------------------------------------------------------------------
# Utilidades puras
# --------------------------------------------------------------------------


def norm(texto: str) -> str:
    """Mayusculas sin tildes y con espacios colapsados."""
    base = unicodedata.normalize("NFKD", texto or "")
    sin_tildes = "".join(c for c in base if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", sin_tildes).strip().upper()


def periodo_partes(periodo: str) -> tuple[str, str]:
    """'2026-09' -> ('09', '2026'). Lanza ValueError si el formato no sirve."""
    match = re.fullmatch(r"(\d{4})-(0[1-9]|1[0-2])", (periodo or "").strip())
    if not match:
        raise ValueError(f"periodo invalido: {periodo!r} (usar YYYY-MM)")
    return match.group(2), match.group(1)


def periodo_por_defecto(hoy: date | None = None) -> str:
    """Ultimo mes cerrado: si hoy es 2026-10-20, devuelve '2026-09'."""
    actual = hoy or date.today()
    primer_dia = actual.replace(day=1)
    anterior = date.fromordinal(primer_dia.toordinal() - 1)
    return f"{anterior.year:04d}-{anterior.month:02d}"


def periodo_anterior(periodo: str) -> str:
    """'2026-01' -> '2025-12'."""
    mes, anio = periodo_partes(periodo)
    fecha = date(int(anio), int(mes), 1)
    anterior = date.fromordinal(fecha.toordinal() - 1)
    return f"{anterior.year:04d}-{anterior.month:02d}"


def fecha_cierre(periodo: str) -> date:
    """Ultimo dia del mes del periodo (fecha `as_of` de holdings)."""
    mes, anio = periodo_partes(periodo)
    ultimo = calendar.monthrange(int(anio), int(mes))[1]
    return date(int(anio), int(mes), ultimo)


def es_acciones_nacionales(nombre: str) -> bool:
    """True si el nombre abreviado de la CMF corresponde a renta variable CL."""
    texto = norm(nombre)
    if not texto:
        return False
    if any(marca in texto for marca in PATRONES_EXCLUIDOS):
        return False
    return any(patron in texto for patron in PATRONES_NACIONALES)


def _float(raw: str) -> float | None:
    texto = (raw or "").strip().replace("%", "")
    if not texto:
        return None
    if "," in texto and "." in texto:
        texto = texto.replace(".", "").replace(",", ".")
    elif "," in texto:
        texto = texto.replace(",", ".")
    try:
        return float(texto)
    except ValueError:
        return None


def _entero(raw: str) -> int:
    valor = _float(raw)
    return int(round(valor)) if valor is not None else 0


# --------------------------------------------------------------------------
# Parser del archivo de cartera
# --------------------------------------------------------------------------


def parse_cartera(texto: str, periodo: str) -> list[FilaCartera]:
    """Convierte el archivo `;` de la CMF en filas tipadas.

    Ignora lineas vacias o con menos de 25 columnas (la CMF a veces agrega
    una fila final). No inventa datos: si falta el nemotecnico, la fila se
    descarta.
    """
    periodo_partes(periodo)
    if not texto:
        return []

    filas: list[FilaCartera] = []
    lector = csv.reader(io.StringIO(texto), delimiter=";")
    for numero, celdas in enumerate(lector):
        if numero == 0 or len(celdas) < 25:
            continue
        run = (celdas[0] or "").strip()
        fondo = (celdas[1] or "").strip()
        symbol = (celdas[2] or "").strip().upper()
        if not run or not symbol:
            continue
        filas.append(
            FilaCartera(
                run=run,
                fondo=fondo,
                periodo=periodo,
                symbol=symbol,
                tipo=(celdas[6] or "").strip().upper(),
                cantidad=_float(celdas[11]),
                valorizacion_miles=_entero(celdas[19]),
                weight=_float(celdas[24]) or 0.0,
            )
        )
    return filas


def agrupar_fondos(filas: Iterable[FilaCartera]) -> list[FondoCartera]:
    """Agrupa por run y calcula la cartera nacional de cada fondo."""
    por_run: dict[str, FondoCartera] = {}
    for fila in filas:
        fondo = por_run.get(fila.run)
        if fondo is None:
            fondo = FondoCartera(
                run=fila.run,
                nombre=fila.fondo,
                periodo=fila.periodo,
                cartera_nacional_clp=0,
            )
            por_run[fila.run] = fondo
        fondo.cartera_nacional_clp += fila.valorizacion_miles * 1000
        fondo.filas.append(fila)
    return list(por_run.values())


def seleccionar_fondos(
    filas: Iterable[FilaCartera],
    *,
    limite: int = DEFAULT_LIMIT,
) -> list[FondoCartera]:
    """Top N fondos de acciones nacionales por cartera nacional informada.

    El nombre exacto no se hardcodea: se usa el criterio documentado en el
    encabezado. El desempate es alfabetico por run para que sea estable.
    """
    candidatos = [
        fondo
        for fondo in agrupar_fondos(filas)
        if es_acciones_nacionales(fondo.nombre) and fondo.cartera_nacional_clp > 0
    ]
    candidatos.sort(key=lambda fondo: (-fondo.cartera_nacional_clp, fondo.run))
    return candidatos[: max(0, int(limite))]


def aplicar_previous(
    actuales: Iterable[FilaCartera],
    anteriores: Iterable[FilaCartera],
) -> dict[tuple[str, str], float]:
    """Peso del mes anterior por (run, nemotecnico).

    Una posicion que no estaba queda con 0.0 (marca de posicion nueva).
    """
    previos: dict[tuple[str, str], float] = {}
    for fila in anteriores:
        clave = (fila.run, fila.symbol)
        previos[clave] = previos.get(clave, 0.0) + fila.weight
    return {
        (fila.run, fila.symbol): previos.get((fila.run, fila.symbol), 0.0)
        for fila in actuales
    }


def ponderar_holdings(
    fondos: Iterable[FondoCartera],
    *,
    previous: dict[tuple[str, str], float] | None = None,
) -> list[dict[str, Any]]:
    """Cartera agregada de los fondos, ponderada por cartera nacional.

    Primero suma los pesos de un mismo nemotecnico dentro de cada fondo (la
    CMF puede informar mas de una linea del mismo instrumento) y luego
    pondera por el tamano relativo de cada fondo. Devuelve solo acciones.
    """
    lista = list(fondos)
    total = sum(fondo.cartera_nacional_clp for fondo in lista)
    if total <= 0:
        return []

    por_symbol: dict[str, dict[str, Any]] = {}
    for fondo in lista:
        peso_fondo = fondo.cartera_nacional_clp / total
        peso_por_symbol: dict[str, float] = {}
        for fila in fondo.acciones:
            peso_por_symbol[fila.symbol] = peso_por_symbol.get(fila.symbol, 0.0) + fila.weight
        for symbol, peso in peso_por_symbol.items():
            registro = por_symbol.setdefault(
                symbol,
                {
                    "symbol": symbol,
                    "weight": 0.0,
                    "previous_weight": 0.0 if previous is not None else None,
                },
            )
            registro["weight"] += peso * peso_fondo
            if previous is not None:
                previo = previous.get((fondo.run, symbol), 0.0)
                registro["previous_weight"] += previo * peso_fondo

    resultado = []
    for symbol in sorted(por_symbol):
        registro = por_symbol[symbol]
        previo = registro["previous_weight"]
        resultado.append(
            {
                "symbol": symbol,
                "name": symbol,
                "weight": round(min(100.0, max(0.0, registro["weight"])), 2),
                "previous_weight": (
                    round(min(100.0, max(0.0, previo)), 2)
                    if previo is not None
                    else None
                ),
                "asset_class": "equity",
                "exchange": "BCS",
                "currency": "CLP",
            }
        )
    return resultado


# --------------------------------------------------------------------------
# Adaptador
# --------------------------------------------------------------------------


class CmfFondosAdapter:
    """Descarga la cartera nacional de la CMF y la escribe en Supabase."""

    name = NAME
    portfolio_slug = PORTFOLIO_SLUG

    def __init__(
        self,
        *,
        periodo: str | None = None,
        limite: int = DEFAULT_LIMIT,
        comparar: bool = True,
        dry_run: bool = False,
        client: CmfClient | None = None,
        texto: str | None = None,
        texto_anterior: str | None = None,
    ) -> None:
        self.periodo = periodo or periodo_por_defecto()
        periodo_partes(self.periodo)
        self.limite = max(0, int(limite))
        self.comparar = comparar
        self.dry_run = dry_run
        self.client = client or CmfClient()
        self._texto = texto
        self._texto_anterior = texto_anterior

    # -- Red ---------------------------------------------------------------

    def descargar(self, periodo: str) -> str:
        """POST al generador de archivos de la CMF (cartera nacional)."""
        mes, anio = periodo_partes(periodo)
        return self.client.post(
            BASE_URL + DOWNLOAD_PATH,
            data={"mm": mes, "aa": anio, "cartera": CARTERA},
        )

    def _cargar(self, periodo: str, texto: str | None) -> str:
        if texto is not None:
            return texto
        return self.descargar(periodo)

    # -- Pipeline ----------------------------------------------------------

    def cargar_fondos(
        self,
        *,
        texto: str | None = None,
    ) -> tuple[list[FondoCartera], list[FilaCartera]]:
        crudo = self._cargar(self.periodo, texto if texto is not None else self._texto)
        filas = parse_cartera(crudo, self.periodo)
        return seleccionar_fondos(filas, limite=self.limite), filas

    def run(self, db: Any = None) -> dict[str, Any]:
        if not self.dry_run and db is None:
            raise RuntimeError("CmfFondosAdapter.run necesita un cliente Supabase")

        actuales, filas_actuales = self.cargar_fondos()
        if not actuales:
            return {
                "source": self.name,
                "periodo": self.periodo,
                "fondos": 0,
                "holdings": 0,
                "status": "empty",
                **({"dry_run": True} if self.dry_run else {}),
            }

        anteriores: list[FilaCartera] = []
        comparado = False
        if self.comparar:
            anterior = periodo_anterior(self.periodo)
            try:
                crudo_anterior = self._cargar(anterior, self._texto_anterior)
                anteriores = parse_cartera(crudo_anterior, anterior)
                comparado = True
            except CmfBlocked:
                raise
            except Exception as exc:  # noqa: BLE001 - sin mes previo se sigue
                print(
                    f"[{NAME}] sin comparacion mensual ({anterior}): {exc}",
                    file=sys.stderr,
                )

        previous = aplicar_previous(filas_actuales, anteriores) if comparado else {}
        agregados = ponderar_holdings(actuales, previous=previous if comparado else None)

        resumen: dict[str, Any] = {
            "source": self.name,
            "periodo": self.periodo,
            "fondos": len(actuales),
            "holdings": sum(fondo.posiciones for fondo in actuales),
            "agregados": len(agregados),
            "comparado": comparado,
            "status": "ok",
            "top": [
                {
                    "run": fondo.run,
                    "nombre": fondo.nombre,
                    "cartera_nacional_clp": fondo.cartera_nacional_clp,
                    "posiciones": fondo.posiciones,
                }
                for fondo in actuales
            ],
            "source_url": SOURCE_URL,
        }

        if self.dry_run:
            resumen["dry_run"] = True
            return resumen

        portfolio_id = self._portfolio_id(db)
        self._upsert_fondos(db, actuales)
        self._upsert_holdings(db, actuales, previous if comparado else None)
        self._upsert_portfolio_holdings(db, portfolio_id, agregados)
        return resumen

    # -- Escritura ---------------------------------------------------------

    def _portfolio_id(self, db: Any) -> str:
        respuesta = (
            db.table(TABLE_PORTFOLIOS)
            .select("id")
            .eq("slug", self.portfolio_slug)
            .single()
            .execute()
        )
        datos = getattr(respuesta, "data", None)
        if isinstance(datos, list):
            datos = datos[0] if datos else None
        if not datos or not datos.get("id"):
            raise RuntimeError(
                f"Falta el portafolio '{self.portfolio_slug}'. "
                "Aplicar supabase/migrations/034_fondos_mutuos.sql."
            )
        return datos["id"]

    def _upsert_fondos(self, db: Any, fondos: list[FondoCartera]) -> None:
        payload = [
            {
                "run": fondo.run,
                "nombre": fondo.nombre,
                "periodo": fondo.periodo,
                "cartera_nacional_clp": fondo.cartera_nacional_clp,
                "posiciones": fondo.posiciones,
                "fuente": FUENTE,
                "source_url": SOURCE_URL,
            }
            for fondo in fondos
        ]
        db.table(TABLE_FUNDS).upsert(payload, on_conflict=CONFLICT_FUNDS).execute()

    def _upsert_holdings(
        self,
        db: Any,
        fondos: list[FondoCartera],
        previous: dict[tuple[str, str], float] | None,
    ) -> None:
        payload = []
        for fondo in fondos:
            for fila in fondo.acciones:
                payload.append(
                    {
                        "fund_run": fila.run,
                        "fund_name": fondo.nombre,
                        "periodo": fila.periodo,
                        "symbol": fila.symbol,
                        "name": fila.symbol,
                        "tipo_instrumento": fila.tipo,
                        "weight": round(fila.weight, 2),
                        "previous_weight": (
                            round(previous.get((fila.run, fila.symbol), 0.0), 2)
                            if previous is not None
                            else None
                        ),
                        "valorizacion_miles": fila.valorizacion_miles,
                        "currency": "CLP",
                        "source_url": SOURCE_URL,
                    }
                )
        if not payload:
            return
        db.table(TABLE_HOLDINGS).upsert(
            payload, on_conflict=CONFLICT_HOLDINGS
        ).execute()

    def _upsert_portfolio_holdings(
        self,
        db: Any,
        portfolio_id: str,
        agregados: list[dict[str, Any]],
    ) -> None:
        if not agregados:
            return
        as_of = fecha_cierre(self.periodo).isoformat()
        payload = [
            {
                "portfolio_id": portfolio_id,
                "symbol": registro["symbol"],
                "name": registro["name"],
                "weight": registro["weight"],
                "previous_weight": registro["previous_weight"],
                "asset_class": registro["asset_class"],
                "exchange": registro["exchange"],
                "currency": registro["currency"],
                "as_of": as_of,
            }
            for registro in agregados
        ]
        db.table(TABLE_PORTFOLIO_HOLDINGS).upsert(
            payload, on_conflict=CONFLICT_PORTFOLIO_HOLDINGS
        ).execute()


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------


def correr(
    db: Any,
    dry_run: bool = False,
    *,
    periodo: str | None = None,
    limite: int = DEFAULT_LIMIT,
    comparar: bool = True,
) -> list[dict[str, Any]]:
    """Punto de entrada de la etapa `stages/cmf_fondos.py`."""
    adapter = CmfFondosAdapter(
        periodo=periodo,
        limite=limite,
        comparar=comparar,
        dry_run=dry_run,
    )
    return [adapter.run(db)]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Top fondos mutuos de acciones nacionales (CMF) -> Supabase"
    )
    parser.add_argument("--dry-run", action="store_true", help="Sin escribir en Supabase")
    parser.add_argument(
        "--periodo", default=None, help="Periodo YYYY-MM (por defecto, mes cerrado)"
    )
    parser.add_argument("--limite", type=int, default=DEFAULT_LIMIT, help="Fondos a mostrar")
    parser.add_argument(
        "--sin-comparar",
        action="store_true",
        help="No descargar el mes anterior (sin previous_weight)",
    )
    parser.add_argument(
        "--archivo", type=Path, default=None, help="Parsear un archivo local (sin red)"
    )
    args = parser.parse_args(argv)

    texto = None
    if args.archivo:
        texto = args.archivo.read_text(encoding="latin-1", errors="replace")

    adapter = CmfFondosAdapter(
        periodo=args.periodo,
        limite=args.limite,
        comparar=not args.sin_comparar and not args.archivo,
        dry_run=args.dry_run or bool(args.archivo),
        texto=texto,
    )
    try:
        resumen = adapter.run(None if adapter.dry_run else _db())
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
