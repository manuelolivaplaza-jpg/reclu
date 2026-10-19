"""Tests del Form 4 (compras de ejecutivos). Sin red ni Supabase.

Correr:  uv run --with httpx --with pytest --with supabase python -m pytest scrapers/tests -q
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from insiders_form4 import (  # noqa: E402
    InsidersForm4Adapter,
    alert_identity,
    alert_payload,
    alert_severity,
    alert_title,
    alerts_for_unseen,
    build_events,
    drop_already_alerted,
    holdings_from_symbols,
    is_entity_name,
    parse_atom_feed,
    parse_form4,
    qualifying_trade_rows,
    resolve_xml_url,
    symbols_in_window,
    trade_key,
    trade_record,
    unseen_rows,
)

FIXTURE = Path(__file__).resolve().parents[1] / "data" / "insiders" / "ejemplo_form4_TTD.xml"
TTD_URL = (
    "https://www.sec.gov/Archives/edgar/data/1671933/"
    "000167144526000004/wk-form4_1772674051.xml"
)
TTD_ACCESSION = "0001671445-26-000004"
ADDRESS_MARKERS = ("42 NORTH CHESTNUT", "93001", "VENTURA", "rptOwnerStreet1", "rptOwnerCity")


def _ttd_xml() -> str:
    return FIXTURE.read_text(encoding="utf-8")


def _parse_ttd() -> list[dict]:
    return parse_form4(
        _ttd_xml(),
        accession=TTD_ACCESSION,
        source_url=TTD_URL,
        filed_at="2026-03-04",
    )


def _form4(
    *,
    symbol: str,
    owner: str,
    title: str,
    director: str,
    officer: str,
    transactions: str,
    extra: str = "",
) -> str:
    return f"""<?xml version="1.0"?>
<ownershipDocument>
  <issuer>
    <issuerCik>0000001234</issuerCik>
    <issuerTradingSymbol>{symbol}</issuerTradingSymbol>
  </issuer>
  <reportingOwner>
    <reportingOwnerId><rptOwnerName>{owner}</rptOwnerName></reportingOwnerId>
    <reportingOwnerAddress>
      <rptOwnerStreet1>1 SECRET STREET</rptOwnerStreet1>
      <rptOwnerCity>HIDDEN</rptOwnerCity>
      <rptOwnerState>CA</rptOwnerState>
      <rptOwnerZipCode>99999</rptOwnerZipCode>
    </reportingOwnerAddress>
    <reportingOwnerRelationship>
      <isDirector>{director}</isDirector>
      <isOfficer>{officer}</isOfficer>
      <officerTitle>{title}</officerTitle>
    </reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    {transactions}
  </nonDerivativeTable>
  {extra}
  <ownerSignature><signatureDate>2026-05-02</signatureDate></ownerSignature>
</ownershipDocument>
"""


def _tx(code: str, acquired: str, shares: str, price: str, when: str, after: str = "10") -> str:
    return f"""
    <nonDerivativeTransaction>
      <transactionDate><value>{when}</value></transactionDate>
      <transactionCoding><transactionCode>{code}</transactionCode></transactionCoding>
      <transactionAmounts>
        <transactionShares><value>{shares}</value></transactionShares>
        <transactionPricePerShare><value>{price}</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>{acquired}</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
      <postTransactionAmounts>
        <sharesOwnedFollowingTransaction><value>{after}</value></sharesOwnedFollowingTransaction>
      </postTransactionAmounts>
    </nonDerivativeTransaction>
    """


def test_parse_ttd_fixture_reads_insider_fields():
    parsed = _parse_ttd()
    assert parsed, "el fixture TTD no devolvió transacciones"
    row = parsed[0]
    assert row["symbol"] == "TTD"
    assert row["issuer_cik"] == "1671933"
    assert row["owner_name"] == "Green Jeffrey Terry"
    assert row["owner_title"] == "President and CEO"
    assert row["is_director"] is True
    assert row["is_officer"] is True
    assert row["filed_at"] == "2026-03-04"
    assert {r["code"] for r in parsed if not r["derivative"]} >= {"P", "A"}
    purchases = [r for r in parsed if r["code"] == "P" and not r["derivative"]]
    assert len(purchases) == 4
    assert is_entity_name(row["owner_name"]) is False


def test_ttd_sums_same_day_purchases():
    parsed = _parse_ttd()
    same_day = [r for r in parsed if r["trans_date"] == "2026-03-02" and r["code"] == "P"]
    assert len(same_day) == 2

    kept = qualifying_trade_rows(parsed)
    assert len(kept) == 3  # 2, 3 y 4 de marzo; el award (código A) no entra
    march2 = next(r for r in kept if r["trans_date"] == "2026-03-02")
    expected = round(527324 * 23.49 + 1472676 * 24.16, 2)
    assert march2["shares"] == 2_000_000
    assert march2["value_usd"] == expected
    assert march2["shares_after"] == 2_000_000
    assert all(r["code"] == "P" for r in kept)

    # Dos compras del mismo día que solas no llegan a US$1M, juntas sí.
    xml = _form4(
        symbol="BIG",
        owner="Ada Lovelace",
        title="CFO",
        director="0",
        officer="1",
        transactions=(
            _tx("P", "A", "30000", "20", "2026-05-01", "30000")
            + _tx("P", "A", "30000", "20", "2026-05-01", "60000")
        ),
    )
    rows = qualifying_trade_rows(
        parse_form4(xml, accession="0000000001-26-000099", filed_at="2026-05-02")
    )
    assert len(rows) == 1
    assert rows[0]["symbol"] == "BIG"
    assert rows[0]["shares"] == 60_000
    assert rows[0]["value_usd"] == 1_200_000


def test_excludes_sales_options_and_entities():
    sale = _form4(
        symbol="XYZ",
        owner="Ada Lovelace",
        title="CFO",
        director="0",
        officer="1",
        transactions=_tx("S", "D", "100000", "50", "2026-05-01")
        + _tx("M", "A", "5000", "20", "2026-05-01"),
        extra="""
        <derivativeTable>
          <derivativeTransaction>
            <transactionDate><value>2026-05-01</value></transactionDate>
            <transactionCoding><transactionCode>M</transactionCode></transactionCoding>
            <transactionAmounts>
              <transactionShares><value>1000</value></transactionShares>
              <transactionPricePerShare><value>10</value></transactionPricePerShare>
              <transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode>
            </transactionAmounts>
          </derivativeTransaction>
        </derivativeTable>
        """,
    )
    entity = _form4(
        symbol="XYZ",
        owner="ACME CAPITAL LLC",
        title="Director",
        director="1",
        officer="0",
        transactions=_tx("P", "A", "100000", "40", "2026-05-01"),
    )
    small = _form4(
        symbol="XYZ",
        owner="Ada Lovelace",
        title="CFO",
        director="0",
        officer="1",
        transactions=_tx("P", "A", "100", "10", "2026-05-01"),
    )

    parsed_sale = parse_form4(sale, accession="0000000001-26-000010", filed_at="2026-05-02")
    assert any(r["code"] == "S" and not r["derivative"] for r in parsed_sale)
    assert any(r["code"] == "M" and not r["derivative"] for r in parsed_sale)
    assert any(r["code"] == "M" and r["derivative"] for r in parsed_sale)
    parsed_entity = parse_form4(entity, accession="0000000001-26-000011", filed_at="2026-05-02")
    assert parsed_entity and is_entity_name(parsed_entity[0]["owner_name"])

    kept = qualifying_trade_rows(parsed_sale + parsed_entity + parse_form4(
        small, accession="0000000001-26-000012", filed_at="2026-05-02"
    ))
    assert kept == []


def test_records_and_logs_omit_addresses(capsys):
    parsed = _parse_ttd()
    blob = json.dumps(parsed)
    for marker in ADDRESS_MARKERS:
        assert marker not in blob
    for row in parsed:
        keys = {key.lower() for key in row}
        assert "rptownerstreet1" not in keys
        assert "street" not in keys
        assert "zip" not in keys

    records = [trade_record(row) for row in qualifying_trade_rows(parsed)]
    assert records
    allowed = {
        "accession", "issuer_cik", "symbol", "owner_name", "owner_title",
        "is_director", "is_officer", "trans_date", "filed_at", "code",
        "shares", "price", "value_usd", "shares_after", "source_url",
    }
    for record in records:
        assert set(record) == allowed
        dumped = json.dumps(record)
        for marker in ADDRESS_MARKERS:
            assert marker not in dumped

    adapter = InsidersForm4Adapter(dry_run=True)

    def _fake_fetch():
        return parsed

    adapter.fetch_raw = _fake_fetch

    class Boom:
        def table(self, *_args, **_kwargs):
            raise AssertionError("dry-run no debe tocar Supabase")

    result = adapter.run(Boom())
    assert result["dry_run"] is True
    assert result["trades"] == 3
    printed = capsys.readouterr().out
    assert "DRY-RUN compra nueva (no escrita)" in printed
    assert "TTD" in printed
    for marker in ADDRESS_MARKERS:
        assert marker not in printed


def test_same_purchase_does_not_alert_twice():
    rows = qualifying_trade_rows(_parse_ttd())
    events = build_events(rows)
    assert len(events) == 1
    event = events[0]
    assert event["symbol"] == "TTD"
    assert event["value_usd"] == round(
        527324 * 23.49 + 1472676 * 24.16 + 1685696 * 24.97 + 2314304 * 25.08,
        2,
    )
    assert alert_severity(event["value_usd"]) == "high"
    assert alert_title(event) == "Insider: President and CEO de TTD compró US$148.101.266"
    payload = alert_payload(event)
    assert set(payload) == {
        "symbol", "owner_name", "owner_title", "value_usd", "trans_date", "filed_at", "source_url",
    }
    assert payload["source_url"] == TTD_URL

    first = alerts_for_unseen(events, unseen_rows(rows, set()))
    assert len(first) == 1
    stored = {trade_key(row) for row in rows}
    assert alerts_for_unseen(events, unseen_rows(rows, stored)) == []
    assert drop_already_alerted(first, {alert_identity(event)}) == []


def test_equal_weights_and_atom_index():
    holdings = holdings_from_symbols(["C", "A", "B"], as_of=date(2026, 5, 2))
    assert [h.symbol for h in holdings] == ["A", "B", "C"]
    assert [h.weight for h in holdings] == [33.33, 33.33, 33.34]
    assert abs(sum(h.weight for h in holdings) - 100) < 0.001

    rows = qualifying_trade_rows(_parse_ttd())
    assert symbols_in_window(rows, today=date(2026, 4, 1)) == ["TTD"]
    assert symbols_in_window(rows, today=date(2026, 10, 19)) == []
    book = holdings_from_symbols(symbols_in_window(rows, today=date(2026, 4, 1)), as_of=date(2026, 4, 1))
    assert len(book) == 1 and book[0].weight == 100.0

    atom = """<?xml version="1.0" encoding="ISO-8859-1" ?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>4 - Someone (0001) (Reporting)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/111/000000000111111111/0000000001-26-000001-index.htm"/>
    <summary type="html">&lt;b&gt;Filed:&lt;/b&gt; 2026-10-16 &lt;b&gt;AccNo:&lt;/b&gt; 0000000001-26-000001</summary>
    <updated>2026-10-16T21:00:00-04:00</updated>
    <category label="form type" term="4"/>
    <id>urn:tag:sec.gov,2008:accession-number=0000000001-26-000001</id>
  </entry>
  <entry>
    <title>4 - Example Inc. (0002) (Issuer)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/222/000000000111111111/0000000001-26-000001-index.htm"/>
    <summary type="html">&lt;b&gt;Filed:&lt;/b&gt; 2026-10-16</summary>
    <updated>2026-10-16T21:00:00-04:00</updated>
    <category label="form type" term="4"/>
    <id>urn:tag:sec.gov,2008:accession-number=0000000001-26-000001</id>
  </entry>
</feed>
"""
    filings = parse_atom_feed(atom)
    assert len(filings) == 1
    assert filings[0]["accession"] == "0000000001-26-000001"
    assert filings[0]["issuer_cik"] == "222"
    assert filings[0]["filed_at"] == "2026-10-16"

    index = json.dumps(
        {"directory": {"item": [
            {"name": "0000000001-26-000001-index.html"},
            {"name": "primary_doc.xml"},
            {"name": "wk-form4_1.xml"},
        ]}}
    )
    url = resolve_xml_url(index, "https://www.sec.gov/Archives/edgar/data/222/000000000111111111")
    assert url == "https://www.sec.gov/Archives/edgar/data/222/000000000111111111/wk-form4_1.xml"
    form4 = json.dumps({"directory": {"item": [{"name": "form4.xml"}]}})
    assert resolve_xml_url(form4, "https://example.test/folder").endswith("/form4.xml")
