"""Tests de Polymarket (F30). Sin red ni Supabase: fixtures locales.

Correr:
  uv run --no-project --with pytest --with-requirements scrapers/requirements.txt \
      python -m pytest scrapers/tests/test_polymarket.py -q
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from polymarket import (  # noqa: E402
    ALERT_TITLE,
    TRADE_COLUMNS,
    PolymarketAdapter,
    alert_payload,
    alert_severity,
    alert_summary,
    alert_title,
    apply_category_filter,
    category_for_tags,
    dedupe_trades,
    event_tags_map,
    format_usd,
    leaderboard_record,
    market_holdings,
    parse_leaderboard,
    parse_trades,
    trade_key,
    trade_record,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "polymarket"
TRADES_FIXTURE = FIXTURES / "pm_trades_10k.json"
LEADERBOARD_FIXTURE = FIXTURES / "pm_leaderboard.json"

# Tags verificados en vivo en Gamma para los eventos del fixture.
EVENT_TAGS: dict[str, list[str]] = {
    "atp-kecmano-duckwor-2026-10-19": ["tennis", "sports", "games"],
    "anthropic-announces-bankruptcy-by": [
        "tech",
        "finance",
        "business",
        "corporate-financials",
    ],
    "sea-mon-cag-2026-10-19": ["soccer", "sports", "games"],
    "wta-krueger-tjen-2026-10-18": ["tennis", "sports", "games"],
}


def _trades_raw() -> list[dict]:
    return json.loads(TRADES_FIXTURE.read_text(encoding="utf-8"))


def _leaderboard_raw() -> list[dict]:
    return json.loads(LEADERBOARD_FIXTURE.read_text(encoding="utf-8"))


def _filtered_trades() -> list[dict]:
    return apply_category_filter(parse_trades(_trades_raw()), EVENT_TAGS)


def test_parse_fixture_encuentra_las_cinco_apuestas() -> None:
    trades = parse_trades(_trades_raw())
    assert len(trades) == 5
    assert all(trade["value_usd"] >= 10_000 for trade in trades)
    # size * price = monto en USD; el fixture trae 110381.3 * 0.39.
    atp = next(trade for trade in trades if trade["market_slug"].startswith("atp-"))
    assert atp["value_usd"] == pytest.approx(43_048.71, abs=0.01)
    assert atp["wallet"] == "0x2c335066fe58fe9237c3d3dc7b275c2a034a0563"
    assert atp["alias"] == "Substantial-Service"
    assert atp["traded_at"].startswith("2026-10-19T")


def test_parse_no_copia_bio_foto_ni_redes() -> None:
    records = [trade_record(trade) for trade in parse_trades(_trades_raw())]
    for record in records:
        assert set(record) == set(TRADE_COLUMNS)
        joined = " ".join(record.keys()).lower()
        for token in ("bio", "profileimage", "xusername", "email", "address"):
            assert token not in joined


def test_category_for_tags_prioriza_deportes() -> None:
    assert category_for_tags(["tennis", "sports", "games"]) is None
    # Un evento deportivo con tag político sigue siendo deporte.
    assert category_for_tags(["sports", "politics"]) is None
    assert category_for_tags(["politics", "elections"]) == "politics"
    assert category_for_tags(["finance", "business"]) == "economy"
    assert category_for_tags(["tech", "anthropic"]) is None
    assert category_for_tags([]) is None


def test_event_tags_map_lee_gamma() -> None:
    raw = [
        {"slug": "a", "tags": [{"slug": "Politics"}, {"slug": "elections"}]},
        {"slug": "b", "tags": []},
        {"slug": "", "tags": [{"slug": "sports"}]},
    ]
    assert event_tags_map(raw) == {"a": ["politics", "elections"], "b": []}


def test_filtro_deja_solo_politica_y_economia_sin_deportes() -> None:
    trades = _filtered_trades()
    assert len(trades) == 2
    assert {trade["event_slug"] for trade in trades} == {
        "anthropic-announces-bankruptcy-by"
    }
    assert all(trade["category"] == "economy" for trade in trades)
    for trade in trades:
        assert "atp" not in trade["market_slug"]
        assert "monza" not in trade["market_slug"]
        assert "women" not in trade["market_title"].lower()


def test_dedupe_por_transaccion_billetera_asset_y_lado() -> None:
    trades = parse_trades(_trades_raw())
    assert len(dedupe_trades(trades + trades)) == len(trades)
    key = trade_key(trades[0])
    assert len(key) == 4 and key[0].startswith("0x")


def test_leaderboard_publico() -> None:
    rows = parse_leaderboard(_leaderboard_raw())
    assert len(rows) == 5
    assert [row["rank"] for row in rows] == [1, 2, 3, 4, 5]
    assert rows[0]["alias"] == "BreakTheBank"
    assert rows[0]["wallet"].islower()
    assert rows[0]["volume_usd"] == pytest.approx(1_394_622.003133)
    assert rows[0]["profile_url"].endswith(rows[0]["wallet"])
    record = leaderboard_record(rows[0], now=None)
    assert set(record) == {
        "wallet",
        "alias",
        "rank",
        "volume_usd",
        "pnl_usd",
        "profile_url",
        "updated_at",
    }
    assert "bio" not in record


def test_alertas_son_threshold_y_no_dicen_insider() -> None:
    trade = _filtered_trades()[0]
    assert alert_title(trade) == "Apuesta grande en Polymarket"
    assert ALERT_TITLE == "Apuesta grande en Polymarket"
    summary = alert_summary(trade)
    payload = alert_payload(trade)
    assert "insider" not in (ALERT_TITLE + summary + json.dumps(payload)).lower()
    assert "no es recomendación" in summary
    assert payload["trade_key"] == list(trade_key(trade))
    assert alert_severity(10_000) == "medium"
    assert alert_severity(100_000) == "high"


def test_holdings_ponderan_por_monto_y_suman_cien() -> None:
    holdings = market_holdings(_filtered_trades(), as_of=date(2026, 10, 19))
    assert len(holdings) == 2
    assert round(sum(holding.weight for holding in holdings), 2) == 100.0
    assert holdings[0].weight >= holdings[1].weight
    assert all(holding.asset_class == "other" for holding in holdings)
    assert all(holding.exchange == "Polymarket" for holding in holdings)


def test_format_usd_es_cl() -> None:
    assert format_usd(43_048.71) == "43.049"
    assert format_usd(1_000_000) == "1.000.000"


class _DBProhibida:
    """Si el dry-run toca la base, el test falla."""

    def table(self, *_args, **_kwargs):
        raise AssertionError("dry-run no debe tocar Supabase")


def test_dry_run_no_escribe(monkeypatch: pytest.MonkeyPatch) -> None:
    adapter = PolymarketAdapter(dry_run=True)
    monkeypatch.setattr(
        adapter,
        "fetch_raw",
        lambda: {
            "trades": parse_trades(_trades_raw()),
            "leaderboard": parse_leaderboard(_leaderboard_raw()),
            "tags_by_event": EVENT_TAGS,
        },
    )
    result = adapter.run(_DBProhibida())
    assert result["dry_run"] is True
    assert result["trades"] == 2
    assert result["leaderboard"] == 5
    assert result["holdings"] == 2
    assert "new_trades" not in result


def test_migracion_030_es_idempotente() -> None:
    sql_path = (
        Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "030_polymarket.sql"
    )
    sql = sql_path.read_text(encoding="utf-8").lower()
    assert "create table if not exists public.prediction_trades" in sql
    assert "create table if not exists public.prediction_leaderboard" in sql
    assert "create index if not exists" in sql
    assert "drop policy if exists" in sql
    assert "on conflict (slug) do update" in sql
    assert "polymarket-ballenas" in sql
    assert "drop table" not in sql
