"""
Historial de lightning rounds de Cramer (backfill de candidatos, solo lectura).

Fuente pública verificada 2026-10-23: el mapa del sitio diario de CNBC,
  https://www.cnbc.com/site-map/articles/{AAAA}/{Mes}/{D}/
lista cada artículo del día (las URL vienen escapadas como \\u002F). De ahí se
toman las URL cramers-lightning-round-*.html (p. ej. 2025-10-03, 06, 07, 08).

HIPÓTESIS / SIN VERIFICAR: la URL prueba que hubo un lightning round ese día,
no qué dijo Cramer de cada ticker. Los candidatos salen como "pendiente",
sin ticker ni cita (no se lee el cuerpo: copyright) y NO generan posiciones.
Para entrar a data/cramer_picks.json hay que verificarlos a mano.

Este script nunca escribe en Supabase ni en el JSON: imprime o guarda en --out.
  python cramer_history.py --dry-run --desde 2025-09-01 --hasta 2025-10-31
"""

from __future__ import annotations

import argparse
import json
import time
from datetime import date, timedelta

import httpx

from base import log
from inverse_cramer import DATA_PATH, USER_AGENT, _LIGHTNING_URL, load_picks, rss_candidates

SITEMAP_DAY = "https://www.cnbc.com/site-map/articles/{y}/{month}/{d}/"
MONTHS = ("January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December")
RATE_LIMIT_SECS = 1.0
MAX_DIAS = 400


def sitemap_url(day: date) -> str:
    return SITEMAP_DAY.format(y=day.year, month=MONTHS[day.month - 1], d=day.day)


def extract_lightning_urls(page: str) -> list[str]:
    texto = page.replace("\\u002F", "/").replace("\\/", "/")
    vistos: list[str] = []
    for url in _LIGHTNING_URL.findall(texto):
        if url not in vistos:
            vistos.append(url)
    return vistos


def iter_days(desde: date, hasta: date) -> list[date]:
    if hasta < desde:
        raise ValueError("--hasta es anterior a --desde")
    n = (hasta - desde).days + 1
    if n > MAX_DIAS:
        raise ValueError(f"rango de {n} días; máximo {MAX_DIAS}")
    return [desde + timedelta(days=i) for i in range(n)]


def collect(desde: date, hasta: date, get=None, sleep=time.sleep) -> list[dict]:
    if get is None:
        client = httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=30.0,
                              follow_redirects=True)
        get = client.get
    urls: list[str] = []
    for day in iter_days(desde, hasta):
        try:
            resp = get(sitemap_url(day))
        except httpx.HTTPError as exc:
            log(f"[cramer_history] {day}: {exc}")
            continue
        if resp.status_code != 200:
            log(f"[cramer_history] {day}: HTTP {resp.status_code}")
            continue
        urls.extend(extract_lightning_urls(resp.text))
        sleep(RATE_LIMIT_SECS)
    known = {p["url"] for p in load_picks(DATA_PATH)}
    candidatos = rss_candidates(urls, known)
    for c in candidatos:
        c["hipotesis"] = True
        c["fuente"] = "cnbc-site-map"
    return candidatos


def main() -> None:
    p = argparse.ArgumentParser(description="Candidatos históricos de lightning round (hipótesis)")
    p.add_argument("--dry-run", action="store_true",
                   help="Siempre solo lectura; se acepta por consistencia")
    p.add_argument("--desde", type=date.fromisoformat, required=True)
    p.add_argument("--hasta", type=date.fromisoformat, default=date.today())
    p.add_argument("--out", help="Guardar candidatos en este JSON (fuera de data/)")
    a = p.parse_args()
    cands = collect(a.desde, a.hasta)
    texto = json.dumps(cands, indent=2, ensure_ascii=False)
    if a.out:
        with open(a.out, "w", encoding="utf-8") as fh:
            fh.write(texto)
    print(texto)
    log(f"[cramer_history] {len(cands)} candidatos pendientes (hipótesis, nada escrito)")


if __name__ == "__main__":
    main()
