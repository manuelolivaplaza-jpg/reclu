"""Etapa ticker_profile: CSV curado → tabla ``ticker_profile``.

Apagada por defecto: solo corre con ``NEWS_IMPACT_ENABLED=true``, igual que
news_edgar. No usa red. En ``--dry-run`` valida el CSV y no toca Supabase
(ni lectura ni escritura).

La curaduría vive en ``scrapers/data/peers_manual.csv`` (sector, industria,
país, pares, proveedores y factores macro).
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

# (id, descripción, crítica)
STAGE = (
    "ticker_profile",
    "Perfil por ticker (sector, peers, macro) → ticker_profile",
    False,
)


def run(db: Any, dry_run: bool) -> list[dict[str, Any]]:
    raiz = Path(__file__).resolve().parent.parent
    if str(raiz) not in sys.path:
        sys.path.insert(0, str(raiz))
    from base import log
    from ticker_profile import PROFILE_FLAG, TickerProfileAdapter, profile_enabled

    if not profile_enabled():
        log(f"[ticker_profile] omitida: {PROFILE_FLAG} != true")
        return [
            {
                "source": "ticker_profile",
                "status": "skipped",
                "reason": f"{PROFILE_FLAG} != true",
                "dry_run": dry_run,
            }
        ]

    return [TickerProfileAdapter(dry_run=dry_run).run(db)]
