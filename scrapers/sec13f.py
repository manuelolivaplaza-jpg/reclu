"""SEC 13F hedge fund holdings via EDGAR.

For each fund manager (keyed by CIK): read the submissions JSON, find
the latest 13F-HR filing, open its accession folder index, pick the
info-table XML (the one that is neither primary_doc nor the accession
txt), parse holdings and compute weights.
"""

from __future__ import annotations

import time
import xml.etree.ElementTree as ET

import httpx

# fund manager name -> CIK
FUNDS: dict[str, int] = {
    # --- US short-book funds (verified in data.sec.gov 2026-10-12) ---
    "Berkshire Hathaway": 1067983,
    "Scion Asset Management": 1649339,  # fixed 2026-10-12: 1644424 was CareQuo LLC
    "Pershing Square": 1336528,
    "Appaloosa": 1656456,
    "Tiger Global": 1167483,
    "Coatue": 1135730,
    "Duquesne": 1536411,
    "Third Point": 1040273,
    "Baupost": 1061768,
    "Viking Global": 1103804,
    # --- International funds with US 13F filings ---
    "TCI Fund Management": 1647251,      # GB — Chris Hohn, 11 lines
    "Public Investment Fund": 1767640,   # SA — Saudi sovereign (SpaceX, Uber, EA)
    "Cevian Capital": 1365341,           # SE/JE — activist (UBS, Autoliv, CRH)
    "Egerton Capital": 1581811,          # GB — John Armitage
    "SoftBank Group": 1065521,           # JP — 33 lines (Intel, T-Mobile, Symbotic)
    "SB Investment Advisers": 1731509,   # GB — SoftBank Vision Fund listed book
    "Mubadala": 1704268,                 # AE — UAE sovereign (GlobalFoundries)
    "Lansdowne Partners": 1608485,       # GB — long/short
}

# Funds whose 13F XML infotable has a non-standard filename or
# where the cover value is in thousands instead of dollars.
SPECIAL_INFOTABLE: dict[str, str] = {
    "AKO Capital": "13F_report_20260630.xml",  # kept for reference; AKO not enabled
    "SoftBank Group": "form13fInfoTable.xml",
}

SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik:010d}.json"
ARCHIVES_URL = "https://www.sec.gov/Archives/edgar/data/{cik}/{accession_nodash}"
USER_AGENT = "reclu research admin@reclu.cl"  # SEC requires a contact UA


def _get_json(url: str) -> dict:
    resp = httpx.get(url, headers={"User-Agent": USER_AGENT}, timeout=30.0)
    resp.raise_for_status()
    return resp.json()


def _get_text(url: str) -> str:
    resp = httpx.get(url, headers={"User-Agent": USER_AGENT}, timeout=30.0)
    resp.raise_for_status()
    return resp.text


def _latest_13f(cik: int) -> tuple[str, str] | None:
    """Return (accession_number, filing_date) of the latest 13F-HR."""
    data = _get_json(SUBMISSIONS_URL.format(cik=cik))
    recent = data["filings"]["recent"]
    for form, date, acc in zip(recent["form"], recent["filingDate"], recent["accessionNumber"]):
        if form == "13F-HR":
            return acc, date
    return None


def _infotable_url(cik: int, accession: str, fund_name: str = "") -> str:
    """Find the info-table XML inside an accession folder.

    Some filers use a non-standard filename (e.g. SoftBank's
    form13fInfoTable.xml), so check SPECIAL_INFOTABLE first.
    """
    acc_nodash = accession.replace("-", "")
    base = ARCHIVES_URL.format(cik=cik, accession_nodash=acc_nodash)
    special = SPECIAL_INFOTABLE.get(fund_name)
    if special:
        return f"{base}/{special}"
    index = _get_json(f"{base}/index.json")
    for item in index["directory"]["item"]:
        name = item["name"]
        if name.endswith(".xml") and name != "primary_doc.xml":
            return f"{base}/{name}"
    raise ValueError(f"no info table xml in accession {accession}")


def fetch_holdings(cik: int, fund_name: str = "") -> list[dict]:
    """Parsed holdings of the latest 13F, with computed weights."""
    latest = _latest_13f(cik)
    if not latest:
        return []
    accession, filing_date = latest

    xml_text = _get_text(_infotable_url(cik, accession, fund_name))
    root = ET.fromstring(xml_text)
    ns = {"ns": root.tag.split("}")[0].strip("{")}

    holdings: list[dict] = []
    for entry in root.findall("ns:infoTable", ns):
        value = float(entry.findtext("ns:value", default="0", namespaces=ns))
        shares_el = entry.find("ns:shrsOrPrnAmt/ns:sshPrnamt", ns)
        shares = int(float(shares_el.text)) if shares_el is not None and shares_el.text else 0
        holdings.append(
            {
                "issuer": entry.findtext("ns:nameOfIssuer", default="", namespaces=ns),
                "cusip": entry.findtext("ns:cusip", default="", namespaces=ns),
                "value": value,
                "shares": shares,
                "as_of": filing_date,
            }
        )

    total = sum(h["value"] for h in holdings) or 1.0

    # Merge duplicate issuers: 13F reports one entry per manager/discretion.
    merged: dict[str, dict] = {}
    for h in holdings:
        key = h["issuer"].upper()
        if key in merged:
            merged[key]["value"] += h["value"]
            merged[key]["shares"] += h["shares"]
        else:
            merged[key] = dict(h)
    holdings = list(merged.values())

    for h in holdings:
        h["weight"] = round(h["value"] / total * 100, 2)
    return holdings


def fetch_all_funds() -> dict[str, list[dict]]:
    """Holdings for every fund, tolerating per-fund failures."""
    results: dict[str, list[dict]] = {}
    for name, cik in FUNDS.items():
        try:
            holdings = fetch_holdings(cik, name)
            results[name] = holdings
            print(f"OK {name}: {len(holdings)} holdings")
        except Exception as e:  # noqa: BLE001 - one bad fund must not kill the run
            print(f"WARNING {name}: {e}")
            results[name] = []
        time.sleep(0.4)  # SEC rate-limit courtesy
    return results


def main() -> None:
    for name, holdings in fetch_all_funds().items():
        print(f"\n== {name} ==")
        top = sorted(holdings, key=lambda h: h["weight"], reverse=True)[:10]
        for h in top:
            print(f"{h['issuer']}: {h['weight']}% (${h['value']:,.0f}, {h['shares']:,} sh)")


if __name__ == "__main__":
    main()
