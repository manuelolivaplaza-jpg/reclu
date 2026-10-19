"""
Orquestador de todos los scrapers de reclu.cl, por etapas.

Corre las fuentes en el orden correcto:
  POSICIONES → PRECIOS → RENDIMIENTOS → SNAPSHOTS

Etapas de posiciones:
  house_disclosure   PTRs de la Cámara (disclosures-clerk.house.gov)
  senate_disclosure  PTRs del Senado (efdsearch.senate.gov, curl_cffi)
  renta4             Carteras Renta 4 Chile
  btg_pactual        Cartera Concentrada BTG Chile
  infoprobidad       Declaraciones de acciones de autoridades CL (SPARQL)
  sec13f             Fondos 13F (EDGAR)
  etfs               ARK / Global X / iShares / VanEck
Etapas de mercado:
  prices             Cierres diarios Yahoo Finance → tabla prices
  compute_returns    return_pct de cada holding
  performance        Series históricas → portfolio_performance

Uso:
    python run_all.py                          # todas las etapas default
    python run_all.py --only house etfs        # solo esas etapas
    python run_all.py --skip senate_disclosure # todo menos esa
    python run_all.py --dry-run                # SIN escribir en Supabase
    python run_all.py --list                   # ver etapas

Salida: resumen ok/error por etapa. Exit code != 0 solo si falla una etapa
CRÍTICA (house/senate/renta4/btg); las opcionales (13f, etfs, precios,
rendimientos) fallan con warning sin tumbar la corrida.
"""

from __future__ import annotations

import argparse
import sys
import time
import traceback

from base import get_db, log

# Etapas en orden de ejecución. Etapas "posiciones" primero (los scrapers
# escriben holdings), luego precios, luego rendimientos, luego snapshots.
STAGES: list[tuple[str, str, bool]] = [
    # (id, descripción, es_crítica)
    ("house_disclosure", "PTRs Cámara de EE.UU. (oficial)", True),
    ("senate_disclosure", "PTRs Senado de EE.UU. (efdsearch)", False),
    ("renta4", "Carteras Renta 4 Chile", True),
    ("btg_pactual", "Cartera Concentrada BTG Chile", True),
    ("infoprobidad", "Declaraciones InfoProbidad CL (SPARQL)", False),
    ("sec13f", "Filings 13F (SEC EDGAR)", False),
    ("etfs", "ETFs: ARK, Global X, iShares, VanEck", False),
    ("prices", "Precios EOD Yahoo Finance", False),
    ("compute_returns", "Rendimientos por holding", False),
    ("performance", "Series de rendimiento históricas", False),
    ("trump_dice", "Trump dice: menciones verificadas", False),
    ("musk_dice", "Elon Musk dice: menciones verificadas", False),
    ("radar_ia", "Portafolio Radar IA (reglas consenso + momentum)", False),
]
STAGE_IDS = [s[0] for s in STAGES]
CRITICAL = {s[0] for s in STAGES if s[2]}

# Capitol Trades quedó OBSOLETO: login wall (docs/sources.md). Se mantiene
# capitol_trades.py en el repo por referencia pero no corre por defecto ni
# tiene etapa. Si algún día reabre, agregarla arriba con es_crítica=False.


def run_house_disclosure(db, dry_run: bool) -> list[dict]:
    from house_disclosure import HouseDisclosureAdapter

    results = []
    # Trump NO presenta PTRs en la Cámara: la fuente es del Legislative
    # Resource Center de la Cámara y él no es miembro. Solo congresistas.
    for politician in ["pelosi"]:
        log(f"[house_disclosure] iniciando {politician}...")
        adapter = HouseDisclosureAdapter(politician=politician, dry_run=dry_run)
        results.append(adapter.run(db))
    return results


def run_senate_disclosure(db, dry_run: bool) -> list[dict]:
    from senate_disclosure import SenateDisclosureAdapter

    adapter = SenateDisclosureAdapter(lookback_days=45, dry_run=dry_run)
    return adapter.run_per_senator(db)


def run_renta4(db, dry_run: bool) -> list[dict]:
    from renta4 import Renta4Adapter

    results = []
    for portfolio in ["moderada", "moderada-ampliada"]:
        log(f"[renta4] iniciando {portfolio}...")
        adapter = Renta4Adapter(portfolio=portfolio, dry_run=dry_run)
        results.append(adapter.run(db))
    return results


def run_btg_pactual(db, dry_run: bool) -> list[dict]:
    from btg_pactual import BtgPactualAdapter

    log("[btg_pactual] Cartera Concentrada...")
    adapter = BtgPactualAdapter(dry_run=dry_run)
    return [adapter.run(db)]


def run_infoprobidad(db, dry_run: bool) -> list[dict]:
    from infoprobidad import InfoProbidadAdapter

    log("[infoprobidad] declaraciones de autoridades CL...")
    adapter = InfoProbidadAdapter(dry_run=dry_run)
    return [adapter.run(db)]


def run_sec13f(db, dry_run: bool) -> list[dict]:
    if dry_run:
        from load_13f import FUND_SLUG
        from sec13f import FUNDS, fetch_holdings

        ok = 0
        for name, cik in FUNDS.items():
            if name not in FUND_SLUG:
                continue
            try:
                holdings = fetch_holdings(cik, name)
                top = holdings[0] if holdings else None
                preview = f", top: {top['issuer']} {top['weight']}%" if top else ""
                log(f"[sec13f] DRY-RUN {name}: {len(holdings)} holdings{preview}")
                ok += 1
            except Exception as e:  # noqa: BLE001
                log(f"[sec13f] WARNING {name}: {e}")
        return [{"source": "sec13f", "status": "ok", "dry_run": True, "funds": ok}]
    from load_13f import main as load_13f_main

    load_13f_main()
    return [{"source": "sec13f", "status": "ok"}]


def run_etfs(db, dry_run: bool) -> list[dict]:
    import etfs

    all_slugs = sorted(
        list(etfs.ARK_FUNDS)
        + list(etfs.GLOBALX_FUNDS)
        + list(etfs.ISHARES_FUNDS)
        + list(etfs.VANECK_FUNDS)
    )
    ok = 0
    for slug in all_slugs:
        try:
            rows = etfs.fetch_etf(slug)
            if not rows:
                log(f"[etfs] WARNING {slug}: 0 holdings")
                continue
            if dry_run:
                top = sorted(rows, key=lambda r: -r["weight"])[0]
                log(f"[etfs] DRY-RUN {slug}: {len(rows)} holdings (top: {top['symbol']} {top['weight']}%)")
                ok += 1
                continue
            pf = db.table("portfolios").select("id").eq("slug", slug).maybe_single().execute()
            if not pf.data:
                log(f"[etfs] WARNING {slug}: portfolio no está en DB (corre el seed)")
                continue
            payload = [
                {
                    "portfolio_id": pf.data["id"],
                    "symbol": r["symbol"],
                    "name": r["name"],
                    "weight": r["weight"],
                    "asset_class": r["asset_class"],
                    "currency": r["currency"],
                    "as_of": r["as_of"],
                    "previous_weight": 0.0,
                }
                for r in rows
            ]
            db.table("holdings").upsert(payload, on_conflict="portfolio_id,symbol,as_of").execute()
            log(f"[etfs] OK {slug}: {len(rows)} holdings")
            ok += 1
        except Exception as e:  # noqa: BLE001
            log(f"[etfs] WARNING {slug}: {e}")
    return [{"source": "etfs", "status": "ok", "etfs_ok": ok, "total": len(all_slugs)}]


def run_prices(db, dry_run: bool) -> list[dict]:
    import os

    from prices import DEFAULT_SYMBOLS, refresh_all

    env = os.environ.get("PRICE_SYMBOLS", "")
    symbols = env.split(",") if env else list(DEFAULT_SYMBOLS)
    summary = refresh_all(db, symbols, dry_run=dry_run)
    return [{"source": "prices", "status": "ok", **summary}]


def run_compute_returns(db, dry_run: bool) -> list[dict]:
    from compute_returns import compute_returns

    if dry_run:
        log("[compute_returns] DRY-RUN: omitido (requiere leer holdings de la DB)")
        return [{"source": "compute_returns", "status": "skipped", "dry_run": True}]
    summary = compute_returns(db)
    return [{"source": "compute_returns", "status": "ok", **summary}]


def run_performance(db, dry_run: bool) -> list[dict]:
    from performance import main as perf_main

    if dry_run:
        log("[performance] DRY-RUN: omitido (requiere leer holdings de la DB)")
        return [{"source": "performance", "status": "skipped", "dry_run": True}]
    perf_main()
    return [{"source": "performance", "status": "ok"}]


def run_trump_dice(db, dry_run: bool) -> list[dict]:
    # F8. En dry-run no escribe ni lee Supabase, igual que radar_ia:
    # los pesos se ven con `python trump_dice.py --dry-run`.
    from trump_dice import TrumpDiceAdapter, load_menciones, sync_mentions

    if dry_run:
        log("[trump_dice] DRY-RUN: omitido (usar trump_dice.py --dry-run)")
        return [{"source": "trump_dice", "status": "skipped", "dry_run": True}]
    summary = TrumpDiceAdapter(dry_run=False).run(db)
    resumen = sync_mentions(db, load_menciones(), dry_run=False)
    return [summary, {"source": "trump_dice", "mentions": resumen}]


def run_musk_dice(db, dry_run: bool) -> list[dict]:
    # F11. En dry-run no escribe ni lee Supabase, igual que trump_dice.
    # Los pesos se ven con `python musk_dice.py --dry-run` (no llama a Yahoo).
    from musk_dice import MuskDiceAdapter, load_menciones, sync_musk_mentions

    if dry_run:
        log("[musk_dice] DRY-RUN: omitido (usar musk_dice.py --dry-run)")
        return [{"source": "musk_dice", "status": "skipped", "dry_run": True}]
    summary = MuskDiceAdapter(dry_run=False).run(db)
    resumen = sync_musk_mentions(db, load_menciones(), dry_run=False)
    return [summary, {"source": "musk_dice", "mentions": resumen}]


def run_radar_ia(db, dry_run: bool) -> list[dict]:
    # Etapa agregada en la integración (F7 + F3): corre después de
    # precios y rendimientos porque usa consenso + momentum.
    from radar_ia import RadarIaAdapter

    if dry_run:
        log("[radar_ia] DRY-RUN: omitido (requiere leer holdings de la DB)")
        return [{"source": "radar_ia", "status": "skipped", "dry_run": True}]
    return [RadarIaAdapter().run(db)]

RUNNERS = {
    "house_disclosure": run_house_disclosure,
    "senate_disclosure": run_senate_disclosure,
    "renta4": run_renta4,
    "btg_pactual": run_btg_pactual,
    "infoprobidad": run_infoprobidad,
    "sec13f": run_sec13f,
    "etfs": run_etfs,
    "prices": run_prices,
    "compute_returns": run_compute_returns,
    "performance": run_performance,
    "trump_dice": run_trump_dice,
    "musk_dice": run_musk_dice,
    "radar_ia": run_radar_ia,
}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Orquestador de scrapers de reclu.cl",
        epilog="Un fallo de una fuente no tumba la corrida: solo las etapas "
        "críticas (house, senate, renta4, btg) afectan el código de salida.",
    )
    parser.add_argument(
        "--only",
        nargs="*",
        choices=STAGE_IDS,
        help="Correr solo estas etapas (en el orden canónico)",
    )
    parser.add_argument(
        "--skip",
        nargs="*",
        choices=STAGE_IDS,
        help="Correr todas menos estas etapas",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Sin escribir NADA en Supabase (solo fetch + parse + resumen)",
    )
    parser.add_argument("--list", action="store_true", help="Listar etapas y salir")
    args = parser.parse_args()

    if args.list:
        for sid, desc, critical in STAGES:
            flag = "CRÍTICA" if critical else "opcional"
            print(f"{sid:20s} {flag:9s} {desc}")
        return

    if args.only and args.skip:
        sys.exit("--only y --skip son mutuamente excluyentes")

    if args.only:
        selected = [s for s in STAGE_IDS if s in args.only]
    elif args.skip:
        selected = [s for s in STAGE_IDS if s not in args.skip]
    else:
        selected = list(STAGE_IDS)

    log(f"=== INICIO corrida scrapers ({'DRY-RUN' if args.dry_run else 'ESCRITURA'}) ===")
    log(f"Etapas: {', '.join(selected)}")

    # dry-run no necesita conexión a Supabase (las etapas que leen la DB
    # se saltan solas)
    db = None
    if not args.dry_run:
        db = get_db()

    stage_results: list[tuple[str, bool, list[dict]]] = []

    for stage in selected:
        desc = next(d for s, d, _ in STAGES if s == stage)
        critical = stage in CRITICAL
        log(f"--- Etapa: {stage} ({desc}) ---")
        t0 = time.time()
        try:
            runner = RUNNERS[stage]
            results = runner(db, args.dry_run)
            elapsed = time.time() - t0
            log(f"--- {stage}: OK en {elapsed:.1f}s ---")
            stage_results.append((stage, True, results))
        except Exception as e:  # noqa: BLE001 — una etapa no tumba la corrida
            elapsed = time.time() - t0
            log(f"--- {stage}: ERROR en {elapsed:.1f}s: {e} ---")
            if critical:
                log(traceback.format_exc())
            stage_results.append((stage, False, [{"source": stage, "error": str(e)}]))

    # ===== Resumen final =====
    print("\n" + "=" * 62)
    print(f"SCRAPER RUN SUMMARY ({'DRY-RUN' if args.dry_run else 'ESCRITURA'})")
    print("=" * 62)
    failed_critical: list[str] = []
    for stage, ok, results in stage_results:
        icon = "✓" if ok else "✗"
        crit = " [crítica]" if stage in CRITICAL else ""
        print(f"{icon} {stage}{crit}")
        for r in results:
            print(f"    {r}")
        if not ok and stage in CRITICAL:
            failed_critical.append(stage)
    print("=" * 62)
    ok_count = sum(1 for _, ok, _ in stage_results if ok)
    print(f"{ok_count}/{len(stage_results)} etapas OK")
    if failed_critical:
        print(f"ETAPAS CRÍTICAS FALLIDAS: {', '.join(failed_critical)}")
        sys.exit(1)
    if ok_count < len(stage_results):
        print("(hubo fallos en etapas opcionales — revisar logs arriba)")
    sys.exit(0)


if __name__ == "__main__":
    main()
