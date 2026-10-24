"""
Carteras de acciones chilenas de las 7 AFP (Cuadro 14, Superintendencia de Pensiones).

Fuente oficial y pública (verificada 2026-10-23 para los 7 idu, último mes
publicado 202605; desde 202606 el endpoint devuelve 363 bytes):
  https://www.spensiones.cl/apps/carteras/genera_desagregada_xsl.php?fecpro=AAAAMM&idu=N&listado=14

Reutiliza el parser y la escritura de spensiones.py; solo cambia el idu y el
slug. AFP Modelo conserva su slug histórico (afp-modelo-acciones-cl).

Uso:
  python afp_carteras.py --dry-run                 # las 7, sin escribir
  python afp_carteras.py --dry-run --afp habitat   # una
"""

from __future__ import annotations

import argparse
import json
from datetime import date
from typing import Any

from base import log
from spensiones import PORTFOLIO_SLUG as SLUG_MODELO
from spensiones import SpensionesAdapter, buscar_cuadro14, url_cuadro14

# idu del endpoint del Cuadro 14 (verificados contra la fuente).
AFPS: dict[str, dict[str, str]] = {
    "capital": {"idu": "42", "nombre": "AFP Capital"},
    "cuprum": {"idu": "35", "nombre": "AFP Cuprum"},
    "habitat": {"idu": "27", "nombre": "AFP Habitat"},
    "modelo": {"idu": "50", "nombre": "AFP Modelo"},
    "planvital": {"idu": "37", "nombre": "AFP PlanVital"},
    "provida": {"idu": "29", "nombre": "AFP Provida"},
    "uno": {"idu": "51", "nombre": "AFP UNO"},
}


def slug_for(afp: str) -> str:
    if afp not in AFPS:
        raise ValueError(f"AFP desconocida: {afp}")
    return SLUG_MODELO if afp == "modelo" else f"afp-{afp}-acciones-cl"


def url_for(afp: str, fecpro: str) -> str:
    return url_cuadro14(fecpro, AFPS[afp]["idu"])


class AfpCarterasAdapter(SpensionesAdapter):
    def __init__(self, afp: str, dry_run: bool = False) -> None:
        super().__init__(dry_run=dry_run, navegador=False)
        self.afp = afp
        self.idu = AFPS[afp]["idu"]
        self.name = f"afp_carteras:{afp}"
        self.portfolio_slug = slug_for(afp)

    def fetch_raw(self) -> dict[str, Any]:
        hallado = buscar_cuadro14(self.client, date.today(), idu=self.idu)
        if hallado is None:
            log(f"[{self.name}] ningún mes publicó el cuadro 14")
            return {"filas": [], "fecha": None, "fecpro": None, "url": None}
        return hallado


def main() -> None:
    parser = argparse.ArgumentParser(description="Cuadro 14 de las 7 AFP")
    parser.add_argument("--dry-run", action="store_true", help="Sin escribir en Supabase")
    parser.add_argument("--afp", choices=sorted(AFPS), action="append",
                        help="Una o más AFP (por defecto, todas)")
    args = parser.parse_args()
    resultados = []
    for afp in args.afp or sorted(AFPS):
        try:
            resultados.append(AfpCarterasAdapter(afp, dry_run=args.dry_run).run())
        except Exception as exc:  # noqa: BLE001 — una AFP caída no corta las demás
            log(f"[afp_carteras:{afp}] error: {exc}")
            resultados.append({"source": f"afp_carteras:{afp}", "status": "error", "error": str(exc)})
    print(json.dumps(resultados, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
