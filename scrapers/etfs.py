"""ETF holdings from issuer-published files (daily, exact weights).

Issuer formats, all public and keyless:

- ARK Invest: stable CSV URL per fund, columns
  date,fund,company,ticker,cusip,shares,market value ($),weight (%).
  Weight is already exact — no need to derive it.
- Global X: date-stamped CSV URL
  assets.globalxetfs.com/funds/holdings/{ticker}_full-holdings_{YYYYMMDD}.csv
  with '% of Net Assets' as the weight column.
- iShares (BlackRock): official daily CSV discovered 2026-10-18 —
  https://www.ishares.com/us/products/{product_id}/{any-slug}/latest-holdings.csv
  (the slug in the path is ignored; the numeric product id resolves the fund).
  Header row starts with "Ticker,"; weight column is "Weight (%)".
  Verified live: ECH 239618, EWW 239670, EWZ 239612, IBIT 333011.
- VanEck: daily XLSX at
  https://www.vaneck.com/us/en/etf/equity/{ticker-lower}/holdings/download/xlsx/
  Columns: Number,Ticker,Holding Name,...,'% of Net Assets' (as "20.06%").
  Verified live: SMH.
- Subversive (NANC/GOP, F26): the issuer website returns 403 to curl and
  loads holdings with JS. The official source is Form N-PORT on EDGAR
  (CIK 1742912, Tidal Trust I). Verified live 2026-10-19:
  NANC = series S000088363 ("Unusual Whales Subversive Democratic Trading
  ETF"), GOP = series S000088364 ("Unusual Whales Subversive Republican
  Trading ETF"). Each N-PORT covers one series; weight = pctVal.

Not scrapeable (verified 2026-10-18): Invesco QQQ (406 on every holdings
endpoint), ICOL (fund no longer exists in iShares catalog).

Holdings are stored into the same `holdings` table as the 13F scrapers
(portfolio must exist, keyed by slug).
"""

from __future__ import annotations

import csv
import io
import json
import re
import xml.etree.ElementTree as ET
from datetime import date, datetime

import httpx

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) reclu-scraper/1.0"
# SEC exige un User-Agent identificable con contacto.
SEC_USER_AGENT = "reclu-scraper/1.0 (contacto@reclu.cl)"

# ARK family: slug -> URL of the daily holdings CSV
ARK_FUNDS: dict[str, str] = {
    "arkk": "https://assets.ark-funds.com/fund-documents/funds-etf-csv/ARK_INNOVATION_ETF_ARKK_HOLDINGS.csv",
    "arkg": "https://assets.ark-funds.com/fund-documents/funds-etf-csv/ARK_GENOMIC_REVOLUTION_ETF_ARKG_HOLDINGS.csv",
    "arkw": "https://assets.ark-funds.com/fund-documents/funds-etf-csv/ARK_NEXT_GENERATION_INTERNET_ETF_ARKW_HOLDINGS.csv",
    "arkq": "https://assets.ark-funds.com/fund-documents/funds-etf-csv/ARK_AUTONOMOUS_TECH._&_ROBOTICS_ETF_ARKQ_HOLDINGS.csv",
    "arkf": "https://assets.ark-funds.com/fund-documents/funds-etf-csv/ARK_FINTECH_INNOVATION_ETF_ARKF_HOLDINGS.csv",
}

# Global X funds: slug -> ticker used in the holdings URL.
# Verified live 2026-10-12: copx/lit/bug/hero resolve; betz/ring 404'd
# (URL changed or fund merged) and are intentionally NOT listed.
GLOBALX_FUNDS: dict[str, str] = {
    "copx": "copx",   # Global X Copper Miners
    "lit": "lit",     # Global X Lithium & Battery Tech
    "bug": "bug",     # Global X Cybersecurity
    "hero": "hero",   # Global X Video Games & Esports
}

# iShares funds: slug -> (product_id, name for the path slug).
# Product ids verified live from ishares.com/us/products/etf-investments
# and the official latest-holdings.csv endpoint (2026-10-18).
ISHARES_FUNDS: dict[str, tuple[int, str]] = {
    "ech": (239618, "ishares-msci-chile-etf"),      # MSCI Chile (audiencia CL)
    "eww": (239670, "ishares-msci-mexico-etf"),     # MSCI Mexico
    "ewz": (239612, "ishares-msci-brazil-etf"),     # MSCI Brazil
    "ibit": (333011, "ishares-bitcoin-trust-etf"),  # Bitcoin Trust (lista en Santiago)
}

# VanEck funds: slug -> ticker (lowercase, used in the download URL).
VANECK_FUNDS: dict[str, str] = {
    "smh": "smh",  # VanEck Semiconductor
}

# Subversive ETFs (F26): slug -> series on the Tidal Trust I N-PORT.
# Series ids verified live on EDGAR 2026-10-19. The series name is kept as a
# fallback for when the trust changes an id.
SUBVERSIVE_FUNDS: dict[str, dict[str, str]] = {
    "nanc-etf": {
        "series_id": "S000088363",
        "series_name": "Unusual Whales Subversive Democratic Trading ETF",
    },
    "gop-etf": {
        "series_id": "S000088364",
        "series_name": "Unusual Whales Subversive Republican Trading ETF",
    },
}

SUBVERSIVE_CIK = "1742912"
SEC_SUBMISSIONS = "https://data.sec.gov/submissions/CIK{cik:0>10}.json"
SEC_NPORT_DOC = "https://www.sec.gov/Archives/edgar/data/{cik}/{accession}/primary_doc.xml"

GLOBALX_LISTING = "https://www.globalxetfs.com/funds/{ticker}/"
GLOBALX_HOLDINGS = "https://assets.globalxetfs.com/funds/holdings/{ticker}_full-holdings_{date}.csv"
ISHARES_HOLDINGS = "https://www.ishares.com/us/products/{product_id}/{slug}/latest-holdings.csv"
VANECK_HOLDINGS = "https://www.vaneck.com/us/en/etf/equity/{ticker}/holdings/download/xlsx/"

# Caches scoped to one process: NANC and GOP share the trust's submissions
# feed and most N-PORT candidate documents.
_SUBMISSIONS_CACHE: dict[str, dict] = {}
_NPORT_DOC_CACHE: dict[str, str] = {}


def _get(url: str) -> str:
    resp = httpx.get(url, headers={"User-Agent": USER_AGENT}, timeout=30.0, follow_redirects=True)
    resp.raise_for_status()
    return resp.text


def fetch_ark(slug: str) -> list[dict]:
    """ARK holdings: exact weights straight from the issuer CSV."""
    url = ARK_FUNDS.get(slug)
    if not url:
        raise ValueError(f"unknown ARK fund: {slug}")
    text = _get(url)
    reader = csv.DictReader(io.StringIO(text))

    rows: list[dict] = []
    for r in reader:
        weight = (r.get("weight (%)") or "").strip().rstrip("%")
        ticker = (r.get("ticker") or "").strip()
        if not ticker:  # cash / private names without ticker
            continue
        try:
            weight_val = float(weight)
        except ValueError:
            continue
        rows.append(
            {
                "symbol": ticker,
                "name": (r.get("company") or "").strip(),
                "weight": weight_val,
                "asset_class": "etf",
                "currency": "USD",
                "as_of": date.today().isoformat(),
            }
        )
    return rows


def _latest_globalx_date(ticker: str) -> str:
    """Newest YYYYMMDD whose holdings CSV returns HTTP 200 and starts with 'Global X'.

    The fund page no longer links the file. Probe yesterday, then walk back
    at most five days (offsets 1..5).
    """
    from datetime import datetime, timedelta

    today = datetime.now()
    for days_back in range(1, 6):
        file_date = (today - timedelta(days=days_back)).strftime("%Y%m%d")
        url = GLOBALX_HOLDINGS.format(ticker=ticker, date=file_date)
        try:
            resp = httpx.get(
                url,
                headers={"User-Agent": USER_AGENT},
                timeout=10.0,
                follow_redirects=True,
            )
        except httpx.HTTPError:
            continue
        if resp.status_code == 200 and resp.text.startswith("Global X"):
            return file_date
    raise ValueError(f"no holdings link found for {ticker}")


def fetch_globalx(slug: str) -> list[dict]:
    """Global X holdings: '% of Net Assets' column is the weight."""
    ticker = GLOBALX_FUNDS.get(slug)
    if not ticker:
        raise ValueError(f"unknown Global X fund: {slug}")
    file_date = _latest_globalx_date(ticker)
    text = _get(GLOBALX_HOLDINGS.format(ticker=ticker, date=file_date))

    # The CSV has 2 junk lines before the real header.
    lines = text.splitlines()
    header_idx = next(i for i, ln in enumerate(lines) if ln.startswith("% of Net Assets"))
    reader = csv.DictReader(io.StringIO("\n".join(lines[header_idx:])))

    rows: list[dict] = []
    for r in reader:
        ticker_val = (r.get("Ticker") or "").strip()
        weight_raw = (r.get("% of Net Assets") or "").strip()
        if not ticker_val or not weight_raw:  # cash, FX, no ticker
            continue
        try:
            weight_val = float(weight_raw)
        except ValueError:
            continue
        if weight_val <= 0:
            continue
        rows.append(
            {
                "symbol": ticker_val.split()[0],  # 'HBM CN' -> 'HBM'
                "name": (r.get("Name") or "").strip(),
                "weight": weight_val,
                "asset_class": "etf",
                "currency": "USD",
                "as_of": file_date,
            }
        )
    return rows


def fetch_ishares(slug: str) -> list[dict]:
    """iShares holdings: CSV oficial con columna 'Weight (%)'.

    Formato: ~10 líneas de metadatos, luego header 'Ticker,Name,Sector,...'
    y filas con comillas. La fecha viene en 'Fund Holdings as of,"Oct 15, 2026"'.
    """
    entry = ISHARES_FUNDS.get(slug)
    if not entry:
        raise ValueError(f"unknown iShares fund: {slug}")
    product_id, path_slug = entry
    text = _get(ISHARES_HOLDINGS.format(product_id=product_id, slug=path_slug))

    lines = text.splitlines()
    header_idx = next(
        (i for i, ln in enumerate(lines) if ln.startswith("Ticker,")),
        None,
    )
    if header_idx is None:
        raise ValueError(f"ishares {slug}: header 'Ticker,' no encontrado")

    # Fecha de la cartera: 'Fund Holdings as of,"Oct 15, 2026"'
    as_of = date.today().isoformat()
    m = re.search(r'Fund Holdings as of,"(\w{3} (\d{1,2}), (\d{4}))"', text)
    if m:
        try:
            parsed = datetime.strptime(m.group(1), "%b %d, %Y")
            as_of = parsed.date().isoformat()
        except ValueError:
            pass

    reader = csv.DictReader(io.StringIO("\n".join(lines[header_idx:])))
    rows: list[dict] = []
    for r in reader:
        ticker = (r.get("Ticker") or "").strip().strip('"')
        weight_raw = (r.get("Weight (%)") or "").strip().strip('"')
        if not ticker or ticker in ("-", ""):
            continue
        try:
            weight_val = float(weight_raw)
        except ValueError:
            continue
        if weight_val <= 0:
            continue
        rows.append(
            {
                "symbol": ticker,
                "name": (r.get("Name") or "").strip().strip('"') or ticker,
                "weight": weight_val,
                "asset_class": "etf",
                "currency": "USD",
                "as_of": as_of,
            }
        )
    return rows


def fetch_vaneck(slug: str) -> list[dict]:
    """VanEck holdings: XLSX diario con '% of Net Assets' ('20.06%')."""
    ticker = VANECK_FUNDS.get(slug)
    if not ticker:
        raise ValueError(f"unknown VanEck fund: {slug}")

    resp = httpx.get(
        VANECK_HOLDINGS.format(ticker=ticker),
        headers={"User-Agent": USER_AGENT},
        timeout=45.0,
        follow_redirects=True,
    )
    resp.raise_for_status()

    import io as _io
    import warnings

    from openpyxl import load_workbook

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # hoja sin estilos por defecto
        wb = load_workbook(_io.BytesIO(resp.content), read_only=True)
    ws = wb.active

    rows: list[dict] = []
    header: dict[str, int] = {}
    for row in ws.iter_rows(values_only=True):
        cells = ["" if c is None else str(c).strip() for c in row]
        if "Ticker" in cells and "Holding Name" in cells:
            header = {name: i for i, name in enumerate(cells)}
            continue
        if not header or not cells:
            continue
        if len(cells) <= max(header.values()):
            continue
        ticker_val = cells[header["Ticker"]]
        if not ticker_val or ticker_val in ("--", "-"):
            continue
        weight_raw = cells[header.get("% of Net Assets", -1)] if "% of Net Assets" in header else ""
        weight_clean = weight_raw.rstrip("%").replace(",", "")
        try:
            weight_val = float(weight_clean)
        except ValueError:
            continue
        if weight_val <= 0:
            continue
        rows.append(
            {
                "symbol": ticker_val,
                "name": cells[header["Holding Name"]] or ticker_val,
                "weight": weight_val,
                "asset_class": "etf",
                "currency": "USD",
                "as_of": date.today().isoformat(),
            }
        )
    return rows


def _sec_get(url: str) -> httpx.Response:
    resp = httpx.get(
        url,
        headers={"User-Agent": SEC_USER_AGENT, "Accept-Encoding": "gzip, deflate"},
        timeout=30.0,
        follow_redirects=True,
    )
    resp.raise_for_status()
    return resp


def _nport_accessions() -> list[str]:
    """Recent NPORT-P accession numbers for the Subversive trust (newest first)."""
    if SUBVERSIVE_CIK not in _SUBMISSIONS_CACHE:
        resp = _sec_get(SEC_SUBMISSIONS.format(cik=SUBVERSIVE_CIK))
        _SUBMISSIONS_CACHE[SUBVERSIVE_CIK] = resp.json()
    recent = _SUBMISSIONS_CACHE[SUBVERSIVE_CIK].get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    accessions = recent.get("accessionNumber", [])
    return [
        accession
        for form, accession in zip(forms, accessions)
        if form == "NPORT-P" and accession
    ]


def _nport_series_id(xml_text: str) -> str | None:
    m = re.search(r"<seriesId>\s*([^<\s]+)\s*</seriesId>", xml_text)
    return m.group(1) if m else None


def _latest_nport_doc(series_id: str, series_name: str) -> str:
    """Newest N-PORT XML that belongs to the given series.

    EDGAR publishes one primary_doc.xml per series, so the only way to map an
    accession to NANC/GOP is to read the seriesId inside the document. Both
    ETFs share the cache, which keeps the run to a few small requests.
    """
    for accession in _nport_accessions()[:80]:
        doc = _NPORT_DOC_CACHE.get(accession)
        if doc is None:
            url = SEC_NPORT_DOC.format(
                cik=SUBVERSIVE_CIK, accession=accession.replace("-", "")
            )
            try:
                doc = _sec_get(url).text
            except httpx.HTTPError:
                continue
            _NPORT_DOC_CACHE[accession] = doc
        found = _nport_series_id(doc)
        if found == series_id or (not found and series_name in doc):
            return doc
    raise ValueError(f"N-PORT no encontrado para la serie {series_id} ({series_name})")


def parse_nport_holdings(xml_text: str, series_id: str | None = None) -> list[dict]:
    """Parse an N-PORT primary_doc.xml into holdings rows.

    `pctVal` is already a percentage of net assets (0.687 means 0.687%).
    Positions without a ticker (cash, derivatives without a listed symbol)
    are skipped: they cannot be tracked by symbol.
    """
    root = ET.fromstring(xml_text)

    actual_series = root.findtext(".//{*}seriesId")
    if series_id and actual_series and actual_series.strip() != series_id:
        raise ValueError(
            f"el N-PORT es de la serie {actual_series.strip()}, se esperaba {series_id}"
        )

    as_of_raw = (root.findtext(".//{*}repPdDate") or "").strip()
    try:
        as_of = date.fromisoformat(as_of_raw).isoformat()
    except ValueError:
        as_of = date.today().isoformat()

    net_assets_raw = (root.findtext(".//{*}netAssets") or "").strip()
    try:
        net_assets = float(net_assets_raw)
    except ValueError:
        net_assets = 0.0

    rows: list[dict] = []
    for sec in root.findall(".//{*}invstOrSec"):
        ticker_el = sec.find(".//{*}identifiers/{*}ticker")
        ticker = (ticker_el.get("value") or "").strip() if ticker_el is not None else ""
        if not ticker:
            continue

        weight_raw = (sec.findtext(".//{*}pctVal") or "").strip()
        try:
            weight = float(weight_raw)
        except ValueError:
            value_raw = (sec.findtext(".//{*}valUSD") or "").strip()
            try:
                value = float(value_raw)
            except ValueError:
                continue
            if net_assets <= 0:
                continue
            weight = value / net_assets * 100
        if weight <= 0 or weight > 100:
            continue

        currency = (sec.findtext(".//{*}curCd") or "USD").strip() or "USD"
        if currency not in ("USD", "CLP", "EUR"):
            currency = "USD"

        name = (sec.findtext(".//{*}name") or "").strip() or ticker
        rows.append(
            {
                "symbol": ticker,
                "name": name,
                "weight": weight,
                "asset_class": "etf",
                "currency": currency,
                "as_of": as_of,
            }
        )
    return rows


def fetch_subversive(slug: str) -> list[dict]:
    """Holdings for NANC/GOP from the trust's N-PORT on EDGAR.

    The issuer website gives 403 to curl and renders holdings with JS, so the
    official filing is the source of truth. Raises if no N-PORT is available;
    the orchestrator turns that into a warning and keeps going.
    """
    cfg = SUBVERSIVE_FUNDS.get(slug)
    if not cfg:
        raise ValueError(f"unknown Subversive ETF: {slug}")
    doc = _latest_nport_doc(cfg["series_id"], cfg["series_name"])
    return parse_nport_holdings(doc, series_id=cfg["series_id"])


def save_holdings(db, slug: str, rows: list[dict]) -> bool:
    """Upsert rows into holdings. Returns False when the portfolio is missing."""
    pf = db.table("portfolios").select("id").eq("slug", slug).maybe_single().execute()
    if not pf.data:
        print(f"WARNING {slug}: portfolio not in DB (run seed first)")
        return False
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
    return True


def fetch_etf(slug: str) -> list[dict]:
    """Dispatch by slug prefix. Returns holdings list."""
    if slug in ARK_FUNDS:
        return fetch_ark(slug)
    if slug in GLOBALX_FUNDS:
        return fetch_globalx(slug)
    if slug in ISHARES_FUNDS:
        return fetch_ishares(slug)
    if slug in VANECK_FUNDS:
        return fetch_vaneck(slug)
    if slug in SUBVERSIVE_FUNDS:
        return fetch_subversive(slug)
    raise ValueError(f"unknown ETF: {slug}")


def main() -> None:
    import argparse

    from base import get_db

    parser = argparse.ArgumentParser(description="Fetch ETF holdings into Supabase")
    parser.add_argument("--dry-run", action="store_true", help="Solo imprimir, no escribir")
    parser.add_argument("--only", nargs="*", help="Limitar a estos slugs")
    args = parser.parse_args()

    all_slugs = sorted(
        list(ARK_FUNDS)
        + list(GLOBALX_FUNDS)
        + list(ISHARES_FUNDS)
        + list(VANECK_FUNDS)
        + list(SUBVERSIVE_FUNDS)
    )
    slugs = args.only or all_slugs
    db = None if args.dry_run else get_db()
    ok = 0
    for slug in slugs:
        try:
            rows = fetch_etf(slug)
            if not rows:
                print(f"WARNING {slug}: 0 holdings")
                continue
            if args.dry_run:
                top = sorted(rows, key=lambda r: -r["weight"])[:3]
                preview = ", ".join(f"{r['symbol']} {r['weight']}%" for r in top)
                print(f"DRY-RUN {slug}: {len(rows)} holdings ({preview})")
                ok += 1
                continue
            if not save_holdings(db, slug, rows):
                continue
            print(f"OK {slug}: {len(rows)} holdings")
            ok += 1
        except Exception as e:  # noqa: BLE001 - one bad ETF must not kill the run
            print(f"WARNING {slug}: {e}")
    print(f"{ok}/{len(slugs)} OK")


if __name__ == "__main__":
    main()
