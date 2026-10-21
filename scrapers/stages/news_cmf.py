"""Etapa news_cmf (F65): hechos esenciales CMF -> noticias.

Reutiliza lo que ya dejo `cmf_hechos` en `cl_material_events` (migracion
032) y publica `news_items` + `news_tickers` (migracion 051). No descarga
nada: si la portada de la CMF fallo, esta etapa simplemente no tiene hechos
nuevos. Ante cualquier error de red al mapear nemotecnicos, el hecho se
guarda igual sin tickers. Apagada por defecto: solo corre con
NEWS_IMPACT_ENABLED="true".
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

# (id, descripcion, critica)
STAGE = (
    "news_cmf",
    "Hechos esenciales CMF -> noticias (news_items, news_tickers)",
    False,
)


def _raiz() -> Path:
    return Path(__file__).resolve().parent.parent


def run(db: Any, dry_run: bool) -> list[dict[str, Any]]:
    raiz = _raiz()
    if str(raiz) not in sys.path:
        sys.path.insert(0, str(raiz))
    from news_cmf import CmfNewsAdapter, news_enabled

    if not news_enabled():
        return [
            {
                "source": "news_cmf",
                "status": "disabled",
                "flag": "NEWS_IMPACT_ENABLED",
                "dry_run": dry_run,
            }
        ]

    adapter = CmfNewsAdapter(dry_run=dry_run)
    return [adapter.run(None if dry_run else db)]
