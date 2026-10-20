"""Flujos diarios de ETFs iShares (F35): "dónde entra la plata".

Un ETF crea o destruye acciones cuando hay demanda: si entran compras, el
fondo emite acciones nuevas y el patrimonio crece. El flujo diario se
estima como:

    flujo_usd = Δ acciones en circulación × NAV por acción

La fuente de las acciones en circulación es la cabecera del CSV oficial de
iShares (`Shares Outstanding`), la misma que usa `scrapers/etfs.py` para los
holdings. El NAV por acción se estima con el patrimonio del fondo dividido
por las acciones en circulación (el patrimonio se estima desde el propio CSV:
`Market Value / Weight (%)` de cada posición).

Solo se incluyen emisores que publican acciones en circulación en un archivo
oficial: por ahora iShares. ARK, Global X y VanEck no lo hacen en un formato
estable, así que quedan fuera (ver NOTAS-F35.md).

Legal: datos de mercado públicos, sin datos personales. Es un dato
informativo: no se ejecutan órdenes ni es recomendación de inversión
(Ley Fintec). No se usan datos de funcionarios de EE.UU.

El estado anterior (acciones del día previo) vive en la tabla `etf_flows`:
cada corrida escribe una fila por (symbol, fecha) y calcula el flujo contra
la fila anterior más reciente de ese símbolo.
"""

from __future__ import annotations

import argparse
from typing import Any

import etfs

# Slug del portafolio -> ticker del ETF. Solo iShares: es el único emisor
# con acciones en circulación en un archivo oficial descargable.
TICKER_POR_SLUG: dict[str, str] = {
    "ech": "ECH",
    "eww": "EWW",
    "ewz": "EWZ",
    "ibit": "IBIT",
}

# Símbolos que el scraper puede escribir. `symbol` en la tabla etf_flows
# guarda el ticker en mayúsculas (como en la tabla `prices`).
FUENTE = "ishares"


def slug_para_ticker(ticker: str) -> str | None:
    """Inverso de TICKER_POR_SLUG (para consultas)."""
    ticker = (ticker or "").upper()
    for slug, tick in TICKER_POR_SLUG.items():
        if tick == ticker:
            return slug
    return None


def fetch_flow_data(slug: str) -> dict:
    """Descarga el CSV de iShares y devuelve la foto del fondo.

    Devuelve: symbol, fecha, acciones (en circulación), nav (por acción),
    net_assets (patrimonio estimado) y url (fuente).
    """
    entry = etfs.ISHARES_FUNDS.get(slug)
    if not entry:
        raise ValueError(f"unknown iShares fund: {slug}")
    product_id, path_slug = entry
    _rows, header = etfs.fetch_ishares(slug, with_header=True)

    acciones = header.get("shares_outstanding")
    if not acciones or acciones <= 0:
        raise ValueError(f"ishares {slug}: la cabecera no trae 'Shares Outstanding'")

    return {
        "symbol": TICKER_POR_SLUG[slug],
        "fecha": header.get("as_of"),
        "acciones": float(acciones),
        "nav": header.get("nav"),
        "net_assets": header.get("net_assets_usd"),
        "net_assets_metodo": header.get("net_assets_metodo"),
        "url": etfs.ISHARES_HOLDINGS.format(product_id=product_id, slug=path_slug),
    }


def calcular_flujo(acciones_hoy: float, acciones_prev: float | None, nav: float | None) -> float:
    """Flujo diario en USD: Δ acciones × NAV.

    Sin lectura anterior el flujo es 0 (no se inventa un delta) y sin NAV
    también: sin precio por acción no hay monto.
    """
    if acciones_prev is None or not nav:
        return 0.0
    return (acciones_hoy - acciones_prev) * nav


def acciones_previas(db, symbol: str, fecha: str) -> float | None:
    """Acciones en circulación de la fila anterior más reciente del símbolo.

    Solo mira fechas estrictamente anteriores a `fecha`, para que reejecutar
    el mismo día no se compare consigo mismo.
    """
    res = (
        db.table("etf_flows")
        .select("acciones,fecha")
        .eq("symbol", symbol)
        .lt("fecha", fecha)
        .order("fecha", desc=True)
        .limit(1)
        .execute()
    )
    if not res.data:
        return None
    return float(res.data[0]["acciones"])


def upsert_flujos(db, rows: list[dict]) -> None:
    """Escribe (symbol, fecha, acciones, nav, flujo_usd). Idempotente."""
    if not rows:
        return
    payload = [
        {
            "symbol": r["symbol"],
            "fecha": r["fecha"],
            "acciones": r["acciones"],
            "nav": r["nav"],
            "flujo_usd": r["flujo_usd"],
            "fuente": r.get("fuente", FUENTE),
            "source_url": r.get("url"),
        }
        for r in rows
    ]
    db.table("etf_flows").upsert(payload, on_conflict="symbol,fecha").execute()


def collect(db, dry_run: bool = False) -> dict:
    """Recorre los ETF de iShares y arma las filas de flujo.

    En dry-run NO toca Supabase (ni para leer): imprime lo que se escribiría
    y deja el flujo en 0 porque sin la lectura anterior no hay delta real.
    """
    from base import log

    filas: list[dict] = []
    errores = 0
    for slug, ticker in TICKER_POR_SLUG.items():
        try:
            data = fetch_flow_data(slug)
        except Exception as e:  # noqa: BLE001 - un fondo caído no tumba la corrida
            log(f"[etf_flows] WARNING {slug}: {e}")
            errores += 1
            continue

        prev = None if dry_run else acciones_previas(db, ticker, data["fecha"])
        flujo = calcular_flujo(data["acciones"], prev, data["nav"])
        fila = {
            "symbol": ticker,
            "fecha": data["fecha"],
            "acciones": data["acciones"],
            "nav": data["nav"],
            "flujo_usd": flujo,
            "fuente": FUENTE,
            "url": data["url"],
        }
        filas.append(fila)

        nav_txt = f"{data['nav']:.4f}" if data["nav"] else "n/d"
        if dry_run:
            log(
                f"[etf_flows] DRY-RUN {ticker}: acciones {data['acciones']:,.0f} "
                f"@ NAV {nav_txt} ({data['fecha']}) - sin escribir"
            )
        else:
            log(
                f"[etf_flows] {ticker}: acciones {data['acciones']:,.0f} "
                f"(prev {prev if prev is not None else 'n/d'}) @ NAV {nav_txt} "
                f"-> flujo {flujo:,.0f} USD"
            )

    if not dry_run and filas:
        upsert_flujos(db, filas)

    return {
        "fuentes_ok": len(filas),
        "fuentes_error": errores,
        "total": len(TICKER_POR_SLUG),
        "dry_run": dry_run,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Flujos diarios de ETFs iShares (Δ acciones × NAV)"
    )
    parser.add_argument("--dry-run", action="store_true", help="Solo imprimir, no escribir")
    args = parser.parse_args()

    from base import get_db

    db = None if args.dry_run else get_db()
    resumen = collect(db, dry_run=args.dry_run)
    print(f"OK {resumen['fuentes_ok']}/{resumen['total']} ETF iShares")


if __name__ == "__main__":
    main()
