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


def consolidate_holdings(holdings: list[Holding]) -> list[Holding]:
    """D39: una fila por (simbolo, as_of) y pesos que no pasan de 100.

    Si un adapter entrega el mismo ticker dos veces en el mismo snapshot
    (ej. una fila por mencion), se suman los pesos. Si el snapshot suma mas
    de 100 se escala a 100 (la ultima fila absorbe el redondeo). Un snapshot
    que suma menos (top-N, caja no informada) no se infla.
    """
    by_key: dict[tuple[str, Any], Holding] = {}
    for h in holdings:
        sym = (h.symbol or "").strip().upper()
        if not sym:
            continue
        key = (sym, h.as_of)
        if key in by_key:
            prev = by_key[key]
            by_key[key] = Holding(prev.symbol, prev.name, round(prev.weight + h.weight, 6), prev.asset_class,
                                  prev.exchange, prev.currency, prev.as_of)
        else:
            by_key[key] = Holding(sym, h.name, h.weight, h.asset_class, h.exchange, h.currency, h.as_of)
    out: list[Holding] = []
    for as_of in sorted({k[1] for k in by_key}, key=str):
        snap = sorted((h for (s, d), h in by_key.items() if d == as_of), key=lambda h: (-h.weight, h.symbol))
        total = sum(max(h.weight, 0.0) for h in snap)
        if total > 100.05:
            assigned = 0.0
            for i, h in enumerate(snap):
                h.weight = round(100.0 - assigned, 2) if i == len(snap) - 1 else round(h.weight / total * 100.0, 2)
                assigned += h.weight
        else:
            for h in snap:
                h.weight = round(h.weight, 6)
        out.extend(snap)
    return out


class SourceAdapter(ABC):
    """Base class for all data sources."""

    name: str = "base"
    # Portfolio slug this adapter feeds (must exist in portfolios table)
    portfolio_slug: str = ""

    def __init__(self, dry_run: bool = False) -> None:
        self.client = httpx.Client(
            headers=DEFAULT_HEADERS,
            timeout=30.0,
            follow_redirects=True,
        )
        # --dry-run: nunca escribir en Supabase (pruebas sin side effects)
        self.dry_run = dry_run

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
        """Full pipeline: fetch -> normalize -> (upsert | dry-run). Returns a summary."""
        if db is None and not self.dry_run:
            db = get_db()
        raw = self.fetch_raw()
        holdings = consolidate_holdings(self.normalize(raw))

        if not holdings:
            return {"source": self.name, "holdings": 0, "status": "empty"}

        if self.dry_run:
            log(
                f"[{self.name}] DRY-RUN: {len(holdings)} holdings NO escritos "
                f"(portfolio {self.portfolio_slug}, top: "
                f"{holdings[0].symbol} {holdings[0].weight}%)"
            )
            return {
                "source": self.name,
                "portfolio": self.portfolio_slug,
                "holdings": len(holdings),
                "status": "ok",
                "dry_run": True,
            }

        portfolio_id = self._resolve_portfolio_id(db)

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

        removed = self._remove_stale(db, portfolio_id, holdings)

        return {
            "source": self.name,
            "portfolio": self.portfolio_slug,
            "holdings": len(holdings),
            "created": created,
            "updated": updated,
            "removed": removed,
            "status": "ok",
        }

    def _remove_stale(self, db, portfolio_id: str, holdings: list[Holding]) -> int:
        """D43: borra las filas del MISMO snapshot (portafolio + as_of) que esta
        corrida ya no trae. Sin esto, dos escrituras el mismo dia se suman
        (radar-ia 2026-10-22: 15 filas, 200%). Snapshots de otras fechas no
        se tocan. Un fallo aqui no tumba la corrida."""
        keep = {(h.symbol, h.as_of.isoformat()) for h in holdings}
        removed = 0
        try:
            for as_of in sorted({h.as_of.isoformat() for h in holdings}):
                rows = (db.table("holdings").select("id, symbol").eq("portfolio_id", portfolio_id)
                        .eq("as_of", as_of).execute().data or [])
                stale = [r["id"] for r in rows if (r.get("symbol"), as_of) not in keep]
                for i in range(0, len(stale), 200):
                    db.table("holdings").delete().in_("id", stale[i:i + 200]).execute()
                removed += len(stale)
        except Exception as exc:  # noqa: BLE001
            log(f"[{self.name}] WARNING limpieza de snapshot: {exc}")
        return removed

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
    # maybe_single() sin filas devuelve None en postgrest 2.x: se normaliza.
    from supabase_compat import patch_maybe_single

    patch_maybe_single()
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def log(msg: str) -> None:
    """Timestamped log line."""
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)
