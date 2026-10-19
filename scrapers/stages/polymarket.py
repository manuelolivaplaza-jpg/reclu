"""Etapa F30: grandes apuestas de Polymarket (política y economía).

La descubre `run_all` automáticamente. No es crítica: si Polymarket falla,
la corrida sigue. En `--dry-run` solo lee las APIs públicas y no escribe
nada en Supabase.
"""

from __future__ import annotations

STAGE = (
    "polymarket",
    "Grandes apuestas de Polymarket (política y economía)",
    False,
)


def run(db, dry_run: bool) -> list[dict]:
    from polymarket import PolymarketAdapter

    adapter = PolymarketAdapter(dry_run=dry_run)
    return [adapter.run(db)]
