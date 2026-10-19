"""
InfoProbidad scraper — declaraciones de patrimonio de autoridades chilenas.

Fuente REAL (verificada en vivo 2026-10-18): el portal publica Datos
Abiertos Enlazados con un endpoint SPARQL público en
    https://datos.cplt.cl/sparql
(Consejo para la Transparencia — infoprobidad.cl, licencia CC 4.0,
actualización semanal los martes y viernes).

El CSV hipotético `/descargas/declaraciones-<año>.csv` que usaba la versión
anterior NO existe (404 verificado). Este adapter consulta el SPARQL real:
    Persona → ip:declara → Declaración → ip:tieneAccionDerecho
    → ip:derechoSobre (Entidad con rdfs:label) + ip:valorPlaza (Money:
      ip:valor + ip:moneda)

Portafolio: infoProbidad-cl — canasta de las entidades (empresas) en que
las autoridades declaran tener acciones, ponderadas por valor declarado.
Es información pública de patrimonio, NO un portafolio de inversión ni
una recomendación.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date

import httpx

from base import Holding, SourceAdapter, log

SPARQL_ENDPOINT = "https://datos.cplt.cl/sparql"

# Query: acciones/derechos declarados por cualquier autoridad, con la
# entidad emisora y su valor de plaza (CLP). Traemos las más recientes.
HOLDINGS_QUERY = """
PREFIX ip: <http://datos.cplt.cl/ontologias/infoprobidad/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?entidad ?valor WHERE {
  ?p ip:declara ?d .
  ?d ip:tieneAccionDerecho ?ad .
  ?ad ip:derechoSobre ?ent . ?ent rdfs:label ?entidad .
  ?ad ip:valorPlaza ?m . ?m ip:valor ?valor .
  FILTER(?valor > 0)
}
LIMIT 2000
"""


class InfoProbidadAdapter(SourceAdapter):
    name = "infoprobidad"
    portfolio_slug = "infoProbidad-cl"

    def __init__(self, dry_run: bool = False, top_n: int = 25) -> None:
        super().__init__(dry_run=dry_run)
        self.top_n = top_n

    def fetch_raw(self) -> list[dict]:
        """Consulta el SPARQL y devuelve filas {entidad, valor}."""
        try:
            resp = self.client.post(
                SPARQL_ENDPOINT,
                data={
                    "query": HOLDINGS_QUERY,
                    "format": "application/sparql-results+json",
                },
                headers={"Accept": "application/sparql-results+json"},
                timeout=60.0,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            log(f"[{self.name}] SPARQL error: {e}")
            return []

        rows: list[dict] = []
        for b in data.get("results", {}).get("bindings", []):
            entidad = (b.get("entidad") or {}).get("value", "").strip()
            raw_val = (b.get("valor") or {}).get("value", "0")
            try:
                valor = float(raw_val)
            except (TypeError, ValueError):
                continue
            if entidad and valor > 0:
                rows.append({"entidad": entidad, "valor": valor})
        log(f"[{self.name}] {len(rows)} acciones/derechos declarados (SPARQL)")
        return rows

    def normalize(self, raw: list[dict]) -> list[Holding]:
        """Agrega por entidad: peso = valor declarado total / suma.

        Solo las top_n entidades por valor declarado, renormalizadas a 100%.
        Los "símbolos" son nombres de empresas chilenas (no tickers): esta
        fuente no tiene tickers, y mostrar qué empresas concentran las
        declaraciones de las autoridades es el dato de interés.
        """
        by_entity: dict[str, float] = defaultdict(float)
        for r in raw:
            by_entity[r["entidad"].upper()] += r["valor"]

        if not by_entity:
            return []

        top = sorted(by_entity.items(), key=lambda kv: -kv[1])[: self.top_n]
        total = sum(v for _, v in top)
        if total <= 0:
            return []

        holdings = []
        for entidad, valor in top:
            weight = (valor / total) * 100
            if weight < 0.5:
                continue
            # symbol: slug corto y estable del nombre de la entidad
            symbol = (
                entidad.split()[0][:12].replace(".", "").replace(",", "")
            )
            holdings.append(
                Holding(
                    symbol=symbol,
                    name=entidad.title(),
                    weight=round(weight, 2),
                    asset_class="equity",
                    exchange="CL",
                    currency="CLP",
                )
            )
        log(f"[{self.name}] {len(holdings)} entidades en la canasta")
        return holdings


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="InfoProbidad SPARQL → reclu.cl")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    adapter = InfoProbidadAdapter(dry_run=args.dry_run)
    result = adapter.run()
    log(f"[{adapter.name}] Result: {result}")
