"""
Senate eFD Periodic Transaction Reports — fuente OFICIAL del Senado de EE.UU.

Fuente: https://efdsearch.senate.gov (electronic Financial Disclosure)
  - Landing:   /search/home/ (aviso legal que hay que aceptar por POST)
  - Búsqueda:  /search/report/data/ (API DataTables, report_types=[11] = PTR)
  - Reportes:  /search/view/ptr/{uuid} (tabla HTML con las transacciones)
               /search/view/paper/{id} (PDF escaneado — se omite y se registra)

Flujo (verificado contra repos públicos que usan el mismo endpoint):
  1. GET /search/home/ → csrfmiddlewaretoken (cookie de sesión)
  2. POST /search/home/ {prohibition_agreement=1, csrfmiddlewaretoken}
     → cookie csrftoken habilita la búsqueda (E.G.A. 5 U.S.C. app. § 105(c))
  3. POST /search/report/data/ {start, length, report_types='[11]', ...}
     → filas [first_name, last_name, office, <a href>, filed_date]
  4. GET cada reporte HTML → primer <tbody> = transacciones:
     col 1=fecha tx, col 3=ticker, col 4=asset, col 5=tipo activo,
     col 6=tipo orden, col 7=monto (rango)

IMPORTANTE — por qué curl_cffi: efdsearch está detrás de Akamai, que
rechaza httpx/requests/curl con 403 por la huella TLS sola (antes de mirar
User-Agent). curl_cffi impersona Chrome. Verificado 2026-10-18.

Nota legal: los reportes del Senado no pueden usarse con fines comerciales,
de evaluación crediticia ni solicitación política (Ethics in Government Act).
El scraper acepta ese acuerdo programáticamente en cada corrida.

Senadores seguidos: SENATORS en politicians.py (slug → portfolio).
"""

from __future__ import annotations

import html as html_lib
import io
import json
import re
import time
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

from base import Holding, SourceAdapter, log
from politicians import SENATORS

BASE = "https://efdsearch.senate.gov"
LANDING = f"{BASE}/search/home/"
SEARCH_PAGE = f"{BASE}/search/"
REPORTS_API = f"{BASE}/search/report/data/"
PTR_PREFIX = "/search/view/ptr/"
PAPER_PREFIX = "/search/view/paper/"

# Report type 11 = Periodic Transaction Report en el filtro de efdsearch
REPORT_TYPE_PTR = 11
PAGE_SIZE = 100
RATE_LIMIT_SECS = 2.0
MAX_REPORTS_PER_RUN = 60


def _get_client():
    """Cliente con huella TLS de Chrome (Akamai rechaza la de httpx)."""
    try:
        from curl_cffi import requests as curl_requests

        return curl_requests.Session(impersonate="chrome", timeout=30.0)
    except ImportError:
        raise RuntimeError(
            "senate_disclosure requiere curl_cffi (Akamai bloquea httpx). "
            "Instala con: pip install curl_cffi"
        )


class SenateBlocked(RuntimeError):
    """efdsearch respondió 403 (Akamai/IP). No se reintenta ni se evade."""


def _check_blocked(resp, step: str) -> None:
    status = getattr(resp, "status_code", None)
    if status in (401, 403, 429):
        raise SenateBlocked(
            f"Senate eFD bloqueó la sesión en '{step}' (HTTP {status}). "
            "El sitio rechaza esta IP/huella; no hay datos nuevos en esta corrida. "
            "Alternativa offline: --html-file con un PTR guardado a mano."
        )


def parse_ptr_html(html: str) -> list[dict[str, str]]:
    """Parsea un PTR guardado (sin red). Devuelve solo filas de acciones."""
    adapter = SenateDisclosureAdapter.__new__(SenateDisclosureAdapter)
    out = []
    for t in adapter._parse_report_table(html):
        if t["ticker"].strip() in ("--", ""):
            continue
        if t["asset_type"].strip().lower() != "stock":
            continue
        t = dict(t)
        t["tx_date"] = SenateDisclosureAdapter._iso_date(t["tx_date"])
        t["amount_mid"] = SenateDisclosureAdapter._amount_mid(t["amount"])
        out.append(t)
    return out


@dataclass
class SenateTrade:
    """Una transacción parseada de un PTR del Senado."""

    senator: str          # "First Last" como aparece en el filing
    ticker: str
    asset_name: str
    order_type: str        # Purchase / Sale (Full) / Sale (Partial) / Exchange
    amount_range: str     # "$1,001 - $15,000"
    amount_mid: float     # punto medio del rango en USD
    tx_date: str          # ISO
    filed_date: str       # ISO
    url: str


@dataclass
class SenateRunStats:
    """Contadores de una corrida del scraper del Senado."""

    reports_seen: int = 0
    reports_parsed: int = 0
    paper_skipped: int = 0
    senators_matched: int = 0
    trades: list[SenateTrade] = field(default_factory=list)


class SenateDisclosureAdapter(SourceAdapter):
    name = "senate_disclosure"

    def __init__(self, lookback_days: int = 45, dry_run: bool = False) -> None:
        super().__init__(dry_run=dry_run)
        self.lookback_days = lookback_days
        self.stats = SenateRunStats()

    # ---------- Paso 1+2: aceptar aviso y obtener CSRF ----------

    def _accept_agreement(self, client) -> str:
        """Acepta el aviso legal y devuelve el csrftoken de sesión."""
        r = client.get(LANDING)
        _check_blocked(r, "aviso legal")
        r.raise_for_status()
        m = re.search(r'name="csrfmiddlewaretoken"\s+value="([^"]+)"', r.text)
        if not m:
            raise RuntimeError(
                "Senate: no se encontró el formulario del aviso — "
                "el sitio puede haber cambiado"
            )
        r2 = client.post(
            LANDING,
            data={
                "csrfmiddlewaretoken": m.group(1),
                "prohibition_agreement": "1",
            },
            headers={"Referer": LANDING},
        )
        _check_blocked(r2, "aceptar aviso")
        r2.raise_for_status()
        if "agreement_form" in r2.text and "You must accept" in r2.text:
            raise RuntimeError("Senate: el aviso no fue aceptado")
        token = client.cookies.get("csrftoken") or client.cookies.get("csrf")
        if not token:
            raise RuntimeError("Senate: sin csrftoken tras aceptar el aviso")
        log(f"[{self.name}] aviso aceptado, sesión habilitada para búsqueda")
        return token

    # ---------- Paso 3: listar PTRs recientes ----------

    def _fetch_report_rows(self, client, token: str) -> list[list[str]]:
        """Filas de PTRs presentados en los últimos lookback_days."""
        start_date = datetime.fromordinal(
            date.today().toordinal() - self.lookback_days
        )
        payload = {
            "start": "0",
            "length": str(PAGE_SIZE),
            "report_types": f"[{REPORT_TYPE_PTR}]",
            "filer_types": "[]",
            "submitted_start_date": start_date.strftime("%m/%d/%Y 00:00:00"),
            "submitted_end_date": "",
            "candidate_state": "",
            "senator_state": "",
            "office_id": "",
            "first_name": "",
            "last_name": "",
            "csrfmiddlewaretoken": token,
        }
        all_rows: list[list[str]] = []
        offset = 0
        while True:
            payload["start"] = str(offset)
            r = client.post(
                REPORTS_API, data=payload, headers={"Referer": SEARCH_PAGE}
            )
            r.raise_for_status()
            data = r.json()
            rows = data.get("data", [])
            if not rows:
                break
            all_rows.extend(rows)
            total = data.get("recordsTotal", 0)
            offset += PAGE_SIZE
            if offset >= total:
                break
            time.sleep(RATE_LIMIT_SECS)
        log(f"[{self.name}] {len(all_rows)} PTRs en los últimos {self.lookback_days} días")
        return all_rows

    # ---------- Paso 4: parsear tabla HTML de un reporte ----------

    @staticmethod
    def _extract_link(html: str) -> tuple[str, str]:
        """href del link del reporte + nombre completo del senador."""
        m = re.search(r'<a[^>]+href="([^"]+)"[^>]*>', html)
        link = m.group(1) if m else ""
        text = re.sub(r"<[^>]+>", " ", html)
        text = html_lib.unescape(re.sub(r"\s+", " ", text)).strip()
        return link, text

    def _parse_report_table(self, html: str) -> list[dict[str, str]]:
        """Filas de transacciones del primer <tbody> del reporte."""
        m = re.search(r"<tbody[^>]*>(.*?)</tbody>", html, re.S)
        if not m:
            return []
        body = m.group(1)
        rows: list[dict[str, str]] = []
        for row_m in re.finditer(r"<tr[^>]*>(.*?)</tr>", body, re.S):
            cells = re.findall(r"<td[^>]*>(.*?)</td>", row_m.group(1), re.S)
            if len(cells) < 8:
                continue
            clean = [
                html_lib.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", c))).strip()
                for c in cells
            ]
            rows.append(
                {
                    "owner": clean[0],
                    "tx_date": clean[1],
                    "ticker": clean[3],
                    "asset_name": clean[4],
                    "asset_type": clean[5],
                    "order_type": clean[6],
                    "amount": clean[7],
                }
            )
        return rows

    @staticmethod
    def _amount_mid(amount: str) -> float:
        """'$1,001 - $15,000' → 8000.5 (punto medio del rango)."""
        nums = re.findall(r"\$([\d,]+)", amount)
        values = [float(n.replace(",", "")) for n in nums] or [0.0]
        if len(values) == 1:
            return values[0]
        return (values[0] + values[-1]) / 2

    @staticmethod
    def _iso_date(us: str) -> str:
        """'09/05/2026' → '2026-09-05' (viene MM/DD/YYYY)."""
        m = re.search(r"(\d{2})/(\d{2})/(\d{4})", us)
        if m:
            return f"{m.group(3)}-{m.group(1)}-{m.group(2)}"
        return us

    # ---------- Pipeline SourceAdapter ----------

    def fetch_raw(self) -> list[SenateTrade]:
        """Descarga y normaliza los trades de los senadores seguidos."""
        if not SENATORS:
            log(f"[{self.name}] sin senadores configurados en politicians.SENATORS")
            return []

        client = _get_client()
        token = self._accept_agreement(client)
        rows = self._fetch_report_rows(client, token)
        self.stats.reports_seen = len(rows)

        # Apellido → slug (para filtrar temprano y no descargar todo)
        by_last: dict[str, list[str]] = {
            name.split()[-1].upper(): [] for name in SENATORS
        }
        # (nombre completo -> slug)
        slug_by_name = {n.upper(): s for n, s in SENATORS.items()}

        trades: list[SenateTrade] = []
        seen_senators = set()

        for row in rows[:MAX_REPORTS_PER_RUN]:
            if len(row) < 5:
                continue
            first, last, _office, link_html, filed = row[0], row[1], row[2], row[3], row[4]
            link, _ = self._extract_link(link_html)

            # PDFs escaneados: se omiten (sin tabla HTML) pero se registran
            if link.startswith(PAPER_PREFIX):
                self.stats.paper_skipped += 1
                continue
            if not link.startswith(PTR_PREFIX):
                continue

            # Filtrar por apellido del senador seguido (mayús, sin acentos simples)
            full_name = f"{first} {last}".strip().upper()
            matched_slug = None
            for name_key, slug in slug_by_name.items():
                if last.upper() in name_key or full_name == name_key:
                    matched_slug = slug
                    break
            if not matched_slug:
                continue

            time.sleep(RATE_LIMIT_SECS)
            try:
                r = client.get(f"{BASE}{link}")
                r.raise_for_status()
                # Si la sesión expiró, re-aceptar el aviso y reintentar una vez
                if r.url and r.url.rstrip("/") == LANDING.rstrip("/"):
                    log(f"[{self.name}] sesión expirada, re-aceptando aviso")
                    token = self._accept_agreement(client)
                    r = client.get(f"{BASE}{link}")
                    r.raise_for_status()
                self.stats.reports_parsed += 1
            except Exception as e:  # noqa: BLE001
                log(f"[{self.name}] error leyendo {link}: {e}")
                continue

            for t in self._parse_report_table(r.text):
                ticker = t["ticker"].strip()
                if ticker in ("--", ""):
                    continue
                if t["asset_type"].strip().lower() not in ("stock",):
                    continue
                senator_name = f"{first} {last}".strip()
                seen_senators.add(senator_name)
                trades.append(
                    SenateTrade(
                        senator=senator_name,
                        ticker=ticker,
                        asset_name=t["asset_name"],
                        order_type=t["order_type"],
                        amount_range=t["amount"],
                        amount_mid=self._amount_mid(t["amount"]),
                        tx_date=self._iso_date(t["tx_date"]),
                        filed_date=self._iso_date(filed),
                        url=f"{BASE}{link}",
                    )
                )

        self.stats.senators_matched = len(seen_senators)
        self.stats.trades = trades
        log(
            f"[{self.name}] {len(trades)} trades de {self.stats.senators_matched} "
            f"senadores seguidos ({self.stats.paper_skipped} PDFs papel omitidos)"
        )
        return trades

    def normalize(self, raw: list[SenateTrade]) -> list[Holding]:
        """Trades → cartera por senador: neto compras-ventas, pesos por monto.

        Cada senador seguido produce su propia lista; este adapter apunta a
        un solo portfolio por corrida (run_per_senator), así que normalize
        agrupa TODOS los trades recibidos (el orquestador filtra por slug).
        """
        if not raw:
            return []

        from collections import defaultdict

        by_ticker: dict[str, float] = defaultdict(float)
        for t in raw:
            o = t.order_type.strip().lower()
            if o.startswith("purchase") or o == "p":
                by_ticker[t.ticker] += t.amount_mid
            elif o.startswith("sale") or o.startswith("s"):
                by_ticker[t.ticker] -= t.amount_mid
            # Exchange (E) no cuenta como posición nueva

        positions = {k: v for k, v in by_ticker.items() if v > 0}
        total = sum(positions.values())
        if total <= 0:
            return []

        holdings = []
        for ticker, value in sorted(positions.items(), key=lambda kv: -kv[1]):
            weight = (value / total) * 100
            if weight < 0.5:
                continue
            holdings.append(
                Holding(
                    symbol=ticker,
                    name=ticker,
                    weight=round(weight, 2),
                    asset_class="equity",
                    exchange="US",
                    currency="USD",
                )
            )
        return holdings

    # ---------- Interfaz de conveniencia para run_all ----------

    def run_per_senator(self, db=None) -> list[dict[str, Any]]:
        """Corre fetch+normalize una vez y escribe cada senador en su portfolio.

        Devuelve un resumen por senador. En dry-run no escribe nada.
        """
        trades = self.fetch_raw()
        results: list[dict[str, Any]] = []

        from collections import defaultdict

        slug_by_name = {n.upper(): s for n, s in SENATORS.items()}
        by_senator: dict[str, list[SenateTrade]] = defaultdict(list)
        for t in trades:
            by_senator[t.senator.upper()].append(t)

        for senator, strades in by_senator.items():
            slug = slug_by_name.get(senator)
            if not slug:
                continue
            sub = _SenatorSliceAdapter(self, slug, strades)
            result = sub.run(db)
            result["senator"] = senator
            results.append(result)
        return results


class _SenatorSliceAdapter(SourceAdapter):
    """Adapter interno: trades ya filtrados de un senador → su portfolio."""

    name = "senate_disclosure"

    def __init__(self, parent: SenateDisclosureAdapter, slug: str, trades: list[SenateTrade]) -> None:
        super().__init__(dry_run=parent.dry_run)
        self.parent = parent
        self.portfolio_slug = slug
        self.trades = trades

    def fetch_raw(self) -> list[SenateTrade]:
        return self.trades

    def normalize(self, raw: list[SenateTrade]) -> list[Holding]:
        return self.parent.normalize(raw)


def fetch_recent_ptr_links(lookback_days: int = 45) -> list[dict[str, str]]:
    """Utilidad de diagnóstico: PTRs recientes de TODOS los senadores (solo lectura)."""
    client = _get_client()
    adapter = SenateDisclosureAdapter(lookback_days=lookback_days)
    token = adapter._accept_agreement(client)
    rows = adapter._fetch_report_rows(client, token)
    out = []
    for row in rows[:50]:
        if len(row) < 5:
            continue
        link, _ = adapter._extract_link(row[3])
        out.append(
            {
                "senator": f"{row[0]} {row[1]}",
                "filed": row[4],
                "url": f"{BASE}{link}" if link else "",
                "is_paper": link.startswith(PAPER_PREFIX),
            }
        )
    return out


if __name__ == "__main__":
    import argparse

    from base import get_db

    parser = argparse.ArgumentParser(description="Scrape Senate eFD PTRs")
    parser.add_argument("--dry-run", action="store_true", help="Sin escribir en Supabase")
    parser.add_argument(
        "--html-file",
        help="Parsea un PTR guardado (offline, sin red ni escritura) y sale",
    )
    parser.add_argument("--lookback", type=int, default=45, help="Días hacia atrás")
    args = parser.parse_args()

    if args.html_file:
        with open(args.html_file, encoding="utf-8") as fh:
            rows = parse_ptr_html(fh.read())
        print(json.dumps(rows, indent=2, ensure_ascii=False))
        print(f"\nFilas de acciones: {len(rows)} (offline, nada escrito)")
        raise SystemExit(0)

    adapter = SenateDisclosureAdapter(lookback_days=args.lookback, dry_run=args.dry_run)
    try:
        trades = adapter.fetch_raw() if args.dry_run else None
    except SenateBlocked as exc:
        log(f"[senate_disclosure] BLOQUEADO: {exc}")
        raise SystemExit(2)
    if args.dry_run:
        print(json.dumps([t.__dict__ for t in trades[:10]], indent=2, ensure_ascii=False))
        print(f"\nTotal trades: {len(trades)} (dry-run, nada escrito)")
    else:
        try:
            results = adapter.run_per_senator(get_db())
        except SenateBlocked as exc:
            log(f"[senate_disclosure] BLOQUEADO: {exc}")
            raise SystemExit(2)
        for r in results:
            log(f"[senate_disclosure] {r.get('senator')}: {r}")
