"""One-off: backfill holdings for the seeded 13F portfolios from live SEC data.

Run from the scrapers dir with SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY set:
    python load_13f.py
"""

from __future__ import annotations

import sys

sys.path.insert(0, ".")

from base import get_db
from sec13f import FUNDS, fetch_holdings
from ticker_map import TickerResolver, save_cusip_cache

# fund name in FUNDS -> slug already seeded in the portfolios table
FUND_SLUG = {
    "Berkshire Hathaway": "berkshire-hathaway-13f",
    "Scion Asset Management": "scion-13f",
    "Pershing Square": "pershing-square-13f",
    "Appaloosa": "appaloosa-13f",
    "Tiger Global": "tiger-global-13f",
    "Coatue": "coatue-13f",
    "Duquesne": "duquesne-13f",
    "Third Point": "third-point-13f",
    "Baupost": "baupost-13f",
    "Viking Global": "viking-global-13f",
    "TCI Fund Management": "tci-13f",
    "Public Investment Fund": "pif-13f",
    "Cevian Capital": "cevian-13f",
    "Egerton Capital": "egerton-13f",
    "SoftBank Group": "softbank-13f",
    "SB Investment Advisers": "sb-advisers-13f",
    "Mubadala": "mubadala-13f",
    "Lansdowne Partners": "lansdowne-13f",
    "Renaissance Technologies": "renaissance-13f",
    "Bridgewater Associates": "bridgewater-13f",
    "Soros Fund Management": "soros-13f",
    # --- Nuevos (F3, ver docs/expansion-portfolios-2.md) ---
    "DME Capital Management": "dme-greenlight-13f",
    "AKO Capital": "ako-13f",
    "HHLR Advisors": "hhlr-13f",
    "Temasek Holdings": "temasek-13f",
    # --- Soberanos, banco central y family offices (F25) ---
    "Norges Bank": "norges-bank-13f",
    "Swiss National Bank": "snb-13f",
    "Gates Foundation Trust": "gates-foundation-13f",
    "Icahn Carl C": "icahn-13f",
}


def build_payload(pid: str, holdings: list[dict], resolve) -> list[dict]:
    """D42: una fila por (simbolo, as_of). El peso es value/sum(value) del
    libro completo (lo calcula sec13f); si dos emisores/CUSIP resuelven al
    mismo ticker se suman (antes el upsert dejaba solo uno, o quedaban el
    nombre y el ticker como filas separadas y el snapshot sumaba ~200%)."""
    by: dict[tuple[str, str], dict] = {}
    for h in holdings:
        sym = (resolve(h["issuer"], h.get("cusip", "")) or h["issuer"])[:40]
        key = (sym, str(h["as_of"]))
        w = float(h.get("weight") or 0)
        if key in by:
            by[key]["weight"] = round(by[key]["weight"] + w, 4)
        else:
            by[key] = {
                "portfolio_id": pid,
                # 13F no trae ticker: se resuelve por CUSIP (OpenFIGI) o mapa
                # curado. Si no se resuelve, queda el nombre (la etapa
                # performance lo omite y lo registra; no se inventa).
                "symbol": sym,
                "name": h["issuer"],
                "weight": round(w, 4),
                "asset_class": "equity",
                "currency": "USD",
                "as_of": h["as_of"],
                "previous_weight": 0.0,
            }
    return list(by.values())


def stale_ids(existing: list[dict], payload: list[dict]) -> list[str]:
    """Filas del mismo portafolio y as_of que el nuevo payload ya no trae
    (ej. la fila con el nombre del emisor de una corrida anterior, cuando
    ahora el CUSIP resuelve a ticker). Si se dejan, el snapshot suma doble."""
    keep = {(p["symbol"], str(p["as_of"])[:10]) for p in payload}
    dates = {str(p["as_of"])[:10] for p in payload}
    return [str(r["id"]) for r in existing
            if str(r.get("as_of"))[:10] in dates and (r.get("symbol"), str(r.get("as_of"))[:10]) not in keep]


def _is_name_symbol(symbol: str) -> bool:
    s = (symbol or "").strip()
    return " " in s or s != s.upper() or len(s) > 12


def adopt_known_tickers(existing: list[dict], payload: list[dict]) -> int:
    """D45b: si esta corrida no resolvio un emisor (queda el nombre como
    simbolo) pero el snapshot ya tiene una fila con ticker para ese mismo
    nombre (p. ej. renombrada por resolve_tickers), se reutiliza el ticker.
    Antes quedaban las dos filas (nombre + ticker) y el snapshot contaba doble,
    o stale_ids borraba la buena. Si el ticker ya esta en el payload, se suma."""
    known: dict[tuple[str, str], str] = {}
    for r in existing:
        sym = r.get("symbol") or ""
        if sym and not _is_name_symbol(sym) and r.get("name"):
            known.setdefault((str(r["name"]).strip().upper(), str(r.get("as_of"))[:10]), sym)
    by_key = {(p["symbol"], str(p["as_of"])[:10]): p for p in payload}
    adopted = 0
    for p in list(payload):
        if not _is_name_symbol(p["symbol"]):
            continue
        d = str(p["as_of"])[:10]
        ticker = known.get((str(p["name"]).strip().upper(), d))
        if not ticker:
            continue
        adopted += 1
        target = by_key.get((ticker, d))
        if target is not None and target is not p:
            target["weight"] = round(target["weight"] + p["weight"], 4)
            payload.remove(p)
        else:
            del by_key[(p["symbol"], d)]
            p["symbol"] = ticker
            by_key[(ticker, d)] = p
    return adopted


def _existing_rows(db, pid: str, as_of: str, page: int = 1000) -> list[dict]:
    out: list[dict] = []
    start = 0
    while True:
        rows = (db.table("holdings").select("id, symbol, name, as_of").eq("portfolio_id", pid).eq("as_of", as_of)
                .order("id").range(start, start + page - 1).execute().data or [])
        out.extend(rows)
        if len(rows) < page:
            return out
        start += page


def main() -> None:
    db = get_db()
    resolver = TickerResolver()
    ok = 0
    for name, cik in FUNDS.items():
        slug = FUND_SLUG.get(name)
        if not slug:
            print(f"-- {name}: sin slug mapeado, se salta")
            continue
        try:
            holdings = fetch_holdings(cik, name)
            if not holdings:
                print(f"-- {name}: sin holdings")
                continue
            pf = db.table("portfolios").select("id").eq("slug", slug).maybe_single().execute()
            if pf is None or not pf.data:
                print(f"-- {name}: slug {slug} no está en la DB (corre el seed)")
                continue
            pid = pf.data["id"]
            resolver.prefetch(holdings)
            payload = build_payload(pid, holdings, resolver.resolve)
            existing: list[dict] = []
            for d in sorted({str(p["as_of"])[:10] for p in payload}):
                existing.extend(_existing_rows(db, pid, d))
            adopted = adopt_known_tickers(existing, payload)
            if adopted:
                print(f"   {name}: {adopted} emisores sin resolver usan el ticker ya guardado")
            db.table("holdings").upsert(payload, on_conflict="portfolio_id,symbol,as_of").execute()
            # D42: el snapshot queda exactamente igual al 13F (sin filas viejas).
            stale = stale_ids(existing, payload)
            for i in range(0, len(stale), 200):
                db.table("holdings").delete().in_("id", stale[i:i + 200]).execute()
            if stale:
                print(f"   {name}: {len(stale)} filas viejas del mismo snapshot eliminadas")
            print(f"OK {name}: {len(holdings)} holdings -> {slug}")
            ok += 1
        except Exception as e:  # noqa: BLE001
            print(f"WARNING {name}: {e}")
    save_cusip_cache(resolver.cusip_cache)
    if resolver.unresolved:
        print(f"[load_13f] {len(resolver.unresolved)} emisores sin ticker (se omiten en performance): " + "; ".join(sorted(set(resolver.unresolved))[:50]))
    print(f"{ok}/{len(FUNDS)} fondos cargados")


if __name__ == "__main__":
    main()
