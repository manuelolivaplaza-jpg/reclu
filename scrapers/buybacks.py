"""Recompras de acciones con los XBRL frames de la SEC (sin clave).

Fuente (verificada 2026-10-19):
  https://data.sec.gov/api/xbrl/frames/us-gaap/
    PaymentsForRepurchaseOfCommonStock/USD/CY{anio}Q{trimestre}.json
  Cada ``data`` trae CIK, nombre del emisor, período fiscal, ``accn`` y el
  monto en USD pagado para recomprar acciones comunes. La SEC publica el
  frame por trimestre calendario; las empresas con cierre fiscal distinto
  (p. ej. HP) pueden reportar un rango de fechas que no calza exacto con el
  trimestre, pero el frame igual las agrupa por el trimestre del reporte.

  El ticker no viene en el frame. Se cruza el CIK con
  https://www.sec.gov/files/company_tickers.json. Ese archivo repite un mismo
  CIK para clases o instrumentos relacionados (por ejemplo T-Mobile aparece
  como TMUS, TMUSZ, TMUSI y TMUSL); se conserva la primera aparición, que es
  el ticker principal.

  Para el % de capitalización se usa:
    acciones en circulación = dei:EntityCommonStockSharesOutstanding
      (companyconcept por CIK, último valor reportado)
    precio = último cierre de Yahoo Finance (``prices.fetch_eod``)
    % = monto recomprado / (acciones × precio) × 100
  Es una aproximación pública y educativa, no una medición exacta del
  buyback yield: el monto es del trimestre y la capitalización usa el último
  dato disponible.

Portafolio ``recompras-top20``: canasta igual-pesada con las 20 empresas con
mayor monto de recompra del trimestre que tengan ticker identificable. No
promete sobrerrendimiento y no es asesoría ni recomendación de inversión.

Política de acceso de la SEC: User-Agent de ``sec13f.USER_AGENT`` y pausa de
0,12 s entre requests (menos de 10 por segundo).

Solo se guardan datos públicos de la SEC y precios de mercado: CIK, ticker,
nombre del emisor, período, monto, acciones en circulación, precio, market
cap y URL del filing. Sin datos personales.
"""

from __future__ import annotations

import time
from datetime import date

from activists_13d import clean_symbol
from base import Holding, SourceAdapter, get_db, log
from sec13f import USER_AGENT

FRAMES_URL = (
    "https://data.sec.gov/api/xbrl/frames/us-gaap/"
    "PaymentsForRepurchaseOfCommonStock/USD/{period}.json"
)
COMPANY_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
COMPANY_CONCEPT_URL = (
    "https://data.sec.gov/api/xbrl/companyconcept/"
    "CIK{cik}/dei/EntityCommonStockSharesOutstanding.json"
)
ARCHIVE_INDEX_URL = (
    "https://www.sec.gov/Archives/edgar/data/{cik}/{accession}/{dashed}-index.htm"
)

PORTFOLIO_SLUG = "recompras-top20"
TOP_N = 20
MIN_ROWS = 50
PAUSE_S = 0.12
DRY_RUN_SAMPLE = 20

BUYBACK_COLUMNS = (
    "cik",
    "ticker",
    "name",
    "period",
    "period_start",
    "period_end",
    "amount_usd",
    "shares_outstanding",
    "price_usd",
    "market_cap_usd",
    "pct_capitalization",
    "source_url",
)


def normalize_cik(raw: object) -> str:
    """CIK como texto sin ceros a la izquierda (la SEC lo publica numérico)."""
    text = str(raw or "").strip()
    if not text:
        return ""
    try:
        return str(int(float(text)))
    except (TypeError, ValueError):
        return text


def period_from_date(day: date) -> str:
    """Etiqueta de trimestre calendario: CY2026Q2."""
    quarter = (day.month - 1) // 3 + 1
    return f"CY{day.year}Q{quarter}"


def quarter_periods(today: date | None = None, count: int = 5) -> list[str]:
    """Trimestres candidatos, del más nuevo al más viejo.

    Se parte por el trimestre en curso y se retrocede. El trimestre en curso
    suele estar incompleto (pocas empresas han presentado el 10-Q), por eso
    ``select_period`` exige un mínimo de filas antes de elegirlo.
    """
    today = today or date.today()
    year = today.year
    quarter = (today.month - 1) // 3 + 1
    periods: list[str] = []
    for _ in range(max(count, 1)):
        periods.append(f"CY{year}Q{quarter}")
        quarter -= 1
        if quarter == 0:
            quarter = 4
            year -= 1
    return periods


def _to_float(value: object) -> float:
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.0


def filing_index_url(cik: object, accession: object, period: str = "") -> str:
    """URL pública del índice del filing; si falta ``accn``, el frame."""
    accn = str(accession or "").strip()
    if not accn:
        return FRAMES_URL.format(period=period) if period else ""
    compact = accn.replace("-", "")
    return ARCHIVE_INDEX_URL.format(
        cik=normalize_cik(cik),
        accession=compact,
        dashed=accn,
    )


def parse_frame(payload: dict) -> list[dict]:
    """Payload de un frame XBRL -> filas de recompra con monto positivo.

    Los valores en cero (empresas que reportan el tag sin recomprar en el
    trimestre) no entran al ranking. Se conserva el nombre tal como lo
    publica la SEC.
    """
    period = str(payload.get("ccp") or "").strip()
    rows: list[dict] = []
    for item in payload.get("data") or []:
        amount = _to_float(item.get("val"))
        if amount <= 0:
            continue
        cik = normalize_cik(item.get("cik"))
        if not cik:
            continue
        end = str(item.get("end") or "").strip()
        row_period = period
        if not row_period and end:
            try:
                row_period = period_from_date(date.fromisoformat(end))
            except ValueError:
                row_period = ""
        rows.append(
            {
                "cik": cik,
                "name": str(item.get("entityName") or "Empresa sin nombre").strip(),
                "period": row_period,
                "period_start": str(item.get("start") or "").strip() or None,
                "period_end": end or None,
                "amount_usd": amount,
                "accn": str(item.get("accn") or "").strip(),
                "source_url": filing_index_url(cik, item.get("accn"), row_period),
            }
        )
    return rows


def parse_company_tickers(payload: dict) -> dict[str, dict]:
    """company_tickers.json -> {cik: {ticker, title}}.

    La primera aparición de un CIK manda: el archivo lista después clases o
    instrumentos relacionados (TMUSZ, TMUSI, TMUSL) que no son la acción
    principal.
    """
    mapping: dict[str, dict] = {}
    for entry in (payload or {}).values():
        if not isinstance(entry, dict):
            continue
        cik = normalize_cik(entry.get("cik_str"))
        if not cik or cik in mapping:
            continue
        mapping[cik] = {
            "ticker": clean_symbol(entry.get("ticker") or ""),
            "title": str(entry.get("title") or "").strip(),
        }
    return mapping


def _row_amount(row: dict) -> float:
    return _to_float(row.get("amount_usd", row.get("val")))


def rank_buybacks(
    rows: list[dict],
    tickers: dict[str, dict] | None = None,
    top_n: int = TOP_N,
    require_ticker: bool = True,
) -> list[dict]:
    """Ordena por monto y adjunta el ticker.

    Con ``require_ticker=True`` (default) el ranking sirve para el portafolio:
    solo entran empresas con ticker identificable. ``top_n=0`` devuelve todas
    las filas (útil para guardar el frame completo en la tabla).
    """
    tickers = tickers or {}
    enriched: list[dict] = []
    for row in rows:
        cik = normalize_cik(row.get("cik"))
        if not cik:
            continue
        info = tickers.get(cik) or {}
        ticker = clean_symbol(row.get("ticker") or info.get("ticker") or "")
        if require_ticker and not ticker:
            continue
        enriched.append(
            {
                **row,
                "cik": cik,
                "name": str(row.get("name") or info.get("title") or "Empresa sin nombre"),
                "ticker": ticker or None,
                "amount_usd": _row_amount(row),
            }
        )
    enriched.sort(key=lambda item: (-item["amount_usd"], item["name"]))
    if top_n and top_n > 0:
        return enriched[:top_n]
    return enriched


def enrich_with_market_cap(
    rows: list[dict],
    shares_by_cik: dict[str, float | None],
    prices_by_ticker: dict[str, float | None],
) -> list[dict]:
    """Agrega acciones, precio, market cap y % de capitalización.

    Si falta cualquiera de los dos insumos, las columnas quedan en ``None`` y
    la fila sigue en el ranking por monto.
    """
    enriched: list[dict] = []
    for row in rows:
        current = dict(row)
        cik = normalize_cik(current.get("cik"))
        ticker = clean_symbol(current.get("ticker") or "")
        shares = shares_by_cik.get(cik)
        price = prices_by_ticker.get(ticker)
        current["shares_outstanding"] = shares
        current["price_usd"] = price
        current["market_cap_usd"] = None
        current["pct_capitalization"] = None
        if shares and price and shares > 0 and price > 0:
            market_cap = shares * price
            current["market_cap_usd"] = round(market_cap, 2)
            current["pct_capitalization"] = round(
                current["amount_usd"] / market_cap * 100.0, 4
            )
        enriched.append(current)
    return enriched


def buyback_record(row: dict) -> dict:
    """Columnas de la tabla buybacks. Sin datos personales."""
    record = {column: row.get(column) for column in BUYBACK_COLUMNS}
    record["cik"] = normalize_cik(record["cik"])
    record["name"] = str(record["name"] or "Empresa sin nombre")[:200]
    record["period"] = str(record["period"] or "")
    record["amount_usd"] = _to_float(record["amount_usd"])
    record["ticker"] = record["ticker"] or None
    record["source_url"] = record["source_url"] or ""
    return record


def holdings_from_buybacks(rows: list[dict], as_of: date | None = None) -> list[Holding]:
    """Canasta igual-pesada con las empresas del top de recompras."""
    as_of = as_of or date.today()
    unique: dict[str, dict] = {}
    for row in rows:
        symbol = clean_symbol(row.get("ticker") or "")
        if not symbol or symbol in unique:
            continue
        unique[symbol] = row
    if not unique:
        return []
    weight = round(100.0 / len(unique), 2)
    return [
        Holding(
            symbol=symbol,
            name=str(row.get("name") or symbol)[:120],
            weight=weight,
            asset_class="equity",
            exchange=None,
            currency="USD",
            as_of=as_of,
        )
        for symbol, row in unique.items()
    ]


class BuybackAdapter(SourceAdapter):
    name = "buybacks"
    portfolio_slug = PORTFOLIO_SLUG

    def __init__(
        self,
        dry_run: bool = False,
        period: str | None = None,
        top_n: int = TOP_N,
    ) -> None:
        super().__init__(dry_run=dry_run)
        self.client.headers["User-Agent"] = USER_AGENT
        self.period = period
        self.top_n = top_n
        self.pause_s = PAUSE_S
        self._request_count = 0
        self._frame_cache: dict[str, dict] = {}
        self._shares_cache: dict[str, float | None] = {}
        self._price_cache: dict[str, float | None] = {}

    def _get_json(self, url: str) -> dict:
        if self._request_count:
            time.sleep(self.pause_s)
        self._request_count += 1
        response = self.client.get(
            url, timeout=30.0, headers={"Accept": "application/json"}
        )
        response.raise_for_status()
        return response.json()

    def fetch_frame(self, period: str) -> dict:
        if period not in self._frame_cache:
            self._frame_cache[period] = self._get_json(
                FRAMES_URL.format(period=period)
            )
        return self._frame_cache[period]

    def fetch_ticker_map(self) -> dict[str, dict]:
        return parse_company_tickers(self._get_json(COMPANY_TICKERS_URL))

    def fetch_shares(self, cik: object) -> float | None:
        key = normalize_cik(cik)
        if not key:
            return None
        if key in self._shares_cache:
            return self._shares_cache[key]
        try:
            numeric_cik = int(key)
        except ValueError:
            self._shares_cache[key] = None
            return None
        payload = self._get_json(COMPANY_CONCEPT_URL.format(cik=f"{numeric_cik:010d}"))
        units = (payload.get("units") or {}).get("shares") or []
        latest = None
        for entry in units:
            if entry.get("val") in (None, ""):
                continue
            if latest is None or (
                str(entry.get("end") or ""),
                str(entry.get("filed") or ""),
            ) >= (
                str(latest.get("end") or ""),
                str(latest.get("filed") or ""),
            ):
                latest = entry
        value = _to_float(latest.get("val")) if latest else 0.0
        self._shares_cache[key] = value if value > 0 else None
        return self._shares_cache[key]

    def fetch_price(self, ticker: str) -> float | None:
        symbol = clean_symbol(ticker)
        if not symbol:
            return None
        if symbol in self._price_cache:
            return self._price_cache[symbol]
        from prices import fetch_eod

        rows = fetch_eod(symbol, days=7)
        value = float(rows[-1][1]) if rows else 0.0
        self._price_cache[symbol] = value if value > 0 else None
        return self._price_cache[symbol]

    def select_period(self, today: date | None = None) -> str:
        """Trimestre más reciente con suficientes reportes.

        El trimestre en curso puede tener pocas empresas (los 10-Q vencen
        semanas después del cierre), así que se exige ``MIN_ROWS``. Si
        ninguno llega al umbral, se usa el más nuevo con alguna fila.
        """
        if self.period:
            return self.period
        candidates = quarter_periods(today)
        fallback = ""
        for period in candidates:
            try:
                rows = parse_frame(self.fetch_frame(period))
            except Exception as error:  # noqa: BLE001 — un trimestre caído no corta
                log(f"[buybacks] WARNING {period}: {error}")
                continue
            if len(rows) >= MIN_ROWS:
                return period
            if not fallback and rows:
                fallback = period
        return fallback or candidates[0]

    def fetch_raw(self) -> dict:
        period = self.select_period()
        payload = self.fetch_frame(period)
        rows = parse_frame(payload)
        log(f"[buybacks] {len(rows)} recompras positivas en {period}")
        return {"period": period, "rows": rows}

    def normalize(self, raw: dict | list[dict]) -> list[Holding]:
        rows = raw.get("rows") if isinstance(raw, dict) else raw
        tickers = self.fetch_ticker_map()
        ranked = rank_buybacks(rows or [], tickers, self.top_n)
        return holdings_from_buybacks(ranked)

    def _attach_market_caps(self, rows: list[dict]) -> list[dict]:
        shares: dict[str, float | None] = {}
        prices: dict[str, float | None] = {}
        for row in rows:
            cik = normalize_cik(row.get("cik"))
            ticker = clean_symbol(row.get("ticker") or "")
            if not cik or not ticker:
                continue
            if cik not in shares:
                try:
                    shares[cik] = self.fetch_shares(cik)
                except Exception as error:  # noqa: BLE001 — sigue sin % de cap
                    log(f"[buybacks] WARNING shares {cik}: {error}")
                    shares[cik] = None
            if ticker not in prices:
                try:
                    prices[ticker] = self.fetch_price(ticker)
                except Exception as error:  # noqa: BLE001 — sigue sin % de cap
                    log(f"[buybacks] WARNING price {ticker}: {error}")
                    prices[ticker] = None
        return enrich_with_market_cap(rows, shares, prices)

    def _prepare(self, raw: dict) -> tuple[list[dict], list[dict]]:
        tickers = self.fetch_ticker_map()
        all_rows = rank_buybacks(
            raw.get("rows") or [],
            tickers,
            top_n=0,
            require_ticker=False,
        )
        candidates = [row for row in all_rows if row.get("ticker")]
        top = self._attach_market_caps(candidates[: self.top_n])
        return all_rows, top

    def run(self, db=None) -> dict:
        raw = self.fetch_raw()
        if self.dry_run:
            return self._run_dry(raw)
        if db is None:
            db = get_db()
        return self._run_write(db, raw)

    def _run_dry(self, raw: dict) -> dict:
        all_rows, top = self._prepare(raw)
        for row in top[:DRY_RUN_SAMPLE]:
            pct = row.get("pct_capitalization")
            pct_text = f"{pct:.2f}% cap" if pct is not None else "sin % cap"
            log(
                f"[buybacks] DRY-RUN {row.get('ticker')} {row['name']} "
                f"US${row['amount_usd']:,.0f} ({pct_text})"
            )
        holdings = holdings_from_buybacks(top)
        return {
            "source": self.name,
            "portfolio": self.portfolio_slug,
            "period": raw.get("period", ""),
            "companies": len(all_rows),
            "ranked": len(top),
            "holdings": len(holdings),
            "with_market_cap": sum(
                1 for row in top if row.get("pct_capitalization") is not None
            ),
            "status": "ok" if top else "empty",
            "dry_run": True,
        }

    def _sync_holdings(self, db, portfolio_id: str, rows: list[dict]) -> int:
        today = date.today()
        holdings = holdings_from_buybacks(rows, as_of=today)
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

    def _run_write(self, db, raw: dict) -> dict:
        portfolio_id = self._resolve_portfolio_id(db)
        all_rows, top = self._prepare(raw)
        top_by_key = {(row["cik"], row["period"]): row for row in top}
        records = [
            buyback_record(top_by_key.get((row["cik"], row["period"]), row))
            for row in all_rows
        ]
        if records:
            db.table("buybacks").upsert(
                records,
                on_conflict="cik,period",
            ).execute()
            log(f"[buybacks] {len(records)} filas escritas ({len(top)} en el top)")
        holding_count = self._sync_holdings(db, portfolio_id, top)
        return {
            "source": self.name,
            "portfolio": self.portfolio_slug,
            "period": raw.get("period", ""),
            "companies": len(all_rows),
            "ranked": len(top),
            "holdings": holding_count,
            "with_market_cap": sum(
                1 for row in top if row.get("pct_capitalization") is not None
            ),
            "status": "ok" if records else "empty",
            "dry_run": False,
        }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Recompras de acciones (XBRL frames de la SEC)"
    )
    parser.add_argument("--dry-run", action="store_true", help="No escribir en Supabase")
    parser.add_argument(
        "--period",
        help="Trimestre explícito, p. ej. CY2026Q2 (default: el más reciente con datos)",
    )
    parser.add_argument("--top", type=int, default=TOP_N, help="Tamaño del portafolio")
    args = parser.parse_args()
    print(
        BuybackAdapter(
            dry_run=args.dry_run,
            period=args.period,
            top_n=args.top,
        ).run(None)
    )
