"""
Fusión segura de holdings para resolve_tickers (D34).

Problema: renombrar "BERKSHIRE HATHAWAY INC" -> BRK-B choca con la clave única
(portfolio_id, symbol, as_of) cuando el portafolio ya tiene BRK-B ese día.

Plan (puro, sin red ni DB): para cada fila con nombre que tiene ticker,
  - si (portfolio, as_of, ticker) no existe: rename (update symbol);
  - si existe (o ya se renombró otra fila a ese ticker): merge, se suma el
    peso a la fila destino y la fila con nombre se archiva.
El script NO aplica fusiones: genera un SQL revisable (una transacción) que
Manu corre a mano. Cada fila fusionada se copia entera (to_jsonb) a
public.holdings_merged antes de sacarla de holdings, así que se puede
restaurar (ver comentario al final del SQL).
"""

from __future__ import annotations

import re
from typing import Any, Callable

US_CLASS_RE = re.compile(r"^([A-Z]{1,5})[./]([A-Z])$")
CHILE_EXCHANGES = {"BCS", "SSE", "SN", "SANTIAGO"}


def us_class_hyphen(symbol: str | None) -> str | None:
    """BRK.B / BRK/B -> BRK-B (formato Yahoo). Otros símbolos, igual."""
    if not symbol:
        return symbol
    m = US_CLASS_RE.match(symbol.strip().upper())
    return f"{m.group(1)}-{m.group(2)}" if m else symbol


def is_chile_row(row: dict) -> bool:
    return (str(row.get("currency") or "").upper() == "CLP"
            or str(row.get("exchange") or "").upper() in CHILE_EXCHANGES)


def class_dot_target(row: dict) -> str | None:
    """Ticker con guion para filas de EE.UU. con clase con punto; None si no aplica."""
    sym = str(row.get("symbol") or "")
    if is_chile_row(row) or not US_CLASS_RE.match(sym.strip().upper()):
        return None
    target = us_class_hyphen(sym)
    return target if target != sym else None


def plan_merges(
    rows: list[dict],
    existing: list[dict],
    target_for: Callable[[dict], str | None],
) -> dict[str, Any]:
    """rows: filas a renombrar {id, portfolio_id, as_of, weight, symbol, ...}.
    existing: filas que ya tienen el ticker destino {id, portfolio_id, as_of, weight, symbol}.
    """
    targets: dict[tuple, dict] = {}
    for r in existing:
        key = (r["portfolio_id"], str(r["as_of"])[:10], r["symbol"])
        targets.setdefault(key, {"id": r["id"], "existing": True})
    renames: list[dict] = []
    merges: list[dict] = []
    skipped = 0
    ordered = sorted(rows, key=lambda r: (r["portfolio_id"], str(r["as_of"]), -float(r.get("weight") or 0), str(r["id"])))
    for r in ordered:
        ticker = target_for(r)
        if not ticker or ticker == r["symbol"]:
            skipped += 1
            continue
        key = (r["portfolio_id"], str(r["as_of"])[:10], ticker)
        if key not in targets:
            renames.append({"id": r["id"], "old": r["symbol"], "ticker": ticker})
            targets[key] = {"id": r["id"], "existing": False}
        else:
            t = targets[key]
            merges.append({"from_id": r["id"], "into_id": t["id"], "old": r["symbol"], "ticker": ticker,
                           "weight": float(r.get("weight") or 0), "into_existing": t["existing"]})
    return {
        "renames": renames,
        "merges": merges,
        "counts": {
            "filas": len(rows),
            "renombrar": len(renames),
            "fusionar": len(merges),
            "fusionar_en_existente": sum(1 for m in merges if m["into_existing"]),
            "fusionar_en_renombrada": sum(1 for m in merges if not m["into_existing"]),
            "omitidas": skipped,
        },
    }


def _q(value: Any) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def render_sql(plan: dict[str, Any]) -> str:
    c = plan["counts"]
    out = [
        "-- D34 resolve_tickers: plan revisable. NO lo corre ningún script.",
        f"-- renombrar {c['renombrar']} filas (UPDATE symbol), fusionar {c['fusionar']} "
        f"(UPDATE weight en la fila destino + copia a holdings_merged + DELETE de la fila con nombre).",
        "-- Requiere la migración 064 (holdings_merged). Una sola transacción.",
        "begin;",
        "",
        "-- 1) Renombres sin choque",
    ]
    for r in plan["renames"]:
        out.append(f"update public.holdings set symbol = {_q(r['ticker'])} "
                   f"where id = {_q(r['id'])} and symbol = {_q(r['old'])};")
    out += ["", "-- 2) Fusiones: archivar, sumar peso (tope 100), sacar la fila con nombre"]
    for m in plan["merges"]:
        f, i = _q(m["from_id"]), _q(m["into_id"])
        out.append(f"-- {m['old']} -> {m['ticker']}")
        out.append(f"insert into public.holdings_merged (holding_id, merged_into, ticker, row_data) "
                   f"select h.id, {i}, {_q(m['ticker'])}, to_jsonb(h) from public.holdings h "
                   f"where h.id = {f} and h.symbol = {_q(m['old'])};")
        out.append(f"update public.holdings set weight = least(100, weight + "
                   f"coalesce((select weight from public.holdings where id = {f} and symbol = {_q(m['old'])}), 0)) "
                   f"where id = {i};")
        out.append(f"delete from public.holdings where id = {f} and symbol = {_q(m['old'])};")
    out += [
        "",
        "commit;",
        "",
        "-- Restaurar una fusión (ejemplo):",
        "--   update public.holdings h set weight = h.weight - (m.row_data->>'weight')::numeric",
        "--     from public.holdings_merged m where m.holding_id = '<id>' and h.id = m.merged_into;",
        "--   insert into public.holdings select (jsonb_populate_record(null::public.holdings, m.row_data)).*",
        "--     from public.holdings_merged m where m.holding_id = '<id>';",
        "",
    ]
    return "\n".join(out)
