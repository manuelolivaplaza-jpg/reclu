"""Parsers de Schedule 13D (activistas). Sin red y sin Supabase.

Correr:
  uv run --python 3.11 --with httpx --with pytest --with supabase \
    python -m pytest scrapers/tests/test_activists_13d.py
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from activists_13d import (  # noqa: E402
    Activists13DAdapter,
    alert_payload,
    alert_severity,
    alert_title,
    filing_record,
    holdings_from_filings,
    merge_document,
    parse_efts_payload,
    parse_primary_doc,
    split_display_name,
)

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "efts_13D_2026-10.json"

PRIMARY_DOC = """<?xml version="1.0" encoding="UTF-8"?>
<edgarSubmission xmlns="http://www.sec.gov/edgar/schedule13D"
                 xmlns:com="http://www.sec.gov/edgar/common">
  <schemaVersion>X0202</schemaVersion>
  <headerData>
    <submissionType>SCHEDULE 13D/A</submissionType>
    <filerInfo>
      <filer>
        <filerCredentials>
          <cik>0002106572</cik>
        </filerCredentials>
      </filer>
    </filerInfo>
  </headerData>
  <formData>
    <coverPageHeader>
      <amendmentNo>1</amendmentNo>
      <securitiesClassTitle>Class A Common Stock</securitiesClassTitle>
      <dateOfEvent>10/16/2026</dateOfEvent>
      <issuerInfo>
        <issuerCIK>0002019793</issuerCIK>
        <issuerCusips>
          <issuerCusipNumber>98400U103</issuerCusipNumber>
        </issuerCusips>
        <issuerName>XCF Global, Inc.</issuerName>
        <address>
          <com:street1>3040 POST OAK BLVD.</com:street1>
          <com:city>HOUSTON</com:city>
          <com:stateOrCountry>TX</com:stateOrCountry>
          <com:zipCode>77056</com:zipCode>
        </address>
      </issuerInfo>
      <authorizedPersons>
        <notificationInfo>
          <personName>Samuel E. Whitley</personName>
          <personPhoneNum>2812060434</personPhoneNum>
        </notificationInfo>
      </authorizedPersons>
    </coverPageHeader>
    <reportingPersons>
      <reportingPersonInfo>
        <reportingPersonCIK>0002106572</reportingPersonCIK>
        <reportingPersonName>EEME Energy SPV I, LLC</reportingPersonName>
        <aggregateAmountOwned>228897417.60</aggregateAmountOwned>
        <percentOfClass>38.3</percentOfClass>
        <typeOfReportingPerson>OO</typeOfReportingPerson>
      </reportingPersonInfo>
    </reportingPersons>
  </formData>
</edgarSubmission>
"""


def _fixture() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def test_fixture_tiene_100_hits_de_216() -> None:
    payload = _fixture()
    assert payload["hits"]["total"]["value"] == 216
    assert len(payload["hits"]["hits"]) == 100


def test_split_display_name_con_ticker_y_cik() -> None:
    issuer = split_display_name("GameStop Corp.  (GME, GME-WT)  (CIK 0001326380)")
    assert issuer == {"name": "GameStop Corp.", "cik": "1326380", "symbol": "GME"}

    filer = split_display_name("Cohen Ryan  (CIK 0001767470)")
    assert filer == {"name": "Cohen Ryan", "cik": "1767470", "symbol": ""}


def test_split_display_name_prefiere_accion_comun() -> None:
    issuer = split_display_name("Braemar Hotels & Resorts Inc.  (BHR, BHR-PB)  (CIK 0001574085)")
    assert issuer["symbol"] == "BHR"


def test_parse_efts_payload_arma_el_filing() -> None:
    filings = parse_efts_payload(_fixture())

    assert len(filings) == 100
    first = filings[0]
    assert first["accession"] == "0002106572-26-000004"
    assert first["issuer_name"] == "XCF Global, Inc."
    assert first["symbol"] == "SAFX"
    assert first["issuer_cik"] == "2019793"
    assert first["filer_name"] == "EEME Energy SPV I, LLC"
    assert first["filed_at"] == "2026-10-16"
    assert first["form"] == "SCHEDULE 13D/A"
    assert first["is_amendment"] is True
    assert first["source_url"] == (
        "https://www.sec.gov/Archives/edgar/data/2019793/"
        "000210657226000004/primary_doc.xml"
    )


def test_parse_efts_payload_deduplica_por_accession() -> None:
    payload = _fixture()
    payload["hits"]["hits"] = payload["hits"]["hits"][:1] * 2

    assert len(parse_efts_payload(payload)) == 1


def test_parse_primary_doc_sin_direcciones() -> None:
    document = parse_primary_doc(PRIMARY_DOC)

    assert document == {
        "issuer_name": "XCF Global, Inc.",
        "issuer_cik": "2019793",
        "filer_name": "EEME Energy SPV I, LLC",
        "percent_of_class": 38.3,
        "event_date": "2026-10-16",
    }
    assert "address" not in document
    assert "personPhoneNum" not in document


def test_parse_primary_doc_invalido_no_rompe() -> None:
    assert parse_primary_doc("<no-es-xml") == {}


def test_merge_document_prioriza_el_xml_y_conserva_el_ticker() -> None:
    filing = parse_efts_payload(_fixture())[0]
    merged = merge_document(filing, parse_primary_doc(PRIMARY_DOC))

    assert merged["symbol"] == "SAFX"
    assert merged["issuer_name"] == "XCF Global, Inc."
    assert merged["percent_of_class"] == 38.3
    assert merged["event_date"] == "2026-10-16"
    assert merged["source_url"] == filing["source_url"]


def test_filing_record_no_guarda_direcciones() -> None:
    filing = merge_document(parse_efts_payload(_fixture())[0], parse_primary_doc(PRIMARY_DOC))
    record = filing_record(filing)

    assert set(record) == {
        "accession",
        "issuer_name",
        "issuer_cik",
        "symbol",
        "filer_name",
        "percent_of_class",
        "event_date",
        "filed_at",
        "form",
        "is_amendment",
        "source_url",
    }
    assert not any("address" in key or "phone" in key for key in record)


def test_holdings_igual_pesadas_y_una_por_emisor() -> None:
    filings = [
        {"symbol": "AAA", "issuer_name": "AAA Inc.", "filed_at": "2026-10-01"},
        {"symbol": "BBB", "issuer_name": "BBB Inc.", "filed_at": "2026-10-02"},
        {"symbol": "AAA", "issuer_name": "AAA Inc.", "filed_at": "2026-10-10"},
        {"symbol": "", "issuer_name": "Sin ticker", "filed_at": "2026-10-10"},
    ]
    holdings = holdings_from_filings(filings, as_of=date(2026, 10, 19))

    assert [holding.symbol for holding in holdings] == ["AAA", "BBB"]
    assert all(holding.weight == 50.0 for holding in holdings)
    assert all(holding.as_of == date(2026, 10, 19) for holding in holdings)


def test_alerta_new_trade_apunta_al_filing() -> None:
    filing = merge_document(parse_efts_payload(_fixture())[0], parse_primary_doc(PRIMARY_DOC))

    payload = alert_payload(filing)
    assert payload["source_url"] == filing["source_url"]
    assert payload["accession"] == "0002106572-26-000004"
    assert payload["symbol"] == "SAFX"
    assert alert_severity(filing) == "high"
    assert "EEME Energy SPV I, LLC" in alert_title(filing)
    assert "actualizó su 13D" in alert_title(filing)


class _FakeResponse:
    def __init__(self, payload: dict) -> None:
        self._payload = payload

    def json(self) -> dict:
        return self._payload

    @property
    def text(self) -> str:
        return ""


def test_fetch_efts_pagina_hasta_agotar(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = _fixture()
    calls: list[dict] = []

    def fake_get(self, url, **kwargs):
        calls.append(kwargs.get("params") or {})
        if len(calls) == 1:
            return _FakeResponse(payload)
        return _FakeResponse({"hits": {"total": payload["hits"]["total"], "hits": []}})

    monkeypatch.setattr(Activists13DAdapter, "_get", fake_get)
    adapter = Activists13DAdapter(dry_run=True)
    adapter.pause_s = 0

    filings = adapter.fetch_efts(today=date(2026, 10, 17))

    assert len(filings) == 100
    assert len(calls) == 2
    assert calls[0]["from"] == 0
    assert calls[0]["startdt"] == "2026-07-19"
    assert calls[0]["enddt"] == "2026-10-17"
    assert calls[1]["from"] == 100


def test_etapa_se_descubre() -> None:
    from stages import discover_stages

    discovered = {meta[0]: meta for meta, _runner in discover_stages()}
    assert discovered["activists_13d"] == (
        "activists_13d",
        "Activistas: Schedule 13D (SEC EDGAR)",
        False,
    )


def test_migracion_027_es_idempotente() -> None:
    sql = (
        Path(__file__).resolve().parent.parent.parent
        / "supabase"
        / "migrations"
        / "027_activistas.sql"
    ).read_text(encoding="utf-8").lower()

    assert "create table if not exists public.activist_filings" in sql
    assert "accession text not null unique" in sql
    assert "insert into public.portfolios" in sql
    assert "'activistas-13d'" in sql
    assert "'activistas: últimos 90 días'" in sql
    assert "on conflict (slug) do nothing" in sql
    assert "drop policy if exists" in sql
    assert "grant select on table public.activist_filings" in sql
