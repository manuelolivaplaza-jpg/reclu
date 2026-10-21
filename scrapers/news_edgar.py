"""Noticias de los formularios 8-K de la SEC (EDGAR), sin clave ni API pagada.

Fuente (feed Atom oficial y gratis):
  https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K
    &company=&dateb=&owner=include&count=100&output=atom

Cada entrada enlaza al índice del filing. Para resumir "qué pasó" se lee el
documento principal y se extraen los ítems del 8-K (2.02 resultados, 5.02
salida de directores, 8.01 otros hechos, 9.01 estados financieros, etc.).
El resumen es propio y corto (máx. 500 caracteres): nunca se copia el texto
del filing. El título es el emisor y el ticker.

El ticker no viene en el 8-K. Se cruza el CIK con
https://www.sec.gov/files/company_tickers.json usando el mismo parser que
``buybacks.py`` (la primera aparición de un CIK es el ticker principal).
Solo se guardan filings de emisores con ticker identificable: el resto no se
puede asociar a una posición y queda fuera del feed.

Destino (migración 051):
  * ``news_items``: source='sec_8k', url, title, summary, published_at, lang
    y hash = sha256(url). El upsert es por ``hash``.
  * ``news_tickers``: relación 'direct' con confidence 1.0.

Política de acceso de la SEC: User-Agent de ``sec13f.USER_AGENT`` (con
contacto) y pausa de 0,15 s entre requests. Una respuesta rota de un filing
no tumba la corrida.

La etapa ``stages/news_edgar.py`` solo corre con ``NEWS_IMPACT_ENABLED=true``
(apagada por defecto). En ``--dry-run`` se lee la red pero no se escribe nada
en Supabase.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Any, Mapping

from activists_13d import clean_symbol
from base import SourceAdapter, get_db, log
from buybacks import parse_company_tickers
from sec13f import USER_AGENT

ATOM_URL = (
    "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent"
    "&type=8-K&company=&dateb=&owner=include&count=100&output=atom"
)
COMPANY_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
ATOM_NS = "{http://www.w3.org/2005/Atom}"

SOURCE = "sec_8k"
NEWS_FLAG = "NEWS_IMPACT_ENABLED"
PAUSE_S = 0.15
MAX_FILINGS = 100
SUMMARY_MAX = 500
TITLE_MAX = 300
DRY_RUN_SAMPLE = 10

# Ítems oficiales del Form 8-K (17 CFR 249.308). Se usan para el resumen; los
# códigos que no estén acá se descartan (evita falsos positivos del HTML).
ITEM_DESCRIPTIONS: dict[str, str] = {
    "1.01": "Entry into a Material Definitive Agreement",
    "1.02": "Termination of a Material Definitive Agreement",
    "1.03": "Bankruptcy or Receivership",
    "2.01": "Completion of Acquisition or Disposition of Assets",
    "2.02": "Results of Operations and Financial Condition",
    "2.03": (
        "Creation of a Direct Financial Obligation or an Obligation under an "
        "Off-Balance Sheet Arrangement of a Registrant"
    ),
    "2.04": (
        "Triggering Events That Accelerate or Increase a Direct Financial "
        "Obligation or an Obligation under an Off-Balance Sheet Arrangement"
    ),
    "2.05": "Costs Associated with Exit or Disposal Activities",
    "2.06": "Material Impairments",
    "3.01": (
        "Notice of Delisting or Failure to Satisfy a Continued Listing Rule "
        "or Standard; Transfer of Listing"
    ),
    "3.02": "Unregistered Sales of Equity Securities",
    "3.03": "Material Modification to Rights of Security Holders",
    "4.01": "Changes in Registrant's Certifying Accountant",
    "4.02": (
        "Non-Reliance on Previously Issued Financial Statements or a Related "
        "Audit Report or Completed Interim Review"
    ),
    "5.01": "Changes in Control of Registrant",
    "5.02": (
        "Departure of Directors or Certain Officers; Election of Directors; "
        "Appointment of Certain Officers; Compensatory Arrangements of "
        "Certain Officers"
    ),
    "5.03": "Amendments to Articles of Incorporation or Bylaws; Change in Fiscal Year",
    "5.04": "Temporary Suspension of Trading Under Registrant's Employee Benefit Plans",
    "5.05": (
        "Amendments to the Registrant's Code of Ethics, or Waiver of a "
        "Provision of the Code of Ethics"
    ),
    "5.06": "Change in Shell Company Status",
    "5.07": "Submission of Matters to a Vote of Security Holders",
    "5.08": "Shareholder Director Nominations",
    "6.01": "ABS Informational and Computational Material",
    "6.02": "Change of Servicer or Trustee",
    "6.03": "Change in Credit Enhancement or Other External Support",
    "6.04": "Failure to Make a Required Distribution",
    "6.05": "Securities Act Updating Disclosure",
    "7.01": "Regulation FD Disclosure",
    "8.01": "Other Events",
    "9.01": "Financial Statements and Exhibits",
}

TITLE_RE = re.compile(
    r"^(?P<form>8-K/A|8-K)\s*-\s*(?P<company>.+?)\s*\((?P<cik>\d+)\)",
    re.IGNORECASE,
)
ITEM_RE = re.compile(r"\bitem\s+(\d{1,2}\.\d{2})\b", re.IGNORECASE)
ACCESSORY_RE = re.compile(r"accession-number=(\d{10}-\d{2}-\d{6})")
ACCNO_RE = re.compile(r"AccNo:\s*(\d{10}-\d{2}-\d{6})", re.IGNORECASE)
FILED_RE = re.compile(r"Filed:\s*(\d{4}-\d{2}-\d{2})", re.IGNORECASE)
CIK_URL_RE = re.compile(r"/Archives/edgar/data/(\d+)/")
INDEX_SUFFIX_RE = re.compile(r"/[^/]*-index\.html?$")


def news_enabled(env: Mapping[str, str] | None = None) -> bool:
    """True solo con ``NEWS_IMPACT_ENABLED=true`` (exacto, como los flags TS)."""
    source = env if env is not None else os.environ
    return source.get(NEWS_FLAG) == "true"


def hash_url(url: str) -> str:
    """Huella estable de la noticia: sha256 de la URL pública del filing."""
    return hashlib.sha256((url or "").strip().encode("utf-8")).hexdigest()


def _xml_root(xml_text: str) -> ET.Element:
    """Parsea XML ya decodificado. Quita el encoding del prólogo (Python 3.11)."""
    cleaned = re.sub(
        r"(<\?xml[^?]*?)\s+encoding=[\"'][^\"']+[\"']",
        r"\1",
        xml_text,
        count=1,
    )
    return ET.fromstring(cleaned)


def normalize_cik(raw: object) -> str:
    """CIK como texto sin ceros a la izquierda (el mapa usa la forma corta)."""
    text = str(raw or "").strip()
    if not text:
        return ""
    try:
        return str(int(float(text)))
    except (TypeError, ValueError):
        return text


def iso_utc(value: str) -> str:
    """Fecha ISO del feed a UTC. Si no se puede parsear, se devuelve tal cual."""
    text = (value or "").strip()
    if not text:
        return ""
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return text
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat()


def parse_atom_feed(xml_text: str) -> list[dict]:
    """Entradas 8-K del feed Atom, sin duplicados y en el orden del feed.

    Solo acepta formularios 8-K y 8-K/A. El título trae el emisor y el CIK;
    la URL es el índice público del filing y el ``updated`` es la marca de
    publicación (con la fecha "Filed:" como respaldo).
    """
    root = _xml_root(xml_text)
    found: dict[str, dict] = {}
    order: list[str] = []

    for entry in root.findall(f"{ATOM_NS}entry"):
        title = (entry.findtext(f"{ATOM_NS}title") or "").strip()
        form = ""
        for category in entry.findall(f"{ATOM_NS}category"):
            term = (category.get("term") or "").strip()
            if term.upper().startswith("8-K"):
                form = term
                break
        match = TITLE_RE.match(title)
        if not form and match:
            form = match.group("form").upper()
        if not form or not form.upper().startswith("8-K"):
            continue

        link = ""
        for element in entry.findall(f"{ATOM_NS}link"):
            if element.get("rel") in (None, "alternate"):
                link = (element.get("href") or "").strip()
                break
        if not link:
            continue

        entry_id = (entry.findtext(f"{ATOM_NS}id") or "").strip()
        summary = (entry.findtext(f"{ATOM_NS}summary") or "").strip()
        updated = (entry.findtext(f"{ATOM_NS}updated") or "").strip()

        accession_match = ACCESSORY_RE.search(entry_id) or ACCNO_RE.search(summary)
        accession = accession_match.group(1) if accession_match else ""
        if not accession:
            continue

        cik = match.group("cik") if match else ""
        if not cik:
            cik_match = CIK_URL_RE.search(link)
            cik = cik_match.group(1) if cik_match else ""
        cik = normalize_cik(cik)

        filed_match = FILED_RE.search(summary)
        filed_at = filed_match.group(1) if filed_match else (updated[:10] if updated else "")
        published_at = iso_utc(updated) or (
            f"{filed_at}T00:00:00+00:00" if filed_at else ""
        )
        if not published_at:
            continue

        record = {
            "accession": accession,
            "form": "8-K/A" if form.upper().startswith("8-K/A") else "8-K",
            "cik": cik,
            "company": (match.group("company").strip() if match else title)[:160],
            "url": link,
            "filed_at": filed_at,
            "published_at": published_at,
        }
        if accession not in found:
            found[accession] = record
            order.append(accession)

    return [found[accession] for accession in order]


def _item_key(code: str) -> tuple[int, int]:
    major, minor = code.split(".", 1)
    return (int(major), int(minor))


def parse_8k_items(html_text: str) -> list[str]:
    """Códigos de ítem del documento principal, únicos y en orden numérico.

    Se quitan las etiquetas y los espacios duros antes de buscar "Item X.XX".
    Solo se conservan los códigos oficiales del 8-K.
    """
    text = re.sub(r"<[^>]+>", " ", html_text or "")
    text = text.replace("&nbsp;", " ").replace("\xa0", " ")
    text = re.sub(r"&[a-zA-Z]+;", " ", text)
    codes = {match.group(1) for match in ITEM_RE.finditer(text)}
    return sorted((code for code in codes if code in ITEM_DESCRIPTIONS), key=_item_key)


def summarize_items(items: list[str]) -> str:
    """Resumen propio y corto: '8-K: Item 2.02 Results of Operations...'."""
    descriptions = [
        f"Item {code} {ITEM_DESCRIPTIONS[code]}"
        for code in sorted(set(items), key=_item_key)
        if code in ITEM_DESCRIPTIONS
    ]
    if not descriptions:
        return "8-K: presentación ante la SEC (sin ítems detectados)"
    text = "8-K: " + "; ".join(descriptions)
    if len(text) > SUMMARY_MAX:
        text = text[: SUMMARY_MAX - 3].rstrip() + "..."
    return text


def news_title(company: str, symbol: str) -> str:
    """Titular legible con emisor y ticker."""
    name = (company or symbol or "Emisor sin nombre").strip()
    label = f"{name} ({symbol}): 8-K" if symbol else f"{name}: 8-K"
    return label[:TITLE_MAX]


def news_row(
    entry: dict,
    *,
    symbol: str,
    company: str = "",
    items: list[str] | None = None,
) -> dict:
    """Fila normalizada de una noticia 8-K (sin texto del filing)."""
    url = (entry.get("url") or "").strip()
    return {
        "source": SOURCE,
        "url": url,
        "title": news_title(company or entry.get("company") or "", symbol),
        "summary": summarize_items(items or []),
        "published_at": entry.get("published_at") or "",
        "lang": "en",
        "hash": hash_url(url),
        "symbol": symbol,
        "cik": entry.get("cik") or "",
        "accession": entry.get("accession") or "",
        "items": sorted(set(items or []), key=_item_key),
    }


def news_record(row: dict) -> dict:
    """Columnas de ``news_items``; nunca incluye el cuerpo del filing."""
    return {
        "source": SOURCE,
        "url": row["url"],
        "title": str(row["title"])[:TITLE_MAX],
        "summary": str(row.get("summary") or "")[:SUMMARY_MAX],
        "published_at": row["published_at"],
        "lang": row.get("lang") or "en",
        "hash": row["hash"],
    }


def relation_record(news_id: str, symbol: str) -> dict:
    """Relación directa noticia → ticker (el CIK es del propio emisor)."""
    return {
        "news_id": news_id,
        "symbol": symbol,
        "relation": "direct",
        "confidence": 1.0,
    }


def folder_from_index_url(url: str) -> str:
    """URL del índice -> carpeta del accession (sin el nombre del archivo)."""
    clean = (url or "").split("?")[0]
    return INDEX_SUFFIX_RE.sub("", clean).rstrip("/")


def resolve_primary_doc(index_body: str, folder: str = "") -> str | None:
    """Elige el documento principal (.htm) dentro del índice JSON o HTML."""
    folder = (folder or "").rstrip("/")
    body = (index_body or "").lstrip("\ufeff")
    names: list[str] = []
    if body.startswith("{"):
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            data = None
        if isinstance(data, dict):
            items = (data.get("directory") or {}).get("item") or []
            if isinstance(items, dict):
                items = [items]
            for item in items:
                name = str((item or {}).get("name") or "").strip()
                if name:
                    names.append(name)
    else:
        for href in re.findall(r'(?i)href="([^"]+)"', body):
            name = href.split("?")[0].split("/")[-1]
            if name:
                names.append(name)

    def _url(name: str) -> str:
        if name.startswith("http"):
            return name
        return f"{folder}/{name}"

    html = [
        name
        for name in names
        if name.split("/")[-1].lower().endswith((".htm", ".html"))
        and "-index" not in name.split("/")[-1].lower()
        and not re.fullmatch(r"r\d+\.htm", name.split("/")[-1].lower())
    ]
    if html:
        return _url(html[0])
    for name in names:
        if name.split("/")[-1].lower() == "primary_doc.xml":
            return _url(name)
    return None


class NewsEdgarAdapter(SourceAdapter):
    """Feed de 8-K → news_items + news_tickers."""

    name = "news_edgar"

    def __init__(
        self,
        dry_run: bool = False,
        *,
        limit: int = MAX_FILINGS,
        fetch_items: bool = True,
        tickers: dict[str, dict] | None = None,
    ) -> None:
        super().__init__(dry_run=dry_run)
        self.client.headers["User-Agent"] = USER_AGENT
        self.client.headers["Accept"] = (
            "application/atom+xml,application/xml,application/json,text/html,*/*"
        )
        self.limit = max(0, int(limit))
        self.fetch_items = fetch_items
        self._tickers = tickers
        self.pause_s = PAUSE_S
        self._request_count = 0

    def _get_text(self, url: str) -> str:
        if self._request_count:
            time.sleep(self.pause_s)
        self._request_count += 1
        response = self.client.get(url, timeout=30.0)
        response.raise_for_status()
        return response.text

    def fetch_ticker_map(self) -> dict[str, dict]:
        if self._tickers is not None:
            return self._tickers
        try:
            return parse_company_tickers(json.loads(self._get_text(COMPANY_TICKERS_URL)))
        except Exception as error:  # noqa: BLE001 — sin mapa no hay tickers
            log(f"[news_edgar] WARNING mapa de tickers: {error}")
            return {}

    def fetch_feed(self) -> list[dict]:
        try:
            text = self._get_text(ATOM_URL)
            entries = parse_atom_feed(text)
        except Exception as error:  # noqa: BLE001 — un feed caído no corta run_all
            log(f"[news_edgar] WARNING feed: {error}")
            return []
        log(f"[news_edgar] {len(entries)} filings 8-K en el feed")
        return entries

    def fetch_filing_items(self, entry: dict) -> list[str]:
        """Ítems del documento principal. Un filing roto devuelve []."""
        accession = entry.get("accession") or "?"
        try:
            folder = folder_from_index_url(entry["url"])
            index_body = self._get_text(f"{folder}/index.json")
            doc_url = resolve_primary_doc(index_body, folder)
            if not doc_url:
                log(f"[news_edgar] WARNING {accession}: sin documento principal")
                return []
            return parse_8k_items(self._get_text(doc_url))
        except Exception as error:  # noqa: BLE001 — se guarda sin ítems
            log(f"[news_edgar] WARNING {accession}: {error}")
            return []

    def fetch_raw(self) -> dict:
        entries = self.fetch_feed()
        tickers = self.fetch_ticker_map()
        rows: list[dict] = []
        skipped_no_ticker = 0
        for entry in entries[: self.limit]:
            info = tickers.get(entry.get("cik") or "") or {}
            symbol = clean_symbol(info.get("ticker") or "")
            if not symbol:
                skipped_no_ticker += 1
                continue
            items = self.fetch_filing_items(entry) if self.fetch_items else []
            rows.append(
                news_row(
                    entry,
                    symbol=symbol,
                    company=info.get("title") or entry.get("company") or "",
                    items=items,
                )
            )
        return {
            "entries": len(entries),
            "rows": rows,
            "skipped_no_ticker": skipped_no_ticker,
        }

    def normalize(self, raw: dict) -> list[dict]:
        return list(raw.get("rows") or [])

    def run(self, db=None) -> dict:
        raw = self.fetch_raw()
        rows = self.normalize(raw)
        if self.dry_run:
            return self._run_dry(raw, rows)
        if db is None:
            db = get_db()
        return self._run_write(db, raw, rows)

    def _summary(self, raw: dict, rows: list[dict], *, dry_run: bool) -> dict:
        return {
            "source": self.name,
            "news": len(rows),
            "tickers": len(rows),
            "with_items": sum(1 for row in rows if row.get("items")),
            "skipped_no_ticker": int(raw.get("skipped_no_ticker") or 0),
            "feed": int(raw.get("entries") or 0),
            "status": "ok" if rows else "empty",
            "dry_run": dry_run,
        }

    def _run_dry(self, raw: dict, rows: list[dict]) -> dict:
        for row in rows[:DRY_RUN_SAMPLE]:
            log(
                f"[news_edgar] DRY-RUN {row['symbol']} {row['published_at']} "
                f"{row['summary']} ({row['url']})"
            )
        log(f"[news_edgar] DRY-RUN: {len(rows)} noticias NO escritas")
        return self._summary(raw, rows, dry_run=True)

    def _run_write(self, db: Any, raw: dict, rows: list[dict]) -> dict:
        if not rows:
            return self._summary(raw, rows, dry_run=False)

        records: dict[str, dict] = {}
        for row in rows:
            records[row["hash"]] = news_record(row)
        payload = list(records.values())
        for start in range(0, len(payload), 50):
            db.table("news_items").upsert(
                payload[start : start + 50], on_conflict="hash"
            ).execute()

        ids: dict[str, str] = {}
        hashes = list(records)
        for start in range(0, len(hashes), 50):
            result = (
                db.table("news_items")
                .select("id,hash")
                .in_("hash", hashes[start : start + 50])
                .execute()
            )
            for item in result.data or []:
                if item.get("hash") and item.get("id"):
                    ids[item["hash"]] = item["id"]

        relations: dict[tuple[str, str], dict] = {}
        for row in rows:
            news_id = ids.get(row["hash"])
            if not news_id:
                continue
            key = (news_id, row["symbol"])
            relations[key] = relation_record(news_id, row["symbol"])
        relation_payload = list(relations.values())
        for start in range(0, len(relation_payload), 50):
            db.table("news_tickers").upsert(
                relation_payload[start : start + 50],
                on_conflict="news_id,symbol,relation",
            ).execute()

        log(
            f"[news_edgar] {len(payload)} noticias y "
            f"{len(relation_payload)} relaciones escritas"
        )
        summary = self._summary(raw, rows, dry_run=False)
        summary["written"] = len(payload)
        summary["relations"] = len(relation_payload)
        return summary


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Noticias 8-K de la SEC (EDGAR) → news_items"
    )
    parser.add_argument("--dry-run", action="store_true", help="No escribir en Supabase")
    parser.add_argument(
        "--limit", type=int, default=MAX_FILINGS, help="Máximo de filings del feed"
    )
    parser.add_argument(
        "--no-items",
        action="store_true",
        help="No descargar el documento principal (resumen sin ítems)",
    )
    args = parser.parse_args()

    if not news_enabled():
        raise SystemExit(
            "news_edgar está apagado: exporta NEWS_IMPACT_ENABLED=true para correrlo."
        )

    resultado = NewsEdgarAdapter(
        dry_run=args.dry_run,
        limit=args.limit,
        fetch_items=not args.no_items,
    ).run(None)
    log(f"[news_edgar] Result: {resultado}")
