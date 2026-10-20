"""Etapa F35: flujos diarios de ETFs iShares ("dónde entra la plata").

Flujo diario = Δ acciones en circulación × NAV por acción. Las acciones en
circulación salen de la cabecera del CSV oficial de iShares (mismo archivo
que los holdings) y el NAV se estima con el patrimonio del fondo dividido
por las acciones en circulación.

Opcional: un emisor caído no tumba la corrida. En --dry-run no se escribe
nada en Supabase.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

# (id, descripción, crítica) — el id debe ser el nombre del archivo.
STAGE = (
    "etf_flows",
    "Flujos de ETFs iShares (Δ acciones en circulación × NAV)",
    False,
)


def run(db: Any, dry_run: bool) -> list[dict[str, Any]]:
    raiz = Path(__file__).resolve().parent.parent
    if str(raiz) not in sys.path:
        sys.path.insert(0, str(raiz))
    from etf_flows import collect

    resumen = collect(db, dry_run=dry_run)
    return [{"source": "etf_flows", "status": "ok", **resumen}]
