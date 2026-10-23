"""Escritura de series REALES en portfolio_performance sin borrar historia.

Regla (común a etf_series, event_series, reconstruct_house_ptr y
reconstruct_congress):
  1. upsert por (portfolio_id, date) con is_estimated = false;
  2. luego se borran SOLO las filas is_estimated = true del portafolio dentro
     del rango [min_date, max_date] escrito (las reales nuevas reemplazan la
     proyección en ese tramo).
Fuera del rango no se toca nada y nunca se borran filas reales.
"""

from __future__ import annotations

from typing import Any, Iterable

CHUNK = 500


def _normalize(series: Iterable[Any]) -> list[dict]:
    """Acepta [{date, value_pct}] o [(date, value_pct)]."""
    out: list[dict] = []
    for point in series:
        if isinstance(point, dict):
            out.append({"date": str(point["date"])[:10], "value_pct": point["value_pct"]})
        else:
            day, pct = point
            out.append({"date": str(day)[:10], "value_pct": pct})
    return out


def save_real_series(db, portfolio_id: str, series: Iterable[Any], chunk: int = CHUNK) -> int:
    points = _normalize(series)
    if not points:
        return 0
    rows = [{"portfolio_id": portfolio_id, **p, "is_estimated": False} for p in points]
    table = "portfolio_performance"
    for i in range(0, len(rows), chunk):
        db.table(table).upsert(rows[i : i + chunk], on_conflict="portfolio_id,date").execute()
    dates = [p["date"] for p in points]
    (
        db.table(table)
        .delete()
        .eq("portfolio_id", portfolio_id)
        .eq("is_estimated", True)
        .gte("date", min(dates))
        .lte("date", max(dates))
        .execute()
    )
    return len(rows)
