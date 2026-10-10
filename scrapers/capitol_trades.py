"""
Capitol Trades scraper — political trading disclosures (Pelosi, Trump, etc.)

Source: https://www.capitoltrades.com (public API endpoints)
Feeds portfolios: pelosi-tracker, trump-trades (and others in political_us).

NOTE: This site may rate-limit or block scrapers. The scraper uses polite
headers and retries. If the site structure changes, update the parsing.
"""

from __future__ import annotations

import json
import re
from datetime import date

from base import Holding, SourceAdapter, log


class CapitolTradesAdapter(SourceAdapter):
    name = "capitol_trades"
    portfolio_slug = "pelosi-tracker"  # default; override per politician

    # Politician slug -> portfolio slug mapping
    POLITICIANS = {
        "pelosi": "pelosi-tracker",
        "trump": "trump-trades",
    }

    def __init__(self, politician: str = "pelosi") -> None:
        super().__init__()
        self.politician = politician.lower()
        self.portfolio_slug = self.POLITICIANS.get(self.politician, "pelosi-tracker")

    def fetch_raw(self) -> list[dict]:
        """
        Fetch recent trades for the politician.

        Capitol Trades is a React Server Components app that streams data via
        self.__next_f.push() chunks. Note: public pages may return an empty
        dataset (login wall) — the adapter detects this and logs it.
        """
        url = f"https://www.capitoltrades.com/trades?politician={self.politician}&pageSize=50"
        try:
            resp = self.client.get(url)
            resp.raise_for_status()
            html = resp.text

            # RSC streaming payload
            chunks = re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)', html, re.DOTALL)
            if not chunks:
                log(f"[{self.name}] No RSC stream found")
                return []
            full = "".join(chunks)
            full = full.replace('\\"', '"').replace("\\n", "\n")

            # Detect login wall: the data array is empty
            if '"data":[]' in full or '"totalCount":0' in full:
                log(
                    f"[{self.name}] Capitol Trades requires login for {self.politician} "
                    "(public dataset empty). See docs/sources.md for alternatives."
                )
                return []

            # The trades array appears as JSON objects with txDate/txType/value.
            # Extract each {...} block containing those fields.
            trades: list[dict] = []
            for match in re.finditer(r'\{[^{}]*"txDate"[^{}]*\}', full):
                try:
                    trades.append(json.loads(match.group(0)))
                except json.JSONDecodeError:
                    continue

            log(f"[{self.name}] Parsed {len(trades)} trades for {self.politician}")
            return trades
        except Exception as e:
            log(f"[{self.name}] fetch error: {e}")
            return []

    def normalize(self, raw: list[dict]) -> list[Holding]:
        """
        Convert Capitol Trades data into portfolio holdings.
        We approximate a "portfolio" from the most recent trades:
        group by ticker, weight by trade value.
        """
        from collections import defaultdict

        by_ticker: dict[str, dict] = defaultdict(lambda: {"value": 0.0, "name": "", "buys": 0, "sells": 0})

        for trade in raw:
            ticker = (trade.get("asset", {}).get("ticker") or "").upper()
            if not ticker or ticker == "N/A":
                continue
            value = self._parse_value(trade.get("value"))
            tx_type = (trade.get("txType") or "").lower()

            entry = by_ticker[ticker]
            entry["name"] = trade.get("asset", {}).get("name", ticker)
            if "buy" in tx_type or "purchase" in tx_type:
                entry["buys"] += 1
                entry["value"] += value
            elif "sell" in tx_type or "sale" in tx_type:
                entry["sells"] += 1
                entry["value"] += value

        total = sum(e["value"] for e in by_ticker.values())
        if total <= 0:
            return []

        holdings = []
        for ticker, e in by_ticker.items():
            weight = (e["value"] / total) * 100
            if weight < 0.1:
                continue
            holdings.append(
                Holding(
                    symbol=ticker,
                    name=e["name"],
                    weight=round(weight, 2),
                    asset_class="equity",
                    currency="USD",
                )
            )
        return holdings

    @staticmethod
    def _parse_value(value_str: str | None) -> float:
        """Parse ranges like '$1K - $15K' into a midpoint estimate."""
        if not value_str:
            return 0.0
        s = str(value_str).replace("$", "").replace(",", "").strip()

        def to_num(part: str) -> float:
            part = part.strip()
            mult = 1.0
            if part.endswith("K"):
                mult, part = 1_000, part[:-1]
            elif part.endswith("M"):
                mult, part = 1_000_000, part[:-1]
            try:
                return float(part) * mult
            except ValueError:
                return 0.0

        if "-" in s or "–" in s:
            parts = s.replace("–", "-").split("-")
            if len(parts) == 2:
                return (to_num(parts[0]) + to_num(parts[1])) / 2
        return to_num(s)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Scrape Capitol Trades for a politician")
    parser.add_argument("--politician", default="pelosi", help="pelosi | trump")
    args = parser.parse_args()

    adapter = CapitolTradesAdapter(politician=args.politician)
    result = adapter.run()
    log(f"[{adapter.name}] Result: {result}")
