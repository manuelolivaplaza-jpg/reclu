"""
Series REALES de las carteras AFP desde las fotos mensuales del Cuadro 14 (D34).

Fuente oficial (Superintendencia de Pensiones), una foto por AFP y por mes:
  genera_desagregada_xsl.php?fecpro=AAAAMM&idu=N&listado=14
Se toman hasta 24 meses hacia atrás desde el último mes publicado.

Método (sin proyectar la cartera actual hacia atrás):
  - La foto del mes k (fecha de corte D_k) fija los pesos desde D_k hasta D_{k+1}.
  - Retorno diario = suma de peso x retorno del precio (Yahoo, sufijo .SN),
    renormalizado sobre los nemos con precio ese día y el anterior.
  - El índice parte en 0% en la primera foto con precios.
  - afp-consenso-chile: suma de MMUS$ de las 7 AFP por nemo, cada mes.
Se guarda con is_estimated = false (perf_store.save_real_series: borra solo
filas estimadas dentro del rango escrito).

Las fotos de meses cerrados no cambian: se guardan en data/afp_cuadro14/
para no volver a pedirlas.

  python afp_series.py --dry-run
  python afp_series.py --dry-run --slugs afp-habitat-acciones-cl --meses 6
  python afp_series.py                              # escribe series (ver reporte)
  python afp_series.py --consenso-holdings          # además holdings del consenso
"""

from __future__ import annotations

import argparse
import os
import time
from datetime import date
from typing import Any, Callable

from afp_carteras import AFPS, slug_for
from spensiones import (
    _decode,
    filas_a_holdings,
    iter_periodos,
    leer_cuerpo,
    parse_cuadro14,
    respuesta_publicada,
)

CONSENSO_SLUG = "afp-consenso-chile"
MAX_MESES = 24
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "afp_cuadro14")
REQUEST_DELAY_S = 0.5
MIN_COBERTURA = 0.5  # día sin al menos 50% del peso con precio: no se mueve el índice


def fotos_afp(
    leer: Callable[[str], bytes],
    desde: date,
    meses: int = MAX_MESES,
    buscar_hasta: int = 30,
) -> list[dict[str, Any]]:
    """[{fecpro, fecha, filas}] del más antiguo al más nuevo.

    Empieza en el último mes publicado (busca hacia atrás hasta `buscar_hasta`
    meses) y desde ahí junta `meses` fotos consecutivas; corta al primer hueco
    largo (3 meses seguidos sin publicar).
    """
    fotos: list[dict[str, Any]] = []
    huecos = 0
    encontrado = False
    for fecpro in iter_periodos(desde, buscar_hasta + meses):
        cuerpo = leer(fecpro)
        ok = respuesta_publicada(cuerpo)
        filas: list[dict[str, Any]] = []
        fecha = None
        if ok:
            fecha, filas = parse_cuadro14(_decode(cuerpo) if isinstance(cuerpo, bytes) else cuerpo)
        if not filas:
            if encontrado:
                huecos += 1
                if huecos >= 3:
                    break
            continue
        encontrado = True
        huecos = 0
        fotos.append({"fecpro": fecpro, "fecha": fecha, "filas": filas})
        if len(fotos) >= meses:
            break
    fotos.reverse()
    return fotos


def pesos_por_foto(fotos: list[dict[str, Any]]) -> list[tuple[str, dict[str, float]]]:
    """[(fecha_corte ISO, {nemo: peso 0..1})] ordenado por fecha."""
    out: list[tuple[str, dict[str, float]]] = []
    for f in fotos:
        hs = filas_a_holdings(f["filas"], f["fecha"], f["fecpro"])
        if not hs:
            continue
        total = sum(h.weight for h in hs)
        out.append((hs[0].as_of.isoformat(), {h.symbol: h.weight / total for h in hs}))
    out.sort(key=lambda x: x[0])
    return out


def consenso_fotos(por_afp: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    """Une las filas de las AFP por fecpro (solo meses que publicaron todas las que tienen datos)."""
    por_mes: dict[str, list[dict[str, Any]]] = {}
    fechas: dict[str, str | None] = {}
    cuantas: dict[str, int] = {}
    for fotos in por_afp.values():
        for f in fotos:
            por_mes.setdefault(f["fecpro"], []).extend(f["filas"])
            fechas.setdefault(f["fecpro"], f["fecha"])
            cuantas[f["fecpro"]] = cuantas.get(f["fecpro"], 0) + 1
    n = len([v for v in por_afp.values() if v])
    return [
        {"fecpro": m, "fecha": fechas[m], "filas": por_mes[m]}
        for m in sorted(por_mes)
        if cuantas[m] == n
    ]


def serie_mensual(
    pesos: list[tuple[str, dict[str, float]]],
    precios: dict[str, dict[str, float]],
    hasta: str | None = None,
) -> list[dict[str, Any]]:
    """Índice encadenado con rebalanceo en cada foto. [{date, value_pct}]."""
    if not pesos:
        return []
    dias = sorted({d for serie in precios.values() for d in serie if d >= pesos[0][0]})
    if hasta:
        dias = [d for d in dias if d <= hasta]
    if len(dias) < 2:
        return []
    index = 1.0
    out = [{"date": dias[0], "value_pct": 0.0}]
    k = 0
    for prev, hoy in zip(dias, dias[1:]):
        while k + 1 < len(pesos) and pesos[k + 1][0] <= prev:
            k += 1
        w = pesos[k][1]
        num = 0.0
        cubierto = 0.0
        for nemo, peso in w.items():
            s = precios.get(nemo) or {}
            p0, p1 = s.get(prev), s.get(hoy)
            if p0 and p1 and p0 > 0:
                num += peso * (p1 / p0 - 1)
                cubierto += peso
        if cubierto >= MIN_COBERTURA:
            index *= 1 + num / cubierto
        out.append({"date": hoy, "value_pct": round((index - 1) * 100, 4)})
    return out


def cobertura(pesos: list[tuple[str, dict[str, float]]], precios: dict[str, dict[str, float]]) -> float:
    """Peso promedio (0..1) de las fotos que tiene precios."""
    if not pesos:
        return 0.0
    vals = [sum(p for n, p in w.items() if precios.get(n)) for _, w in pesos]
    return sum(vals) / len(vals)


def _cache_leer(client, idu: str, mes_actual: str) -> Callable[[str], bytes]:
    os.makedirs(CACHE_DIR, exist_ok=True)

    def leer(fecpro: str) -> bytes:
        path = os.path.join(CACHE_DIR, f"{idu}_{fecpro}.html")
        if os.path.exists(path):
            with open(path, "rb") as fh:
                return fh.read()
        time.sleep(REQUEST_DELAY_S)
        cuerpo = leer_cuerpo(client, fecpro, idu)
        # Solo se cachean meses publicados y cerrados (no el mes en curso).
        if respuesta_publicada(cuerpo) and fecpro < mes_actual:
            with open(path, "wb") as fh:
                fh.write(cuerpo)
        return cuerpo

    return leer


def precios_sn(nemos: list[str], desde: str) -> dict[str, dict[str, float]]:
    from prices import yahoo_symbol
    from trump_dice import fetch_prices_yahoo

    mapa = {n: yahoo_symbol(n, "BCS", "CLP") for n in nemos}
    mapa = {n: y for n, y in mapa.items() if y}
    crudo = fetch_prices_yahoo(sorted(set(mapa.values())), desde)
    return {n: crudo[y] for n, y in mapa.items() if crudo.get(y)}


def consenso_holdings_rows(foto: dict[str, Any]) -> list[dict[str, Any]]:
    """Holdings del consenso para la última foto. previous_weight = weight:
    la primera carga no dispara alertas new_trade a los seguidores."""
    return [
        {
            "symbol": h.symbol, "name": h.name, "weight": h.weight,
            "previous_weight": h.weight, "asset_class": "equity",
            "exchange": "BCS", "currency": "CLP", "as_of": h.as_of.isoformat(),
        }
        for h in filas_a_holdings(foto["filas"], foto["fecha"], foto["fecpro"])
    ]


def main(argv: list[str] | None = None) -> None:
    import httpx

    ap = argparse.ArgumentParser(description="Series reales AFP desde el Cuadro 14 mensual")
    ap.add_argument("--dry-run", action="store_true", help="No escribe en Supabase")
    ap.add_argument("--meses", type=int, default=MAX_MESES, help="Fotos mensuales (máx. 24)")
    ap.add_argument("--slugs", nargs="*", default=None)
    ap.add_argument("--consenso-holdings", action="store_true",
                    help="Escribe también los holdings de la última foto de afp-consenso-chile")
    args = ap.parse_args(argv or [])
    meses = max(1, min(MAX_MESES, args.meses))

    hoy = date.today()
    mes_actual = f"{hoy.year:04d}{hoy.month:02d}"
    client = httpx.Client(headers={"User-Agent": "Mozilla/5.0 reclu-scraper/1.0"}, follow_redirects=True)
    por_afp: dict[str, list[dict[str, Any]]] = {}
    for afp, info in sorted(AFPS.items()):
        por_afp[afp] = fotos_afp(_cache_leer(client, info["idu"], mes_actual), hoy, meses)
        f = por_afp[afp]
        print(f"[afp_series] {afp}: {len(f)} fotos" + (f" {f[0]['fecpro']}..{f[-1]['fecpro']}" if f else ""))

    objetivos: dict[str, list[dict[str, Any]]] = {slug_for(a): v for a, v in por_afp.items()}
    objetivos[CONSENSO_SLUG] = consenso_fotos(por_afp)
    if args.slugs:
        objetivos = {s: v for s, v in objetivos.items() if s in set(args.slugs)}

    pesos = {s: pesos_por_foto(v) for s, v in objetivos.items()}
    nemos = sorted({n for ps in pesos.values() for _, w in ps for n in w})
    desde = min((ps[0][0] for ps in pesos.values() if ps), default=None)
    if not desde:
        print("[afp_series] sin fotos: nada que hacer")
        return
    precios = precios_sn(nemos, desde)
    print(f"[afp_series] precios: {len(precios)}/{len(nemos)} nemos con serie .SN desde {desde}")

    db = None
    if not args.dry_run:
        from base import get_db

        db = get_db()
    for slug, ps in pesos.items():
        serie = serie_mensual(ps, precios)
        cob = cobertura(ps, precios)
        if not serie:
            print(f"WARNING {slug}: sin serie")
            continue
        print(f"{slug}: {len(ps)} fotos, {len(serie)} días {serie[0]['date']}..{serie[-1]['date']}, "
              f"acumulado {serie[-1]['value_pct']:+.2f}%, cobertura de precios {cob:.0%}")
        if args.dry_run:
            continue
        res = db.table("portfolios").select("id").eq("slug", slug).maybe_single().execute()
        data = getattr(res, "data", None) if res is not None else None
        if not data:
            print(f"-- {slug}: no está en la DB")
            continue
        from perf_store import save_real_series

        save_real_series(db, data["id"], serie)
        if slug == CONSENSO_SLUG and args.consenso_holdings and objetivos[slug]:
            rows = consenso_holdings_rows(objetivos[slug][-1])
            payload = [{"portfolio_id": data["id"], **r} for r in rows]
            db.table("holdings").upsert(payload, on_conflict="portfolio_id,symbol,as_of").execute()
            print(f"OK {slug}: {len(payload)} holdings al {rows[0]['as_of'] if rows else '-'}")
    if args.dry_run:
        print("(dry-run: nada escrito)")


if __name__ == "__main__":
    import sys

    main(sys.argv[1:])
