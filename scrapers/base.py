"""
Base classes and shared utilities for reclu.cl scrapers.

Each source (Capitol Trades, Renta 4, InfoProbidad...) implements a
SourceAdapter that:
  1. fetch_raw()  -> downloads/parses the source
  2. normalize()  -> converts to the canonical Holding schema
  3. upsert()     -> writes to Supabase with previous_weight change detection

Change detection: before updating a holding, the old weight is stored in
previous_weight. The detect-changes edge function then turns deltas into alerts.
"""

from __future__ import annotations

import os
import sys
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

import httpx
from supabase import create_client, Client

# --- Config from env ---
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 reclu-scraper/1.0",
    "Accept": "text/html,application/json,*/*",
    "Accept-Language": "es-CL,es;q=0.9,en;q=0.8",
}


@dataclass
class Holding:
    """Canonical holding record — mirrors the Supabase holdings table."""

    symbol: str
    name: str
    weight: float  # 0-100
    asset_class: str = "equity"  # equity | fund | etf | cash | bond | other
    exchange: str | None = None
    currency: str = "USD"
    as_of: date = field(default_factory=date.today)


class SourceAdapter(ABC):
    """Base class for all data sources."""

    name: str = "base"
    # Portfolio slug this adapter feeds (must exist in portfolios table)
    portfolio_slug: str = ""

    def __init__(self) -> None:
        self.client = httpx.Client(
            headers=DEFAULT_HEADERS,
            timeout=30.0,
            follow_redirects=True,
        )

    # --- Subclass implements these ---

    @abstractmethod
    def fetch_raw(self) -> Any:
        """Download and return raw data from the source."""
        ...

    @abstractmethod
    def normalize(self, raw: Any) -> list[Holding]:
        """Convert raw data into canonical Holding records."""
        ...

    # --- Shared logic ---

    def run(self, db: Client | None = None) -> dict[str, Any]:
        """Full pipeline: fetch -> normalize -> upsert. Returns a summary."""
        db = db or get_db()
        portfolio_id = self._resolve_portfolio_id(db)

        raw = self.fetch_raw()
        holdings = self.normalize(raw)

        if not holdings:
            return {"source": self.name, "holdings": 0, "status": "empty"}

        updated = 0
        created = 0

        for h in holdings:
            existing = (
                db.table("holdings")
                .select("id, weight")
                .eq("portfolio_id", portfolio_id)
                .eq("symbol", h.symbol)
                .eq("as_of", h.as_of.isoformat())
                .maybe_single()
                .execute()
            )

            row = {
                "portfolio_id": portfolio_id,
                "symbol": h.symbol,
                "name": h.name,
                "weight": h.weight,
                "asset_class": h.asset_class,
                "exchange": h.exchange,
                "currency": h.currency,
                "as_of": h.as_of.isoformat(),
            }

            if existing and existing.data:
                old_weight = existing.data["weight"]
                if abs(old_weight - h.weight) < 0.01:
                    continue  # no change
                row["previous_weight"] = old_weight
                db.table("holdings").update(row).eq("id", existing.data["id"]).execute()
                updated += 1
            else:
                # New holding — previous_weight = 0 signals "new trade"
                row["previous_weight"] = 0.0
                db.table("holdings").insert(row).execute()
                created += 1

        return {
            "source": self.name,
            "portfolio": self.portfolio_slug,
            "holdings": len(holdings),
            "created": created,
            "updated": updated,
            "status": "ok",
        }

    def _resolve_portfolio_id(self, db: Client) -> str:
        result = (
            db.table("portfolios")
            .select("id")
            .eq("slug", self.portfolio_slug)
            .single()
            .execute()
        )
        if not result.data:
            raise RuntimeError(
                f"Portfolio '{self.portfolio_slug}' not found. Run supabase/schema.sql seed first."
            )
        return result.data["id"]


def get_db() -> Client:
    """Create a Supabase client with the service role key."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        sys.exit(
            "ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars are required.\n"
            "Export them before running the scraper."
        )
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def log(msg: str) -> None:
    """Timestamped log line."""
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)
