"""D74: motor unico de series por rebalanceos encadenados.

Reglas (una sola implementacion para performance.py y reconstruct_history.py):
- Retorno ponderado por PRECIO RELATIVO: cada simbolo entra como P(t)/P(inicio
  del tramo). Nunca se suma w * precio: eso mezclaba monedas y escalas (una
  accion de 65.000 CLP pesaba mas que una de 24 USD con el mismo peso).
- Cada foto de cartera (as_of) abre un tramo. El NAV es continuo: el tramo
  nuevo arranca en el nivel con que cerro el anterior (sin saltos falsos).
- Precios con forward-fill: un feriado de una bolsa no mueve la serie.
- Un simbolo sin precio al inicio del tramo queda fuera de ese tramo y los
  pesos se renormalizan; no se inventa precio hacia atras.
- Fotos repetidas (mismos pesos) no rebalancean.
"""

from __future__ import annotations

from bisect import bisect_right
from typing import Iterable

Snapshot = tuple[str, dict[str, float]]


def _price_index(rows: Iterable[tuple[str, float]]) -> tuple[list[str], list[float]]:
    clean: dict[str, float] = {}
    for day, close in rows:
        try:
            value = float(close)
        except (TypeError, ValueError):
            continue
        if value > 0:
            clean[str(day)[:10]] = value
    days = sorted(clean)
    return days, [clean[d] for d in days]


def _same_weights(a: dict[str, float], b: dict[str, float], tol: float = 1e-6) -> bool:
    if set(a) != set(b):
        return False
    ta, tb = sum(a.values()) or 1.0, sum(b.values()) or 1.0
    return all(abs(a[s] / ta - b[s] / tb) <= tol for s in a)


def chain_series(
    snapshots: list[Snapshot],
    prices: dict[str, list[tuple[str, float]]],
    start: str | None = None,
    end: str | None = None,
) -> list[tuple[str, float]]:
    """[(fecha, nivel)] con nivel 1.0 en el primer dia.

    snapshots: [(as_of, {simbolo: peso})] en cualquier orden. La primera foto
    se usa tambien antes de su as_of (proyeccion hacia atras, como siempre).
    """
    idx = {s: _price_index(r) for s, r in prices.items()}
    idx = {s: v for s, v in idx.items() if v[0]}
    snaps: list[Snapshot] = []
    for as_of, weights in sorted(snapshots, key=lambda x: x[0]):
        w = {s: float(x) for s, x in weights.items() if x and float(x) > 0}
        if not w:
            continue
        if snaps and _same_weights(snaps[-1][1], w):
            continue
        snaps.append((str(as_of)[:10], w))
    if not snaps:
        return []

    used = {s for _, w in snaps for s in w if s in idx}
    calendar = sorted({d for s in used for d in idx[s][0]})
    if start:
        calendar = [d for d in calendar if d >= start]
    if end:
        calendar = [d for d in calendar if d <= end]
    if not calendar:
        return []

    def px(sym: str, day: str) -> float | None:
        days, vals = idx[sym]
        i = bisect_right(days, day)
        return vals[i - 1] if i else None

    # Primer dia: todos los simbolos con precio de la primera foto ya cotizan.
    first_syms = [s for s in snaps[0][1] if s in idx]
    if not first_syms:
        return []
    first_day = max(idx[s][0][0] for s in first_syms)
    calendar = [d for d in calendar if d >= first_day]
    if not calendar:
        return []

    def basket(weights: dict[str, float], day: str) -> dict[str, tuple[float, float]] | None:
        live = {s: w for s, w in weights.items() if s in idx and px(s, day) is not None}
        total = sum(live.values())
        if total <= 0:
            return None
        return {s: (w / total, px(s, day)) for s, w in live.items()}

    out: list[tuple[str, float]] = []
    nav = 1.0
    seg = 0
    # La foto vigente al primer dia es la ultima con as_of <= primer dia.
    while seg + 1 < len(snaps) and snaps[seg + 1][0] <= calendar[0]:
        seg += 1
    current = basket(snaps[seg][1], calendar[0])
    if current is None:
        return []
    for day in calendar:
        level = nav * sum(w * px(s, day) / p0 for s, (w, p0) in current.items())
        out.append((day, level))
        # Rebalanceo al cierre del dia si hay una foto nueva vigente desde hoy.
        changed = False
        while seg + 1 < len(snaps) and snaps[seg + 1][0] <= day:
            seg += 1
            changed = True
        if changed:
            nxt = basket(snaps[seg][1], day)
            if nxt is not None:
                nav = level
                current = nxt
    return out


def to_pct(levels: list[tuple[str, float]], decimals: int = 4) -> list[dict]:
    """Niveles -> [{date, value_pct}] con el primer punto en 0 %."""
    if not levels or levels[0][1] <= 0:
        return []
    base = levels[0][1]
    return [{"date": d, "value_pct": round((v / base - 1.0) * 100.0, decimals)} for d, v in levels]


def daily_jumps(points: list[dict], threshold: float = 0.15) -> list[tuple[str, str, float]]:
    """Saltos de un punto al siguiente mayores a `threshold` (auditoria)."""
    out = []
    for a, b in zip(points, points[1:]):
        la, lb = 1 + float(a["value_pct"]) / 100, 1 + float(b["value_pct"]) / 100
        if la > 0 and abs(lb / la - 1) > threshold:
            out.append((a["date"], b["date"], round((lb / la - 1) * 100, 2)))
    return out
