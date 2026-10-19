"""
InfoProbidad — agregado por empresa (RUT), sin datos personales.

Fuente: SPARQL público del Consejo para la Transparencia
https://datos.cplt.cl/sparql (licencia CC BY 4.0).

Se publica solo el agregado: autoridades que declaran acciones de cada
empresa, valor total declarado y fecha más reciente. Con menos de
MIN_AUTORIDADES (3) no se guardan valor ni fecha: alcanzan a señalar
a una persona. La consulta no pide dirección, estado civil, régimen
patrimonial, bienes, pasivos ni datos de cónyuge o familiares.

Portafolio infoProbidad-cl (el slug no cambia): canasta de emisoras
cotizadas, peso proporcional al número de autoridades. No es una cartera
para copiar ni una recomendación de inversión.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

from base import Holding, SourceAdapter, get_db, log

SPARQL_ENDPOINT = "https://datos.cplt.cl/sparql"
SOURCE_URL = SPARQL_ENDPOINT
LICENCIA = "CC BY 4.0"
PORTFOLIO_SLUG = "infoProbidad-cl"
UMBRAL_AUTORIDADES = 5
# 1 o 2 declarantes reidentifican (valor y fecha). El mismo piso está en TS.
MIN_AUTORIDADES = 3

# Sociedades deportivas y RUT vacío. El agregado las descarta.
RUT_DESCARTADOS = frozenset({
    "0",
    "76072469",  # Cruzados
    "76838140",  # Azul Azul
    "99589230",  # Blanco y Negro
})

PREDICADOS_PROHIBIDOS = (
    "direccion",
    "estadoCivil",
    "regimenPatrimonial",
    "tieneBien",
    "tienePasivo",
)

# Agrupa por ip:rutJuridica. ?nombre es la etiqueta de la sociedad, no de la persona.
HOLDINGS_QUERY = """
PREFIX ip: <http://datos.cplt.cl/ontologias/infoprobidad/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?rut (SAMPLE(?l) AS ?nombre) (COUNT(DISTINCT ?p) AS ?declarantes) (MAX(?f) AS ?ultima) (SUM(?v) AS ?valor)
WHERE {
  ?p ip:declara ?d .
  ?d ip:ultimaDecDeclarante ?u .
  FILTER(str(?u)='true' || str(?u)='1')
  ?d ip:fechaDeclaracion ?f .
  ?d ip:tieneAccionDerecho ?a .
  ?a ip:rutJuridica ?rut .
  ?a ip:derechoSobre ?e .
  ?e rdfs:label ?l .
  OPTIONAL { ?a ip:valorPlaza ?m . ?m ip:valor ?v }
}
GROUP BY ?rut
ORDER BY DESC(?declarantes)
LIMIT 50
""".strip()


def nombres_habilitados() -> bool:
    """Flag apagado por defecto. Aunque sea 1, esta versión no pide nombres."""
    return os.environ.get("INFOPROBIDAD_NOMBRES", "0").strip() == "1"


def consulta_publica() -> str:
    """Única consulta que se envía al endpoint. Sin predicados personales."""
    return HOLDINGS_QUERY


def consulta_sin_datos_personales(query: str | None = None) -> bool:
    texto = (query if query is not None else HOLDINGS_QUERY).lower()
    return not any(pred.lower() in texto for pred in PREDICADOS_PROHIBIDOS)


@dataclass
class EmpresaAgregada:
    rut: str
    nombre: str
    autoridades: int
    valor_declarado_clp: float | None
    ultima_declaracion: str | None
    symbol: str | None = None


def _valor(binding: dict, key: str) -> str:
    node = binding.get(key) or {}
    return str(node.get("value", "")).strip()


def rut_key(raw: str) -> str:
    """Cuerpo del RUT, sin puntos ni DV. '0' y vacío se conservan para filtrar."""
    text = (raw or "").strip()
    if text.endswith(".0"):
        text = text[:-2]
    digits = "".join(ch for ch in text if ch.isdigit())
    if not digits:
        return ""
    return digits.lstrip("0") or "0"


def _fecha(raw: str) -> str | None:
    return raw[:10] if raw else None


def campos_publicos(
    autoridades: int,
    valor: float | None,
    fecha: str | None,
) -> tuple[float | None, str | None]:
    """Bajo el piso, valor y fecha quedan fuera del agregado guardado."""
    if autoridades < MIN_AUTORIDADES:
        return None, None
    return valor, fecha


def parse_bindings(data: dict) -> list[EmpresaAgregada]:
    """Una fila por RUT. Descarta rut 0, vacíos y sociedades deportivas."""
    bindings = (data or {}).get("results", {}).get("bindings", [])
    by_rut: dict[str, EmpresaAgregada] = {}
    for binding in bindings:
        rut = rut_key(_valor(binding, "rut"))
        if not rut or rut in RUT_DESCARTADOS:
            continue
        nombre = _valor(binding, "nombre") or _valor(binding, "entidad")
        if not nombre:
            continue
        try:
            autoridades = int(float(_valor(binding, "declarantes") or "0"))
        except ValueError:
            continue
        raw_valor = _valor(binding, "valor")
        valor: float | None = None
        if raw_valor:
            try:
                parsed = float(raw_valor)
                valor = parsed if parsed > 0 else None
            except ValueError:
                valor = None
        valor, fecha = campos_publicos(
            autoridades, valor, _fecha(_valor(binding, "ultima"))
        )
        row = EmpresaAgregada(
            rut=rut,
            nombre=nombre.strip(),
            autoridades=autoridades,
            valor_declarado_clp=valor,
            ultima_declaracion=fecha,
        )
        prev = by_rut.get(rut)
        if prev is None or row.autoridades > prev.autoridades:
            by_rut[rut] = row
    rows = list(by_rut.values())
    rows.sort(key=lambda item: (-item.autoridades, item.nombre))
    return rows


def load_rut_map(path: Path | None = None) -> dict[str, str | None]:
    if path is None:
        path = Path(__file__).resolve().parent / "data" / "infoprobidad" / "rut_nemotecnico.json"
    if not path.exists():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    out: dict[str, str | None] = {}
    for row in payload.get("empresas", []):
        rut = rut_key(str(row.get("rut", "")))
        symbol = row.get("symbol")
        if isinstance(symbol, str):
            symbol = symbol.strip() or None
        else:
            symbol = None
        if rut:
            out[rut] = symbol
    return out


def aplicar_simbolos(
    rows: list[EmpresaAgregada], rut_map: dict[str, str | None]
) -> list[EmpresaAgregada]:
    for row in rows:
        row.symbol = rut_map.get(row.rut)
    return rows


def holdings_desde_agregado(rows: list[EmpresaAgregada]) -> list[Holding]:
    """Solo emisoras con nemotécnico. El peso es proporcional a las autoridades."""
    listed = [row for row in rows if row.symbol and row.autoridades > 0]
    total = sum(row.autoridades for row in listed)
    if total <= 0:
        return []
    holdings: list[Holding] = []
    for row in listed:
        weight = round((row.autoridades / total) * 100, 2)
        if weight <= 0:
            continue
        holdings.append(
            Holding(
                symbol=row.symbol or "",
                name=row.nombre,
                weight=weight,
                asset_class="equity",
                exchange="BCS",
                currency="CLP",
            )
        )
    holdings.sort(key=lambda item: -item.weight)
    return holdings


def alertas_umbral(
    anteriores: dict[str, int],
    actuales: list[EmpresaAgregada],
    umbral: int = UMBRAL_AUTORIDADES,
) -> list[dict]:
    """threshold si las autoridades suben >= umbral entre corridas. Sin personas."""
    alerts: list[dict] = []
    for row in actuales:
        if row.autoridades < MIN_AUTORIDADES:
            continue
        prev = anteriores.get(row.rut)
        if prev is None:
            continue
        if row.autoridades - prev < umbral:
            continue
        alerts.append(
            {
                "type": "threshold",
                "severity": "medium",
                "title": (
                    f"InfoProbidad: {row.autoridades} autoridades declaran "
                    f"acciones de {row.nombre}"
                ),
                "summary": (
                    f"{row.nombre} pasa de {prev} a {row.autoridades} autoridades "
                    "en el agregado de InfoProbidad (CC BY 4.0). "
                    "No es una recomendación de inversión."
                ),
                "payload": {
                    "rut": row.rut,
                    "nombre": row.nombre,
                    "autoridades": row.autoridades,
                    "autoridades_antes": prev,
                    "ultima_declaracion": row.ultima_declaracion,
                    "source_url": SOURCE_URL,
                    "licencia": LICENCIA,
                },
            }
        )
    return alerts


class InfoProbidadAdapter(SourceAdapter):
    name = "infoprobidad"
    portfolio_slug = PORTFOLIO_SLUG

    def __init__(self, dry_run: bool = False) -> None:
        super().__init__(dry_run=dry_run)
        self.rut_map = load_rut_map()
        self._empresas: list[EmpresaAgregada] | None = None

    def fetch_raw(self) -> list[EmpresaAgregada]:
        if self._empresas is not None:
            return self._empresas
        if nombres_habilitados():
            log(
                f"[{self.name}] INFOPROBIDAD_NOMBRES=1 ignorado: "
                "no se consultan ni guardan nombres (revisión legal pendiente)."
            )
        if not consulta_sin_datos_personales():
            log(f"[{self.name}] consulta rechazada: contiene predicados personales")
            self._empresas = []
            return self._empresas
        try:
            resp = self.client.post(
                SPARQL_ENDPOINT,
                data={
                    "query": consulta_publica(),
                    "format": "application/sparql-results+json",
                },
                headers={"Accept": "application/sparql-results+json"},
                timeout=90.0,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:  # noqa: BLE001 — el endpoint público a veces corta
            log(f"[{self.name}] SPARQL error: {exc}")
            self._empresas = []
            return self._empresas
        rows = aplicar_simbolos(parse_bindings(data), self.rut_map)
        log(f"[{self.name}] {len(rows)} empresas agregadas por RUT")
        self._empresas = rows
        return rows

    def normalize(self, raw: list[EmpresaAgregada]) -> list[Holding]:
        holdings = holdings_desde_agregado(raw)
        log(f"[{self.name}] {len(holdings)} emisoras cotizadas en la canasta")
        return holdings

    def _persist_empresas(self, db, empresas: list[EmpresaAgregada]) -> int:
        existing = (
            db.table("infoprobidad_empresas").select("rut, autoridades").execute()
        )
        anteriores = {
            str(row["rut"]): int(row["autoridades"])
            for row in (existing.data or [])
        }
        alerts = alertas_umbral(anteriores, empresas)
        for empresa in empresas:
            valor, fecha = campos_publicos(
                empresa.autoridades,
                empresa.valor_declarado_clp,
                empresa.ultima_declaracion,
            )
            db.table("infoprobidad_empresas").upsert(
                {
                    "rut": empresa.rut,
                    "nombre": empresa.nombre,
                    "symbol": empresa.symbol,
                    "autoridades": empresa.autoridades,
                    "valor_declarado_clp": valor,
                    "ultima_declaracion": fecha,
                },
                on_conflict="rut",
            ).execute()
        if not alerts:
            return 0
        portfolio_id = self._resolve_portfolio_id(db)
        for alert in alerts:
            db.table("alerts").insert(
                {
                    "portfolio_id": portfolio_id,
                    "type": alert["type"],
                    "severity": alert["severity"],
                    "title": alert["title"],
                    "summary": alert["summary"],
                    "payload": alert["payload"],
                    "is_published": True,
                }
            ).execute()
        log(f"[{self.name}] {len(alerts)} alertas threshold (sin nombres)")
        return len(alerts)

    def run(self, db=None) -> dict:
        empresas = self.fetch_raw()
        if not empresas:
            return {"source": self.name, "holdings": 0, "empresas": 0, "status": "empty"}
        if self.dry_run:
            holdings = self.normalize(empresas)
            top = holdings[0].symbol if holdings else "-"
            log(
                f"[{self.name}] DRY-RUN: {len(empresas)} empresas, "
                f"{len(holdings)} cotizadas, top {top}. Nada escrito."
            )
            return {
                "source": self.name,
                "portfolio": self.portfolio_slug,
                "empresas": len(empresas),
                "holdings": len(holdings),
                "status": "ok",
                "dry_run": True,
            }
        if db is None:
            db = get_db()
        alertas = self._persist_empresas(db, empresas)
        result = super().run(db)
        result["empresas"] = len(empresas)
        result["alertas_umbral"] = alertas
        return result


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="InfoProbidad SPARQL → reclu.cl")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    adapter = InfoProbidadAdapter(dry_run=args.dry_run)
    log(f"[{adapter.name}] Result: {adapter.run()}")
