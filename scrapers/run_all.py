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
  trump_dice         Trump dice: menciones verificadas
  insiders_form4     Compras de ejecutivos (SEC Form 4)
  oge_trump          Trump compra: declaraciones OGE 278-T
  spensiones         Carteras AFP (Superintendencia de Pensiones)
  musk_dice          Elon Musk dice: menciones verificadas
  inverse_cramer     Inverse Cramer: lightning round CNBC
  stages/*.py        Etapas nuevas, orden alfabético, antes de radar_ia
  radar_ia           Portafolio Radar IA (después de rendimientos)

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
from stages import discover_stages, insert_before_radar

# La consola de Windows usa cp1252 por defecto y el resumen imprime ✓/✗.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

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
    ("etf_series", "Series reales de ETFs (precio del fondo)", False),
    ("benchmarks", "Benchmarks ^GSPC e ^IPSA", False),
    ("performance", "Series de rendimiento históricas", False),
    ("trump_dice", "Trump dice: menciones verificadas", False),
    # F10: después de performance y antes de radar_ia.
    ("insiders_form4", "Compras de ejecutivos (SEC Form 4)", False),
    ("oge_trump", "Trump compra: declaraciones OGE 278-T", False),
    ("spensiones", "Carteras AFP (Superintendencia de Pensiones)", False),
    ("musk_dice", "Elon Musk dice: menciones verificadas", False),
    ("inverse_cramer", "Inverse Cramer: lightning round CNBC", False),
    # D34: series reales por eventos (trump, musk, cramer real y compras) y AFP.
    # Sin esta etapa inverse-cramer-real quedaba sin serie (performance.py la salta).
    ("event_series", "Series reales por eventos (event_series.py)", False),
    ("afp_carteras", "Carteras de las 7 AFP (Cuadro 14)", False),
    ("afp_series", "Series reales AFP (Cuadro 14 mensual)", False),
    ("radar_ia", "Portafolio Radar IA (reglas consenso + momentum)", False),
    # D35: al final, cuando ya están todos los holdings del día. Solo envía
    # correos con TRADE_ALERTS_SEND_ENABLED=true (apagado por defecto).
    ("trade_alerts", "Alertas de compras y ventas (correo apagado por defecto)", False),
]
# STAGE_IDS y CRITICAL se arman después de descubrir scrapers/stages/*.py.

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
    from prices import collect_price_symbols, refresh_all, user_holdings_prices_enabled

    read_db = db
    if read_db is None and dry_run and user_holdings_prices_enabled():
        # Dry-run: lectura (no escritura) solo para contar los símbolos que
        # aportarían las tenencias de usuarios al basket de precios.
        from base import get_db

        try:
            read_db = get_db()
        except Exception as e:  # noqa: BLE001 - sin DB el dry-run sigue
            log(f"[prices] WARNING user_holdings: {e}")

    symbols, added = collect_price_symbols(read_db)
    if dry_run and user_holdings_prices_enabled():
        log(
            f"[prices] DRY-RUN: {added} símbolos de user_holdings se "
            f"agregarían ({len(symbols)} símbolos en total)"
        )
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


def run_insiders_form4(db, dry_run: bool) -> list[dict]:
    from insiders_form4 import InsidersForm4Adapter

    log("[insiders_form4] compras de ejecutivos (SEC Form 4)...")
    adapter = InsidersForm4Adapter(dry_run=dry_run)
    return [adapter.run(db)]


def run_oge_trump(db, dry_run: bool) -> list[dict]:
    from oge_trump import OgeTrumpAdapter

    log("[oge_trump] declaraciones OGE 278-T...")
    return [OgeTrumpAdapter(dry_run=dry_run).run(db)]


def run_spensiones(db, dry_run: bool) -> list[dict]:
    from spensiones import SpensionesAdapter

    log("[spensiones] carteras AFP (Superintendencia de Pensiones)...")
    adapter = SpensionesAdapter(dry_run=dry_run)
    return [adapter.run(db)]


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


def run_inverse_cramer(db, dry_run: bool) -> list[dict]:
    from inverse_cramer import InverseCramerAdapter, load_picks, sync_mentions

    log("[inverse_cramer] lightning round CNBC...")
    adapter = InverseCramerAdapter(dry_run=dry_run)
    summary = adapter.run(db)
    resumen = sync_mentions(db, load_picks(), dry_run=dry_run)
    from inverse_cramer_compras import InverseCramerComprasAdapter

    compras = InverseCramerComprasAdapter(dry_run=dry_run).run(db)
    return [summary, {"source": "inverse_cramer", "mentions": resumen}, compras]


def run_radar_ia(db, dry_run: bool) -> list[dict]:
    # Etapa agregada en la integración (F7 + F3): corre después de
    # precios y rendimientos porque usa consenso + momentum.
    from radar_ia import RadarIaAdapter

    if dry_run:
        log("[radar_ia] DRY-RUN: omitido (requiere leer holdings de la DB)")
        return [{"source": "radar_ia", "status": "skipped", "dry_run": True}]
    return [RadarIaAdapter().run(db)]

def run_etf_series(db, dry_run: bool) -> list[dict]:
    if dry_run:
        log("[etf_series] DRY-RUN: omitido (escribe series; requiere DB)")
        return [{"source": "etf_series", "status": "skipped", "dry_run": True}]
    from etf_series import main as etf_main

    etf_main([])
    return [{"source": "etf_series", "status": "ok"}]


def run_benchmarks(db, dry_run: bool) -> list[dict]:
    from benchmarks import DEFAULT_BENCHMARKS, DEFAULT_DAYS, refresh_all

    refresh_all(db, list(DEFAULT_BENCHMARKS), days=DEFAULT_DAYS, dry_run=dry_run)
    return [{"source": "benchmarks", "status": "ok", "dry_run": dry_run}]


def run_afp_carteras(db, dry_run: bool) -> list[dict]:
    from afp_carteras import AFPS, AfpCarterasAdapter

    out = []
    for afp in sorted(AFPS):
        if afp == "modelo":
            continue  # ya la escribe la etapa spensiones
        try:
            out.append(AfpCarterasAdapter(afp, dry_run=dry_run).run(db))
        except Exception as exc:  # noqa: BLE001 - una AFP no corta las demás
            log(f"[afp_carteras:{afp}] WARNING {exc}")
            out.append({"source": f"afp_carteras:{afp}", "status": "error", "error": str(exc)})
    return out


def run_trade_alerts(db, dry_run: bool) -> list[dict]:
    if dry_run:
        log("[trade_alerts] DRY-RUN: omitido (lee follows de la DB)")
        return [{"source": "trade_alerts", "status": "skipped", "dry_run": True}]
    from trade_alerts import main as ta_main

    ta_main([])
    return [{"source": "trade_alerts", "status": "ok"}]


def run_event_series(db, dry_run: bool) -> list[dict]:
    from event_series import main as event_main

    event_main(["--dry-run"] if dry_run else [])
    return [{"source": "event_series", "status": "ok", "dry_run": dry_run}]


def run_afp_series(db, dry_run: bool) -> list[dict]:
    from afp_series import main as afp_main

    afp_main(["--dry-run"] if dry_run else [])
    return [{"source": "afp_series", "status": "ok", "dry_run": dry_run}]


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
    "insiders_form4": run_insiders_form4,
    "oge_trump": run_oge_trump,
    "spensiones": run_spensiones,
    "musk_dice": run_musk_dice,
    "inverse_cramer": run_inverse_cramer,
    "event_series": run_event_series,
    "etf_series": run_etf_series,
    "benchmarks": run_benchmarks,
    "afp_carteras": run_afp_carteras,
    "trade_alerts": run_trade_alerts,
    "afp_series": run_afp_series,
    "radar_ia": run_radar_ia,
}

# Cada scrapers/stages/*.py define STAGE y run(). Orden alfabético, siempre
# antes de radar_ia. Sin archivos ahí, --list y la corrida no cambian.
STAGES, RUNNERS = insert_before_radar(STAGES, RUNNERS, discover_stages())
STAGE_IDS = [s[0] for s in STAGES]
CRITICAL = {s[0] for s in STAGES if s[2]}


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
