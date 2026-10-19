"""
Polymarket — grandes apuestas en política y economía.

Fuentes (verificadas 2026-10-19, sin clave):
  Data API trades:
    https://data-api.polymarket.com/trades?limit=200&filterType=CASH&filterAmount=10000
  Data API leaderboard:
    https://data-api.polymarket.com/v1/leaderboard?limit=50
  Gamma API (tags del evento, para separar política/economía de deportes):
    https://gamma-api.polymarket.com/events?slug=<eventSlug>

El feed de trades NO trae categoría. Se resuelve por los tags del evento en
Gamma y se descarta cualquier evento con tag deportivo. Solo se guardan
apuestas de US$10.000 o más.

Privacidad (Ley 19.628 / 21.719):
  - Se guarda la billetera seudónima (proxyWallet) y el alias público
    (userName o pseudonym). Nada de bio, foto, email ni redes sociales.
  - No se intenta desanonimizar ni se cruza con otras fuentes.
  - El perfil enlazado es el público de Polymarket.

Portafolio: polymarket-ballenas (category model). Los holdings son los
mercados con más apuestas grandes en los últimos 7 días, ponderados por
monto. Las alertas son de tipo `threshold` y se titulan
"Apuesta grande en Polymarket": informativas, nunca "insider".
"""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any, Iterable

from base import Holding, SourceAdapter, get_db, log

DATA_API_BASE = "https://data-api.polymarket.com"
GAMMA_API_BASE = "https://gamma-api.polymarket.com"
TRADES_URL = f"{DATA_API_BASE}/trades"
LEADERBOARD_URL = f"{DATA_API_BASE}/v1/leaderboard"

MIN_AMOUNT_USD = 10_000.0
HIGH_AMOUNT_USD = 100_000.0
TRADES_LIMIT = 200
LEADERBOARD_LIMIT = 50
EVENT_BATCH = 20
LOOKBACK_DAYS = 7
TOP_MARKETS = 10
MAX_ALERTS = 50

PORTFOLIO_SLUG = "polymarket-ballenas"
ALERT_TITLE = "Apuesta grande en Polymarket"

# Tags de Gamma verificados en vivo (2026-10-19). No hay un campo "category"
# único: se usan los slugs de tag del evento. Deportes se excluye primero,
# aunque el evento tenga también un tag de política (ej. "World Cup").
SPORTS_TAGS = frozenset(
    {
        "sports",
        "sport",
        "games",
        "tennis",
        "soccer",
        "football",
        "nba",
        "nfl",
        "mlb",
        "nhl",
        "basketball",
        "baseball",
        "hockey",
        "olympics",
        "formula-1",
        "f1",
        "ufc",
        "boxing",
        "cricket",
        "golf",
        "esports",
        "atp",
        "wta",
        "premier-league",
        "champions-league",
        "serie-a",
        "la-liga",
        "bundesliga",
        "ligue-1",
        "mls",
    }
)

POLITICS_TAGS = frozenset(
    {
        "politics",
        "politics-2",
        "elections",
        "election",
        "us-politics",
        "us-election",
        "presidential-election",
        "2024-presidential-election",
        "2024-election",
        "2028-election",
        "geopolitics",
        "foreign-policy",
        "government",
        "federal-government",
        "congress",
        "senate",
        "house-races",
        "supreme-court",
        "trump",
        "potus",
        "us-presidency",
        "presidency",
        "middle-east",
        "ukraine",
        "russia",
        "israel",
        "iran",
        "china",
        "venezuela",
        "tariffs",
        "trade-war",
        "world",
    }
)

ECONOMY_TAGS = frozenset(
    {
        "economy",
        "economics",
        "finance",
        "business",
        "corporate-financials",
        "markets",
        "stock-market",
        "stocks",
        "sp500",
        "nasdaq",
        "dow",
        "fed",
        "federal-reserve",
        "inflation",
        "recession",
        "interest-rates",
        "gdp",
        "jobs",
        "unemployment",
        "earnings",
        "crypto",
        "bitcoin",
        "ethereum",
    }
)

TRADE_COLUMNS = (
    "wallet",
    "alias",
    "side",
    "asset",
    "condition_id",
    "market_slug",
    "event_slug",
    "market_title",
    "outcome",
    "outcome_index",
    "size",
    "price",
    "value_usd",
    "category",
    "traded_at",
    "tx_hash",
    "source_url",
    "profile_url",
)

FORBIDDEN_FIELD_TOKENS = (
    "bio",
    "profileimage",
    "xusername",
    "email",
    "address",
    "street",
    "city",
    "zip",
    "phone",
    "ip",
)


# ---------------------------------------------------------------------------
# Parseo y filtros (sin red ni Supabase: testeable con fixtures)
# ---------------------------------------------------------------------------


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _as_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _payload(raw: Any) -> list[dict]:
    """v1 devuelve listas; v2 envuelve en {"data": [...]}. Acepta ambas."""
    if isinstance(raw, list):
        return [row for row in raw if isinstance(row, dict)]
    if isinstance(raw, dict):
        data = raw.get("data")
        if isinstance(data, list):
            return [row for row in data if isinstance(row, dict)]
    return []


def _wallet_like(value: str) -> bool:
    """Alias autogenerado tipo 0xabc...-1759935795465: no es un nombre útil."""
    low = value.strip().lower()
    return low.startswith("0x") and len(low) > 20


def public_alias(row: dict) -> str:
    """Alias pA-oblico, sin caer en el nombre autogenerado de la billetera."""
    user_name = str(row.get("userName") or "").strip()
    name = str(row.get("name") or "").strip()
    pseudonym = str(row.get("pseudonym") or "").strip()
    for candidate in (user_name, name):
        if candidate and not _wallet_like(candidate):
            return candidate
    return pseudonym or user_name or name


def epoch_to_iso(value: Any) -> str:
    timestamp = _as_int(value)
    if timestamp <= 0:
        return ""
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()


def format_usd(value: float) -> str:
    """Entero con separador de miles es-CL (148.101)."""
    return f"{int(round(value)):,}".replace(",", ".")


def category_for_tags(tag_slugs: Iterable[str]) -> str | None:
    """Devuelve politics/economy/None. Deportes gana siempre."""
    tags = {str(tag).strip().lower() for tag in tag_slugs if tag}
    if tags & SPORTS_TAGS:
        return None
    if tags & POLITICS_TAGS:
        return "politics"
    if tags & ECONOMY_TAGS:
        return "economy"
    return None


def parse_trades(raw: Any) -> list[dict]:
    """Normaliza el feed de trades. No copia bio, foto ni redes sociales."""
    trades: list[dict] = []
    for row in _payload(raw):
        wallet = str(row.get("proxyWallet") or "").strip().lower()
        size = _as_float(row.get("size"))
        price = _as_float(row.get("price"))
        value = round(size * price, 2)
        traded_at = epoch_to_iso(row.get("timestamp"))
        if not wallet or not traded_at or value < MIN_AMOUNT_USD:
            continue
        alias = public_alias(row)
        market_slug = str(row.get("slug") or "").strip()
        event_slug = str(row.get("eventSlug") or market_slug).strip()
        trades.append(
            {
                "wallet": wallet,
                "alias": alias or wallet,
                "side": str(row.get("side") or "").strip().upper(),
                "asset": str(row.get("asset") or "").strip(),
                "condition_id": str(row.get("conditionId") or "").strip(),
                "market_slug": market_slug,
                "event_slug": event_slug,
                "market_title": str(row.get("title") or "").strip(),
                "outcome": str(row.get("outcome") or "").strip(),
                "outcome_index": _as_int(row.get("outcomeIndex")),
                "size": size,
                "price": price,
                "value_usd": value,
                "category": "",
                "traded_at": traded_at,
                "tx_hash": str(row.get("transactionHash") or "").strip(),
                "source_url": market_url(event_slug, market_slug),
                "profile_url": profile_url(wallet),
            }
        )
    trades.sort(key=lambda trade: (trade["traded_at"], trade["value_usd"]), reverse=True)
    return trades


def event_tags_map(raw_events: Any) -> dict[str, list[str]]:
    """Mapea eventSlug -> [tag slugs] desde la respuesta de Gamma /events."""
    mapping: dict[str, list[str]] = {}
    for event in _payload(raw_events):
        slug = str(event.get("slug") or "").strip()
        if not slug:
            continue
        tags = event.get("tags") or []
        mapping[slug] = [
            str(tag.get("slug") or "").strip().lower()
            for tag in tags
            if isinstance(tag, dict) and tag.get("slug")
        ]
    return mapping


def apply_category_filter(
    trades: list[dict], tags_by_event: dict[str, list[str]]
) -> list[dict]:
    """Deja solo política/economía y anota la categoría."""
    filtered: list[dict] = []
    for trade in trades:
        tags = tags_by_event.get(trade.get("event_slug") or "")
        if tags is None:
            tags = tags_by_event.get(trade.get("market_slug") or "")
        category = category_for_tags(tags or [])
        if category is None:
            continue
        filtered.append({**trade, "category": category})
    return filtered


def trade_key(trade: dict) -> tuple[str, str, str, str]:
    """Clave idempotente. Si falta el tx, usa mercado + fecha + billetera."""
    tx_hash = str(trade.get("tx_hash") or "").strip()
    if tx_hash:
        return (
            tx_hash,
            str(trade.get("wallet") or "").lower(),
            str(trade.get("asset") or ""),
            str(trade.get("side") or "").upper(),
        )
    return (
        str(trade.get("market_slug") or ""),
        str(trade.get("traded_at") or ""),
        str(trade.get("wallet") or "").lower(),
        str(trade.get("outcome") or ""),
    )


def dedupe_trades(trades: list[dict]) -> list[dict]:
    seen: set[tuple] = set()
    unique: list[dict] = []
    for trade in trades:
        key = trade_key(trade)
        if key in seen:
            continue
        seen.add(key)
        unique.append(trade)
    return unique


def trade_record(trade: dict) -> dict:
    """Columnas de prediction_trades. Solo alias público y billetera seudónima."""
    record = {
        "wallet": trade["wallet"],
        "alias": trade.get("alias") or trade["wallet"],
        "side": trade.get("side") or "",
        "asset": trade.get("asset") or "",
        "condition_id": trade.get("condition_id") or "",
        "market_slug": trade.get("market_slug") or "",
        "event_slug": trade.get("event_slug") or "",
        "market_title": trade.get("market_title") or "",
        "outcome": trade.get("outcome") or "",
        "outcome_index": _as_int(trade.get("outcome_index")),
        "size": _as_float(trade.get("size")),
        "price": _as_float(trade.get("price")),
        "value_usd": _as_float(trade.get("value_usd")),
        "category": trade.get("category") or "",
        "traded_at": trade.get("traded_at") or "",
        "tx_hash": trade.get("tx_hash") or "",
        "source_url": trade.get("source_url") or "",
        "profile_url": trade.get("profile_url") or "",
    }
    for key in record:
        low = key.lower()
        if any(token in low for token in FORBIDDEN_FIELD_TOKENS):
            raise RuntimeError(f"columna de dato personal rechazada: {key}")
    return record


def market_url(event_slug: str, market_slug: str = "") -> str:
    slug = event_slug or market_slug
    return f"https://polymarket.com/event/{slug}" if slug else "https://polymarket.com"


def profile_url(wallet: str) -> str:
    return f"https://polymarket.com/profile/{wallet}" if wallet else "https://polymarket.com"


def parse_leaderboard(raw: Any) -> list[dict]:
    """Leaderboard público: rank, billetera, alias, volumen y PnL."""
    rows: list[dict] = []
    for row in _payload(raw):
        wallet = str(row.get("proxyWallet") or "").strip().lower()
        if not wallet:
            continue
        alias = public_alias(row)
        rows.append(
            {
                "wallet": wallet,
                "alias": alias or wallet,
                "rank": _as_int(row.get("rank")),
                "volume_usd": round(_as_float(row.get("vol")), 2),
                "pnl_usd": round(_as_float(row.get("pnl")), 2),
                "profile_url": profile_url(wallet),
            }
        )
    rows.sort(key=lambda row: row["rank"] or 10**9)
    return rows


def leaderboard_record(row: dict, *, now: datetime | None = None) -> dict:
    stamp = (now or datetime.now(timezone.utc)).isoformat()
    return {
        "wallet": row["wallet"],
        "alias": row.get("alias") or row["wallet"],
        "rank": _as_int(row.get("rank")),
        "volume_usd": _as_float(row.get("volume_usd")),
        "pnl_usd": _as_float(row.get("pnl_usd")),
        "profile_url": row.get("profile_url") or profile_url(row["wallet"]),
        "updated_at": stamp,
    }


def alert_severity(value_usd: float) -> str:
    return "high" if value_usd >= HIGH_AMOUNT_USD else "medium"


def alert_title(_trade: dict | None = None) -> str:
    return ALERT_TITLE


def alert_summary(trade: dict) -> str:
    verb = "vendió" if str(trade.get("side")).upper() == "SELL" else "compró"
    alias = trade.get("alias") or "Una billetera"
    outcome = trade.get("outcome") or "el resultado"
    return (
        f"{alias} {verb} {outcome} por US${format_usd(_as_float(trade.get('value_usd')))} "
        f"en «{trade.get('market_title') or 'un mercado de Polymarket'}». "
        "Dato público de Polymarket; no es recomendación de inversión."
    )


def alert_payload(trade: dict) -> dict:
    return {
        "trade_key": list(trade_key(trade)),
        "wallet": trade.get("wallet") or "",
        "alias": trade.get("alias") or "",
        "market": trade.get("market_title") or "",
        "market_slug": trade.get("market_slug") or "",
        "outcome": trade.get("outcome") or "",
        "side": trade.get("side") or "",
        "value_usd": _as_float(trade.get("value_usd")),
        "category": trade.get("category") or "",
        "traded_at": trade.get("traded_at") or "",
        "source_url": trade.get("source_url") or "",
        "profile_url": trade.get("profile_url") or "",
    }


def proportional_weights(values: list[float]) -> list[float]:
    total = sum(values)
    if total <= 0 or not values:
        return []
    weights = [round(value / total * 100, 2) for value in values]
    diff = round(100.0 - sum(weights), 2)
    weights[-1] = round(weights[-1] + diff, 2)
    return weights


def market_holdings(
    trades: list[dict], *, as_of: date, top: int = TOP_MARKETS
) -> list[Holding]:
    """Top mercados por monto apostado en la ventana. Pesos suman 100."""
    totals: dict[str, dict] = {}
    for trade in trades:
        slug = trade.get("market_slug") or trade.get("event_slug") or ""
        if not slug:
            continue
        item = totals.setdefault(
            slug,
            {"slug": slug, "title": trade.get("market_title") or slug, "value": 0.0},
        )
        item["value"] += _as_float(trade.get("value_usd"))
    ranked = sorted(totals.values(), key=lambda item: item["value"], reverse=True)[:top]
    weights = proportional_weights([item["value"] for item in ranked])
    return [
        Holding(
            symbol=item["slug"],
            name=item["title"],
            weight=weight,
            asset_class="other",
            exchange="Polymarket",
            currency="USD",
            as_of=as_of,
        )
        for item, weight in zip(ranked, weights)
    ]


# ---------------------------------------------------------------------------
# Adapter
# ---------------------------------------------------------------------------


class PolymarketAdapter(SourceAdapter):
    name = "polymarket"
    portfolio_slug = PORTFOLIO_SLUG

    def _get_json(self, url: str, params: Any = None) -> Any:
        response = self.client.get(url, params=params)
        response.raise_for_status()
        return response.json()

    def fetch_trades(self, limit: int = TRADES_LIMIT) -> list[dict]:
        raw = self._get_json(
            TRADES_URL,
            params={
                "limit": limit,
                "filterType": "CASH",
                "filterAmount": int(MIN_AMOUNT_USD),
            },
        )
        return parse_trades(raw)

    def fetch_leaderboard(self, limit: int = LEADERBOARD_LIMIT) -> list[dict]:
        raw = self._get_json(LEADERBOARD_URL, params={"limit": limit})
        return parse_leaderboard(raw)

    def fetch_event_tags(self, event_slugs: Iterable[str]) -> dict[str, list[str]]:
        unique = sorted({str(slug).strip() for slug in event_slugs if slug})
        mapping: dict[str, list[str]] = {}
        for start in range(0, len(unique), EVENT_BATCH):
            chunk = unique[start : start + EVENT_BATCH]
            params = [("slug", slug) for slug in chunk]
            try:
                raw = self._get_json(f"{GAMMA_API_BASE}/events", params=params)
            except Exception as exc:  # noqa: BLE001 - un lote no tumba la corrida
                log(f"[polymarket] WARNING tags {chunk[0]}...: {exc}")
                continue
            mapping.update(event_tags_map(raw))
        return mapping

    def fetch_raw(self) -> dict:
        trades = self.fetch_trades()
        leaderboard = self.fetch_leaderboard()
        tags_by_event = self.fetch_event_tags(
            trade.get("event_slug") or "" for trade in trades
        )
        return {
            "trades": trades,
            "leaderboard": leaderboard,
            "tags_by_event": tags_by_event,
        }

    def normalize_trades(self, raw: dict) -> list[dict]:
        trades = apply_category_filter(
            raw.get("trades") or [], raw.get("tags_by_event") or {}
        )
        return dedupe_trades(trades)

    def normalize(self, raw: dict) -> list[Holding]:
        return market_holdings(self.normalize_trades(raw), as_of=date.today())

    # -- Escritura ---------------------------------------------------------

    def _existing_trade_keys(self, db, *, days: int = 14) -> set[tuple]:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        result = (
            db.table("prediction_trades")
            .select("tx_hash,wallet,asset,side,market_slug,traded_at,outcome")
            .gte("traded_at", cutoff)
            .execute()
        )
        return {trade_key(row) for row in (result.data or [])}

    def _insert_trades(self, db, trades: list[dict]) -> list[dict]:
        existing = self._existing_trade_keys(db)
        fresh = [trade for trade in trades if trade_key(trade) not in existing]
        if not fresh:
            return []
        db.table("prediction_trades").insert(
            [trade_record(trade) for trade in fresh]
        ).execute()
        return fresh

    def _upsert_leaderboard(self, db, rows: list[dict]) -> int:
        if not rows:
            return 0
        db.table("prediction_leaderboard").upsert(
            [leaderboard_record(row) for row in rows],
            on_conflict="wallet",
        ).execute()
        return len(rows)

    def _alerted_keys(self, db, portfolio_id: str) -> set[tuple]:
        result = (
            db.table("alerts")
            .select("payload")
            .eq("portfolio_id", portfolio_id)
            .eq("type", "threshold")
            .order("created_at", desc=True)
            .limit(500)
            .execute()
        )
        keys: set[tuple] = set()
        for row in result.data or []:
            payload = row.get("payload") or {}
            raw_key = payload.get("trade_key") or []
            if isinstance(raw_key, list) and len(raw_key) == 4:
                keys.add(tuple(str(part) for part in raw_key))
        return keys

    def _insert_alerts(self, db, portfolio_id: str, fresh: list[dict]) -> int:
        if not fresh:
            return 0
        seen = self._alerted_keys(db, portfolio_id)
        candidates = [
            trade for trade in fresh if trade_key(trade) not in seen
        ]
        candidates.sort(key=lambda trade: trade.get("value_usd") or 0.0, reverse=True)
        candidates = candidates[:MAX_ALERTS]
        if not candidates:
            return 0
        db.table("alerts").insert(
            [
                {
                    "portfolio_id": portfolio_id,
                    "type": "threshold",
                    "severity": alert_severity(_as_float(trade.get("value_usd"))),
                    "title": alert_title(trade),
                    "summary": alert_summary(trade),
                    "payload": alert_payload(trade),
                    "is_published": True,
                }
                for trade in candidates
            ]
        ).execute()
        return len(candidates)

    def _sync_holdings(self, db, trades: list[dict]) -> int:
        today = date.today()
        holdings = market_holdings(trades, as_of=today)
        wanted = {holding.symbol: holding for holding in holdings}
        portfolio_id = self._resolve_portfolio_id(db)
        existing = (
            db.table("holdings")
            .select("id,symbol,weight,as_of")
            .eq("portfolio_id", portfolio_id)
            .execute()
        )
        by_symbol: dict[str, list[dict]] = defaultdict(list)
        for row in existing.data or []:
            by_symbol[row["symbol"]].append(row)

        for symbol, holding in wanted.items():
            current = sorted(
                by_symbol.get(symbol, []), key=lambda row: str(row.get("as_of") or "")
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
            old_weight = _as_float(keep.get("weight"))
            same_day = str(keep.get("as_of") or "")[:10] == today.isoformat()
            if same_day and abs(old_weight - holding.weight) < 0.01:
                continue
            payload["previous_weight"] = old_weight
            db.table("holdings").update(payload).eq("id", keep["id"]).execute()

        for symbol, current in by_symbol.items():
            if symbol in wanted:
                continue
            for row in current:
                db.table("holdings").delete().eq("id", row["id"]).execute()
        return len(wanted)

    def run(self, db=None) -> dict:
        raw = self.fetch_raw()
        trades = self.normalize_trades(raw)
        leaderboard = raw.get("leaderboard") or []
        empty = {
            "source": self.name,
            "portfolio": self.portfolio_slug,
            "trades": len(trades),
            "leaderboard": len(leaderboard),
            "status": "ok" if trades or leaderboard else "empty",
        }

        if self.dry_run:
            sample = trades[0] if trades else None
            log(
                f"[polymarket] DRY-RUN: {len(trades)} apuestas >= "
                f"US${format_usd(MIN_AMOUNT_USD)} en política/economía, "
                f"{len(leaderboard)} billeteras en el leaderboard. NO se escribe nada."
            )
            if sample:
                log(
                    f"[polymarket] muestra: {sample['alias']} "
                    f"US${format_usd(sample['value_usd'])} en {sample['market_title']}"
                )
            return {**empty, "dry_run": True, "holdings": len(market_holdings(trades, as_of=date.today()))}

        if db is None:
            db = get_db()
        portfolio_id = self._resolve_portfolio_id(db)
        fresh = self._insert_trades(db, trades)
        leaders = self._upsert_leaderboard(db, leaderboard)
        alerts = self._insert_alerts(db, portfolio_id, fresh)
        holding_count = self._sync_holdings(db, trades)
        log(
            f"[polymarket] {len(fresh)} apuestas nuevas de {len(trades)}; "
            f"{leaders} billeteras; {alerts} alertas; {holding_count} holdings"
        )
        if fresh:
            log("[polymarket] alertas publicadas: " + ALERT_TITLE)
        return {
            **empty,
            "holdings": holding_count,
            "new_trades": len(fresh),
            "alerts": alerts,
            "dry_run": False,
        }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Polymarket: grandes apuestas en política y economía"
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Lee las APIs y no escribe en Supabase"
    )
    args = parser.parse_args()
    adapter = PolymarketAdapter(dry_run=args.dry_run)
    log(f"[polymarket] Result: {adapter.run()}")
