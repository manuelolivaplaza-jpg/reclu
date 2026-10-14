"""ETF holdings from issuer-published files (daily, exact weights).

Two issuer formats, both public and keyless:

- ARK Invest: stable CSV URL per fund, columns
  date,fund,company,ticker,cusip,shares,market value ($),weight (%).
  Weight is already exact — no need to derive it.
- Global X: date-stamped CSV URL
  assets.globalxetfs.com/funds/holdings/{ticker}_full-holdings_{YYYYMMDD}.csv
  with '% of Net Assets' as the weight column. The date is discovered from
  the fund page (newest link wins), so we read the listing HTML first.

Holdings are stored into the same `holdings` table as the 13F scrapers
(portfolio must exist, keyed by slug).
"""

from __future__ import annotations

import csv
import io
import re
from datetime import date

import httpx

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) reclu-scraper/1.0"

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

GLOBALX_LISTING = "https://www.globalxetfs.com/funds/{ticker}/"
GLOBALX_HOLDINGS = "https://assets.globalxetfs.com/funds/holdings/{ticker}_full-holdings_{date}.csv"


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


def fetch_etf(slug: str) -> list[dict]:
    """Dispatch by slug prefix. Returns holdings list."""
    if slug in ARK_FUNDS:
        return fetch_ark(slug)
    if slug in GLOBALX_FUNDS:
        return fetch_globalx(slug)
    raise ValueError(f"unknown ETF: {slug}")


def main() -> None:
    from base import get_db

    slugs = sorted(list(ARK_FUNDS) + list(GLOBALX_FUNDS))
    db = get_db()
    ok = 0
    for slug in slugs:
        try:
            rows = fetch_etf(slug)
            if not rows:
                print(f"WARNING {slug}: 0 holdings")
                continue
            pf = db.table("portfolios").select("id").eq("slug", slug).maybe_single().execute()
            if not pf.data:
                print(f"WARNING {slug}: portfolio not in DB (run seed first)")
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
            print(f"OK {slug}: {len(rows)} holdings")
            ok += 1
        except Exception as e:  # noqa: BLE001 - one bad ETF must not kill the run
            print(f"WARNING {slug}: {e}")
    print(f"{ok}/{len(slugs)} OK")


if __name__ == "__main__":
    main()
