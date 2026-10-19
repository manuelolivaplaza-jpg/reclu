"""
Radar IA — portafolio temático generado por reglas transparentes (F7).

No es IA-ML: son dos reglas deterministas sobre los datos del propio catálogo,
publicadas y auditables:

  REGLA 1 (Consenso): cuenta en cuántas carteras del catálogo aparece cada
  símbolo (peso > 0). Requiere estar en >= MIN_HOLDERS carteras.

  REGLA 2 (Momentum): rankea por return_pct promedio (retorno desde la
  declaración). Requiere return_pct no nulo en al menos una cartera.

  Score = z(consenso) + z(momentum). Se toman los TOP_N símbolos y se asignan
  pesos decrecientes (suman 100).

El resultado se upserta como holdings del portafolio 'radar-ia' con
previous_weight preservado (vía SourceAdapter.run), de modo que
detect-changes genera alertas cuando la composición del radar cambia.

IMPORTANTE: es información, no recomendación. El portafolio se rotula como
generado por reglas y su página lleva el disclaimer estándar.

Uso (NO ejecutar contra la base real desde agentes):
    python radar_ia.py --dry-run   # imprime la selección sin escribir
    python radar_ia.py             # upserta en Supabase (requiere env vars)
"""

from __future__ import annotations

import argparse
import statistics
from collections import defaultdict
from datetime import date

from base import Holding, SourceAdapter, get_db

# ---- Parámetros de las reglas (documentados, ajustables) ----
RADAR_SLUG = "radar-ia"
MIN_HOLDERS = 3       # Regla 1: consenso mínimo de carteras
TOP_N = 9             # Tamaño del radar
# Pesos decrecientes: el símbolo con mayor score pesa más. Suman 100.
WEIGHT_STEPS = [18.0, 16.0, 14.0, 12.0, 10.0, 10.0, 8.0, 6.0, 6.0]


def _z(values: dict[str, float]) -> dict[str, float]:
    """Estandariza valores a z-scores; devuelve 0 si la desviación es 0."""
    if not values:
        return {}
    mean = statistics.fmean(values.values())
    stdev = statistics.pstdev(values.values()) if len(values) > 1 else 0.0
    if stdev == 0:
        return {k: 0.0 for k in values}
    return {k: (v - mean) / stdev for k, v in values.items()}


def build_radar(
    rows: list[dict],
    min_holders: int = MIN_HOLDERS,
    top_n: int = TOP_N,
) -> list[tuple[str, float, float, int]]:
    """
    Reglas del Radar IA a partir de filas de holdings del catálogo.

    rows: [{portfolio_id, symbol, weight, return_pct}, ...] (una fila por
    holding vigente de cada cartera).

    Devuelve [(symbol, weight, score, holder_count), ...] ordenado por score,
    con pesos que suman 100. Lógica pura: testeable sin red.
    """
    holders_by_symbol: dict[str, set[str]] = defaultdict(set)
    returns_by_symbol: dict[str, list[float]] = defaultdict(list)

    for row in rows:
        symbol = (row.get("symbol") or "").strip().upper()
        if not symbol:
            continue
        weight = float(row.get("weight") or 0)
        if weight <= 0:
            continue
        holders_by_symbol[symbol].add(row.get("portfolio_id") or "")
        ret = row.get("return_pct")
        if ret is not None and isinstance(ret, (int, float)):
            returns_by_symbol[symbol].append(float(ret))

    # Regla 1 — consenso: número de carteras distintas con el símbolo.
    consensus = {
        sym: len(portfolios)
        for sym, portfolios in holders_by_symbol.items()
        if len(portfolios) >= min_holders
    }
    if not consensus:
        return []

    # Regla 2 — momentum: retorno medio desde declaración (0 si no hay dato).
    momentum = {
        sym: statistics.fmean(returns_by_symbol[sym]) if returns_by_symbol.get(sym) else 0.0
        for sym in consensus
    }

    z_consensus = _z({s: float(c) for s, c in consensus.items()})
    z_momentum = _z(momentum)
    score = {sym: z_consensus.get(sym, 0.0) + z_momentum.get(sym, 0.0) for sym in consensus}

    ranked = sorted(score.items(), key=lambda kv: (-kv[1], kv[0]))[:top_n]
    weights = WEIGHT_STEPS[: len(ranked)]
    scale = sum(weights) / 100.0
    return [
        (sym, round(w / scale, 2), score_val, consensus[sym])
        for (sym, score_val), w in zip(ranked, weights)
    ]


class RadarIaAdapter(SourceAdapter):
    """Adapter que construye el Radar IA desde las tablas del catálogo."""

    name = "radar_ia"
    portfolio_slug = RADAR_SLUG

    def fetch_raw(self):
        """Lee todos los holdings vigentes del catálogo (excepto radar-ia)."""
        db = get_db()
        radar = (
            db.table("portfolios").select("id").eq("slug", RADAR_SLUG).maybe_single().execute()
        )
        radar_id = (radar.data or {}).get("id")

        page = db.table("holdings").select("portfolio_id,symbol,weight,return_pct").limit(5000)
        rows: list[dict] = []
        result = page.execute()
        while result.data:
            rows.extend(result.data)
            if len(result.data) < 1000:
                break
            result = db.table("holdings").select(
                "portfolio_id,symbol,weight,return_pct"
            ).limit(5000).offset(len(rows)).execute()

        if radar_id:
            rows = [r for r in rows if r.get("portfolio_id") != radar_id]
        return rows

    def normalize(self, raw: list[dict]) -> list[Holding]:
        picks = build_radar(raw)
        today = date.today()
        return [
            Holding(
                symbol=sym,
                name=sym,
                weight=weight,
                asset_class="equity",
                currency="USD",
                as_of=today,
            )
            for sym, weight, _score, _count in picks
        ]


def main() -> None:
    parser = argparse.ArgumentParser(description="Radar IA — reglas transparentes")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Muestra la selección sin escribir en la base",
    )
    args = parser.parse_args()

    adapter = RadarIaAdapter()
    raw = adapter.fetch_raw()
    picks = build_radar(raw)

    if not picks:
        print("Radar IA: sin símbolos con consenso suficiente (nada que hacer)")
        return

    print(f"Radar IA — {len(picks)} símbolos (consenso >= {MIN_HOLDERS} carteras):")
    for sym, weight, score, count in picks:
        print(f"  {sym:<8} peso={weight:5.1f}%  score={score:+.2f}  carteras={count}")

    if args.dry_run:
        print("(dry-run: no se escribió nada)")
        return

    summary = adapter.run()
    print(f"Listo: {summary}")


if __name__ == "__main__":
    main()
