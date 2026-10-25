"""
Auditoría de activos sin precio (D35). Solo lectura: no escribe en Supabase.

  python price_coverage.py --dry-run                 # clasifica y cuenta (sin red externa)
  python price_coverage.py --dry-run --probe         # además prueba los arreglos en Yahoo/OpenFIGI
  python price_coverage.py --dry-run --probe --out price_coverage_report.csv

Toma el último snapshot de holdings de cada portafolio, mira qué símbolos no
tienen ninguna fila en `prices`, los clasifica (price_classes.classify) y, con
--probe, verifica el arreglo propuesto:
  - cusip          -> OpenFIGI (ticker_map.resolve_cusips)
  - nombre_emisor  -> cache de resolve_tickers o búsqueda Yahoo con el nombre limpio
  - bolsa_extranjera -> sufijo por bolsa
  - ticker / raro  -> candidatos de prices.yahoo_candidates (incluye el mapa manual)
Un arreglo cuenta solo si Yahoo devuelve precios.

Salidas:
  - CSV con símbolo, clase, portafolios, peso máx., arreglo, estado y motivo;
  - antes/después: faltantes hoy, se omiten (no son acciones), arreglables, quedan;
  - price_coverage_manual_candidates.json: arreglos verificados para revisar y
    copiar a data/yahoo_manual_map.json (el mapa manual que lee prices.py);
  - price_coverage_skip.sql (revisable, NO se aplica): marca asset_class
    cash/bond en filas que hoy dicen 'equity', para que dejen de contarse.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import time
from collections import defaultdict
from typing import Any, Callable

from price_classes import classify, clean_issuer_query, is_skip, suffix_for_exchange

PAGE = 1000


def latest_rows(db) -> list[dict]:
    rows: list[dict] = []
    start = 0
    while True:
        batch = (db.table("holdings").select("id, portfolio_id, as_of, symbol, name, exchange, currency, asset_class, weight")
                 .range(start, start + PAGE - 1).execute().data or [])
        rows.extend(batch)
        if len(batch) < PAGE:
            break
        start += PAGE
    latest: dict[str, str] = {}
    for r in rows:
        d = str(r.get("as_of") or "")
        if d > latest.get(r["portfolio_id"], ""):
            latest[r["portfolio_id"]] = d
    return [r for r in rows if str(r.get("as_of") or "") == latest.get(r["portfolio_id"])]


def symbols_with_prices(db, symbols: list[str]) -> set[str]:
    have: set[str] = set()
    for s in symbols:
        res = db.table("prices").select("symbol").eq("symbol", s).limit(1).execute()
        if res.data:
            have.add(s)
    return have


def group_missing(rows: list[dict], have: set[str]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for r in rows:
        s = (r.get("symbol") or "").strip()
        if not s or s in have:
            continue
        g = out.setdefault(s, {"symbol": s, "name": r.get("name") or "", "exchange": r.get("exchange") or "",
                               "currency": r.get("currency") or "", "asset_class": r.get("asset_class") or "",
                               "portfolios": set(), "max_weight": 0.0, "row_ids": []})
        g["portfolios"].add(r["portfolio_id"])
        g["max_weight"] = max(g["max_weight"], float(r.get("weight") or 0))
        g["row_ids"].append(r["id"])
    for g in out.values():
        g["clase"] = classify(g["symbol"], g["exchange"], g["currency"], g["asset_class"], g["name"])
    return out


def propose(g: dict, name_cache: dict, cusip_cache: dict) -> list[str]:
    """Candidatos Yahoo a verificar para un símbolo (sin red)."""
    from holdings_merge import us_class_hyphen
    from prices import yahoo_candidates

    c = g["clase"]
    if c == "cusip":
        t = cusip_cache.get(g["symbol"].upper())
        return [us_class_hyphen(t)] if t else []
    if c == "nombre_emisor":
        t = name_cache.get(g["symbol"].strip())
        return [us_class_hyphen(t)] if t else []
    if c == "bolsa_extranjera":
        t = suffix_for_exchange(g["symbol"], g["exchange"])
        return [t] if t else []
    return yahoo_candidates(g["symbol"], g["exchange"], g["currency"])


def probe(missing: dict[str, dict], fetch: Callable[[str], list], name_resolver=None,
          cusip_resolver=None, name_cache: dict | None = None, cusip_cache: dict | None = None,
          sleep=time.sleep, foreign_resolver=None) -> None:
    """Completa estado/arreglo/motivo en cada grupo (red: Yahoo y OpenFIGI)."""
    name_cache = name_cache if name_cache is not None else {}
    cusip_cache = cusip_cache if cusip_cache is not None else {}
    cusips = [g["symbol"] for g in missing.values() if g["clase"] == "cusip"]
    if cusips and cusip_resolver:
        cusip_resolver(cusips, cusip_cache)
    for g in missing.values():
        if is_skip(g["clase"]):
            g.update(estado="omitir", arreglo="", motivo=f"no es acción ({g['clase']})")
            continue
        if g["clase"] == "nombre_emisor" and g["symbol"].strip() not in name_cache and name_resolver:
            # D37: el resolvedor recibe el nombre completo (limpia y verifica nombre).
            name_cache[g["symbol"].strip()] = name_resolver(g["symbol"].strip())
        cands = propose(g, name_cache, cusip_cache)
        if foreign_resolver and g["clase"] in ("ticker", "ticker_raro") and g.get("name"):
            ft = foreign_resolver(g["symbol"], g["name"])
            if ft and ft not in cands:
                cands = cands + [ft]
        if not cands:
            motivo = {
                "cusip": "OpenFIGI sin ticker de EE.UU.",
                "nombre_emisor": "búsqueda Yahoo sin match claro",
                "bolsa_extranjera": "bolsa sin sufijo Yahoo conocido",
            }.get(g["clase"], "sin candidato Yahoo")
            g.update(estado="sin_resolver", arreglo="", motivo=motivo)
            continue
        found = ""
        for cand in cands:
            try:
                if fetch(cand):
                    found = cand
                    break
            except Exception:  # noqa: BLE001 - 404 u otro: siguiente candidato
                pass
            sleep(0.3)
        if found:
            g.update(estado="arreglable", arreglo=found, motivo=f"Yahoo responde con {found}")
        else:
            g.update(estado="sin_resolver", arreglo="|".join(cands),
                     motivo="Yahoo sin precios (deslistado, fusionado o ticker inexistente)")


def classify_only(missing: dict[str, dict]) -> None:
    for g in missing.values():
        if is_skip(g["clase"]):
            g.update(estado="omitir", arreglo="", motivo=f"no es acción ({g['clase']})")
        else:
            g.update(estado="pendiente_probe", arreglo="", motivo="correr con --probe para verificar")


def summary(missing: dict[str, dict]) -> dict[str, Any]:
    por_clase: dict[str, int] = defaultdict(int)
    por_estado: dict[str, int] = defaultdict(int)
    for g in missing.values():
        por_clase[g["clase"]] += 1
        por_estado[g["estado"]] += 1
    antes = len(missing)
    despues = antes - por_estado.get("omitir", 0) - por_estado.get("arreglable", 0)
    return {"antes": antes, "despues": despues, "por_clase": dict(por_clase), "por_estado": dict(por_estado)}


def write_csv(path: str, missing: dict[str, dict]) -> None:
    cols = ["symbol", "name", "clase", "estado", "arreglo", "motivo", "exchange", "currency",
            "asset_class", "portafolios", "peso_max"]
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(cols)
        for g in sorted(missing.values(), key=lambda g: (g["estado"], -g["max_weight"], g["symbol"])):
            w.writerow([g["symbol"], g["name"], g["clase"], g["estado"], g["arreglo"], g["motivo"], g["exchange"],
                        g["currency"], g["asset_class"], len(g["portfolios"]), round(g["max_weight"], 2)])


def skip_sql(missing: dict[str, dict]) -> str:
    out = ["-- D35: revisable, NO lo aplica ningún script. Modifica asset_class de filas existentes",
           "-- (equity -> cash/bond) para que no cuenten como 'sin precio'.", "begin;"]
    n = 0
    for g in missing.values():
        target = {"efectivo": "cash", "bono": "bond"}.get(g["clase"])
        if not target or g["asset_class"] == target:
            continue
        ids = ", ".join("'" + str(i) + "'" for i in g["row_ids"])
        out.append(f"update public.holdings set asset_class = '{target}' where id in ({ids}) and asset_class = 'equity';")
        n += 1
    out.append("commit;")
    out.insert(2, f"-- {n} símbolos")
    return "\n".join(out) + "\n"


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description="Activos sin precio: clasificación y arreglos (solo lectura)")
    ap.add_argument("--dry-run", action="store_true", help="Siempre solo lectura; se acepta por consistencia")
    ap.add_argument("--probe", action="store_true", help="Verifica arreglos en Yahoo/OpenFIGI (red)")
    ap.add_argument("--out", default="price_coverage_report.csv")
    args = ap.parse_args(argv)

    from base import get_db

    db = get_db()
    rows = latest_rows(db)
    symbols = sorted({(r.get("symbol") or "").strip() for r in rows if r.get("symbol")})
    have = symbols_with_prices(db, symbols)
    missing = group_missing(rows, have)
    print(f"{len(symbols)} símbolos en el último snapshot, {len(have)} con precio, {len(missing)} sin precio")

    if args.probe:
        import resolve_tickers as rt
        from prices import fetch_with_retry
        from ticker_map import load_cusip_cache, resolve_cusips

        from name_resolution import resolve_foreign_ticker, resolve_issuer

        name_cache = rt.load_cache("resolve_tickers_cache.json")

        def by_name(name: str) -> str | None:
            try:
                return resolve_issuer(name, rt.fetch_quotes)[0]
            except Exception:  # noqa: BLE001
                return None

        def foreign(symbol: str, name: str) -> str | None:
            try:
                return resolve_foreign_ticker(symbol, name, rt.fetch_quotes)[0]
            except Exception:  # noqa: BLE001
                return None

        probe(missing, lambda s: fetch_with_retry(s, 10), by_name, resolve_cusips,
              name_cache, load_cusip_cache(), foreign_resolver=foreign)
    else:
        classify_only(missing)

    s = summary(missing)
    print(f"ANTES sin precio: {s['antes']}  ->  DESPUÉS (estimado): {s['despues']}")
    print(f"por clase: {s['por_clase']}")
    print(f"por estado: {s['por_estado']}")
    write_csv(args.out, missing)
    verified = {g["symbol"].upper(): g["arreglo"] for g in missing.values() if g["estado"] == "arreglable"}
    with open("price_coverage_manual_candidates.json", "w", encoding="utf-8") as fh:
        json.dump(verified, fh, indent=1, ensure_ascii=False, sort_keys=True)
    with open("price_coverage_skip.sql", "w", encoding="utf-8") as fh:
        fh.write(skip_sql(missing))
    print(f"CSV: {os.path.abspath(args.out)} | candidatos manuales: {len(verified)} | "
          "SQL revisable: price_coverage_skip.sql (no aplicado)")


if __name__ == "__main__":
    main()
