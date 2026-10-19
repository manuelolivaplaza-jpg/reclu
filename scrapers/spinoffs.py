"""SEC Form 10-12B — spin-offs en curso y recién listados.

Fuente (verificada 2026-10-19):
  EDGAR full-text search, sin clave y con User-Agent obligatorio:
    https://efts.sec.gov/LATEST/search-index?q=&forms=10-12B
      &dateRange=custom&startdt=YYYY-MM-DD&enddt=YYYY-MM-DD
  El formulario 10-12B registra la escisión de una filial que pasará a
  cotizar por separado. Las enmiendas llegan como 10-12B/A. Los hits traen
  ``display_names`` con el nombre del emisor, el ticker (cuando ya existe)
  y el CIK; el ticker no aparece en el filing inicial y sí en enmiendas
  posteriores (p. ej. ``MSGS Spinco, Inc. (MSGR) (CIK 0002132873)``).

Agrupación: una fila por CIK. ``first_filed_at`` y ``last_filed_at`` marcan
el primer y el último filing del período; ``status`` es ``cotizando`` cuando
el ticker ya aparece en algún display_name y ``en curso`` mientras no haya
ticker. Es una heurística pública, no una confirmación de inicio de
cotización (el ticker puede asignarse antes del primer día de mercado).

Portafolio ``spinoffs-12m``: canasta igual-pesada con una posición por
spin-off con ticker que haya presentado un 10-12B en los últimos 12 meses.
La cartera se mantiene porque el panel no promete sobrerrendimiento: el
backtest solo se muestra cuando haya datos suficientes (HIPÓTESIS).

Política de acceso de la SEC: User-Agent de ``sec13f.USER_AGENT`` y pausa de
0,12 s entre requests (menos de 10 por segundo).

No se guardan direcciones ni teléfonos: solo nombre del emisor, ticker, CIK,
fechas, estado y URL pública del filing.
"""

from __future__ import annotations

import time
from datetime import date, timedelta

from activists_13d import clean_symbol, split_display_name
from base import Holding, SourceAdapter, get_db, log
from sec13f import USER_AGENT

EFTS_URL = "https://efts.sec.gov/LATEST/search-index"
EFTS_PAGE_SIZE = 100
EFTS_MAX_PAGES = 10
LOOKBACK_DAYS = 365
PORTFOLIO_SLUG = "spinoffs-12m"
PAUSE_S = 0.12
DRY_RUN_SAMPLE = 20

ARCHIVE_URL = "https://www.sec.gov/Archives/edgar/data/{cik}/{accession}/{document}"

STATUS_TRADING = "cotizando"
STATUS_PENDING = "en curso"

SPINOFF_COLUMNS = (
    "cik",
    "name",
    "ticker",
    "first_filed_at",
    "last_filed_at",
    "status",
    "source_url",
)


def parse_efts_payload(payload: dict) -> list[dict]:
    """Hits de EFTS -> filings 10-12B sin duplicados por accession."""
    filings: dict[str, dict] = {}
    for hit in (payload.get("hits") or {}).get("hits") or []:
        source = hit.get("_source") or {}
        accession = (source.get("adsh") or "").strip()
        if not accession:
            accession = (hit.get("_id") or "").split(":", 1)[0].strip()
        if not accession or accession in filings:
            continue

        names = source.get("display_names") or []
        issuer = split_display_name(names[0] if names else "")
        ciks = source.get("ciks") or []
        cik = issuer["cik"]
        if not cik and ciks:
            cik = str(int(str(ciks[0])))

        form = (source.get("form") or source.get("file_type") or "10-12B").strip()
        document = (hit.get("_id") or "").split(":", 1)[1] if ":" in (hit.get("_id") or "") else ""
        source_url = ARCHIVE_URL.format(
            cik=cik or "0",
            accession=accession.replace("-", ""),
            document=document,
        ).rstrip("/")

        filings[accession] = {
            "accession": accession,
            "cik": cik,
            "name": issuer["name"],
            "ticker": issuer["symbol"],
            "form": form or "10-12B",
            "is_amendment": form.upper().endswith("/A"),
            "filed_at": (source.get("file_date") or "")[:10],
            "source_url": source_url,
        }
    return list(filings.values())


def group_by_cik(filings: list[dict]) -> list[dict]:
    """Agrupa los 10-12B y sus /A por CIK, en orden cronológico.

    El nombre y el ticker más recientes mandan, pero un ticker ya conocido no
    se pierde si una enmienda posterior no lo repite en ``display_names``.
    """
    groups: dict[str, dict] = {}
    for filing in sorted(filings, key=lambda item: str(item.get("filed_at") or "")):
        cik = str(filing.get("cik") or filing.get("accession") or "").strip()
        if not cik:
            continue
        filed_at = str(filing.get("filed_at") or "")
        current = groups.get(cik)
        if current is None:
            current = {
                "cik": cik,
                "name": "",
                "ticker": "",
                "first_filed_at": filed_at,
                "last_filed_at": filed_at,
                "filings": 0,
                "source_url": "",
            }
            groups[cik] = current
        if filing.get("name"):
            current["name"] = filing["name"]
        ticker = clean_symbol(filing.get("ticker") or "")
        if ticker:
            current["ticker"] = ticker
        if filed_at:
            if not current["first_filed_at"] or filed_at < current["first_filed_at"]:
                current["first_filed_at"] = filed_at
            if not current["last_filed_at"] or filed_at >= current["last_filed_at"]:
                current["last_filed_at"] = filed_at
                current["source_url"] = filing.get("source_url") or current["source_url"]
        current["filings"] += 1

    rows = []
    for row in groups.values():
        row = dict(row)
        row["name"] = row["name"] or f"Spin-off CIK {row['cik']}"
        row["status"] = STATUS_TRADING if row["ticker"] else STATUS_PENDING
        rows.append(row)
    return sorted(rows, key=lambda item: (item["last_filed_at"], item["cik"]), reverse=True)


def spinoff_record(row: dict) -> dict:
    """Columnas de la tabla spinoffs. Sin datos personales."""
    record = {column: row.get(column) for column in SPINOFF_COLUMNS}
    record["cik"] = str(record["cik"] or "")
    record["name"] = record["name"] or "Spin-off sin nombre"
    record["ticker"] = record["ticker"] or None
    record["status"] = record["status"] or STATUS_PENDING
    record["first_filed_at"] = record["first_filed_at"] or date.today().isoformat()
    record["last_filed_at"] = record["last_filed_at"] or record["first_filed_at"]
    record["source_url"] = record["source_url"] or ""
    return record


def holdings_from_spinoffs(
    rows: list[dict], as_of: date | None = None, lookback_days: int = LOOKBACK_DAYS
) -> list[Holding]:
    """Una posición igual-pesada por spin-off con ticker y filing reciente."""
    as_of = as_of or date.today()
    cutoff = (as_of - timedelta(days=lookback_days)).isoformat()
    latest: dict[str, dict] = {}
    for row in rows:
        symbol = clean_symbol(row.get("ticker") or "")
        if not symbol:
            continue
        if str(row.get("last_filed_at") or "") < cutoff:
            continue
        current = latest.get(symbol)
        if current is None or str(row.get("last_filed_at") or "") >= str(
            current.get("last_filed_at") or ""
        ):
            latest[symbol] = row
    if not latest:
        return []
    weight = round(100.0 / len(latest), 2)
    return [
        Holding(
            symbol=symbol,
            name=(row.get("name") or symbol)[:120],
            weight=weight,
            asset_class="equity",
            exchange=None,
            currency="USD",
            as_of=as_of,
        )
        for symbol, row in sorted(latest.items())
    ]


class SpinoffsAdapter(SourceAdapter):
    name = "spinoffs"
    portfolio_slug = PORTFOLIO_SLUG

    def __init__(self, dry_run: bool = False) -> None:
        super().__init__(dry_run=dry_run)
        self.client.headers["User-Agent"] = USER_AGENT
        self.pause_s = PAUSE_S
        self._request_count = 0

    def _get(self, url: str, **kwargs):
        if self._request_count:
            time.sleep(self.pause_s)
        self._request_count += 1
        response = self.client.get(url, timeout=30.0, **kwargs)
        response.raise_for_status()
        return response

    def fetch_efts(self, today: date | None = None) -> list[dict]:
        """Todos los 10-12B y 10-12B/A de los últimos 12 meses."""
        end = today or date.today()
        start = end - timedelta(days=LOOKBACK_DAYS)
        base_params = {
            "q": "",
            "forms": "10-12B",
            "dateRange": "custom",
            "startdt": start.isoformat(),
            "enddt": end.isoformat(),
            "size": EFTS_PAGE_SIZE,
        }
        collected: dict[str, dict] = {}
        total = None
        for page in range(EFTS_MAX_PAGES):
            params = dict(base_params, **{"from": page * EFTS_PAGE_SIZE})
            response = self._get(
                EFTS_URL, params=params, headers={"Accept": "application/json"}
            )
            payload = response.json()
            if total is None:
                total = ((payload.get("hits") or {}).get("total") or {}).get("value")
            hits = (payload.get("hits") or {}).get("hits") or []
            if not hits:
                break
            for filing in parse_efts_payload(payload):
                collected.setdefault(filing["accession"], filing)
            if len(hits) < EFTS_PAGE_SIZE:
                break
            if total is not None and len(collected) >= int(total):
                break
        filings = list(collected.values())
        log(f"[spinoffs] {len(filings)} filings 10-12B desde {start} hasta {end}")
        return filings

    def fetch_raw(self) -> list[dict]:
        return self.fetch_efts()

    def normalize(self, raw: list[dict]) -> list[Holding]:
        return holdings_from_spinoffs(group_by_cik(raw))

    def run(self, db=None) -> dict:
        if self.dry_run:
            return self._run_dry()
        if db is None:
            db = get_db()
        return self._run_write(db)

    def _run_dry(self) -> dict:
        filings = self.fetch_efts()
        rows = group_by_cik(filings)
        for row in rows[:DRY_RUN_SAMPLE]:
            log(
                f"[spinoffs] DRY-RUN {row['last_filed_at']} "
                f"{row.get('ticker') or '—'} {row['name']} "
                f"({row['status']}, {row['filings']} filings)"
            )
        holdings = self.normalize(filings)
        return {
            "source": self.name,
            "portfolio": self.portfolio_slug,
            "filings": len(filings),
            "spinoffs": len(rows),
            "trading": sum(1 for row in rows if row["status"] == STATUS_TRADING),
            "holdings": len(holdings),
            "status": "ok" if filings else "empty",
            "dry_run": True,
        }

    def _sync_holdings(self, db, portfolio_id: str) -> int:
        today = date.today()
        result = db.table("spinoffs").select(
            "ticker,name,last_filed_at,status"
        ).execute()
        holdings = holdings_from_spinoffs(result.data or [], as_of=today)
        if not holdings:
            return 0

        existing = (
            db.table("holdings")
            .select("id,symbol,weight,as_of")
            .eq("portfolio_id", portfolio_id)
            .execute()
        )
        by_symbol: dict[str, list[dict]] = {}
        for row in existing.data or []:
            by_symbol.setdefault(row["symbol"], []).append(row)

        for holding in holdings:
            current = sorted(
                by_symbol.get(holding.symbol, []),
                key=lambda row: str(row.get("as_of") or ""),
            )
            payload = {
                "portfolio_id": portfolio_id,
                "symbol": holding.symbol,
                "name": holding.name,
                "weight": holding.weight,
                "asset_class": holding.asset_class,
                "exchange": holding.exchange,
                "currency": holding.currency,
                "as_of": holding.as_of.isoformat(),
            }
            if not current:
                payload["previous_weight"] = 0.0
                db.table("holdings").insert(payload).execute()
                continue
            keep = current[-1]
            for extra in current[:-1]:
                db.table("holdings").delete().eq("id", extra["id"]).execute()
            old_weight = float(keep["weight"])
            same_day = str(keep.get("as_of") or "")[:10] == today.isoformat()
            if same_day and abs(old_weight - holding.weight) < 0.01:
                continue
            payload["previous_weight"] = old_weight
            db.table("holdings").update(payload).eq("id", keep["id"]).execute()

        wanted = {holding.symbol for holding in holdings}
        for symbol, rows in by_symbol.items():
            if symbol in wanted:
                continue
            for row in rows:
                db.table("holdings").delete().eq("id", row["id"]).execute()
        return len(holdings)

    def _run_write(self, db) -> dict:
        portfolio_id = self._resolve_portfolio_id(db)
        filings = self.fetch_efts()
        rows = group_by_cik(filings)
        if rows:
            db.table("spinoffs").upsert(
                [spinoff_record(row) for row in rows],
                on_conflict="cik",
            ).execute()
            log(f"[spinoffs] {len(rows)} spin-offs escritos")
        holding_count = self._sync_holdings(db, portfolio_id)
        return {
            "source": self.name,
            "portfolio": self.portfolio_slug,
            "filings": len(filings),
            "spinoffs": len(rows),
            "trading": sum(1 for row in rows if row["status"] == STATUS_TRADING),
            "holdings": holding_count,
            "status": "ok" if rows else "empty",
            "dry_run": False,
        }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Spin-offs Form 10-12B (SEC EDGAR)")
    parser.add_argument("--dry-run", action="store_true", help="No escribir en Supabase")
    args = parser.parse_args()
    print(SpinoffsAdapter(dry_run=args.dry_run).run(None))
